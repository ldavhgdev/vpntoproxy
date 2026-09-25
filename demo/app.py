#!/usr/bin/env python3
"""
Surf Proxy Manager
Biến các file cấu hình WireGuard của Surfshark thành dàn proxy SOCKS5/HTTP riêng biệt
(mỗi tunnel = 1 tiến trình wireproxy chạy userspace, không đụng tới card mạng của Windows).

Chỉ dùng thư viện chuẩn của Python 3.9+ — không cần pip install.
Chạy:  python app.py            (có cửa sổ console)
       pythonw app.py --open    (chạy ngầm, mở trình duyệt vào Web UI)
"""
import base64
import hashlib
import io
import ipaddress
import json
import logging
import os
import platform
import random
import re
import secrets
import signal
import socket
import subprocess
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from urllib.parse import parse_qs, quote, urlparse

# ----------------------------------------------------------------------------- đường dẫn
FROZEN = getattr(sys, "frozen", False)
BASE = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
RES = getattr(sys, "_MEIPASS", BASE)          # tài nguyên web khi đóng gói bằng PyInstaller
DATA = os.path.join(BASE, "data")
CONF_DIR = os.path.join(DATA, "configs")
RUN_DIR = os.path.join(DATA, "runtime")
LOG_DIR = os.path.join(DATA, "logs")
BIN_DIR = os.path.join(BASE, "bin")
WEB_DIR = os.path.join(RES, "web")
STATE_FILE = os.path.join(DATA, "state.json")
IS_WIN = os.name == "nt"
WP_EXE = os.path.join(BIN_DIR, "wireproxy.exe" if IS_WIN else "wireproxy")
NO_WINDOW = 0x08000000 if IS_WIN else 0
WP_REPOS = ["windtf/wireproxy", "whyvl/wireproxy", "pufferffish/wireproxy"]

for d in (DATA, CONF_DIR, RUN_DIR, LOG_DIR, BIN_DIR):
    os.makedirs(d, exist_ok=True)

log = logging.getLogger("spm")
log.setLevel(logging.INFO)
_fh = RotatingFileHandler(os.path.join(DATA, "app.log"), maxBytes=2_000_000, backupCount=2, encoding="utf-8")
_fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log.addHandler(_fh)
if sys.stdout:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    log.addHandler(logging.StreamHandler(sys.stdout))

DEFAULT_SETTINGS = {
    "ui_host": "127.0.0.1",
    "ui_port": 8686,
    "ui_password": "",
    "health_interval": 30,       # giây giữa 2 lần kiểm tra IP qua proxy
    "fail_threshold": 3,         # số lần lỗi liên tiếp trước khi tự khởi động lại tunnel
    "check_url": "https://www.cloudflare.com/cdn-cgi/trace",
    "keepalive": 25,
    "socks_base": 20001,
    "http_base": 30001,
    "export_host": "127.0.0.1",
}

# ----------------------------------------------------------------------------- tiện ích
def now():
    return time.time()


def safe_name(name):
    name = os.path.basename(name or "").strip()
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE)
    if not name.lower().endswith(".conf"):
        name += ".conf"
    return name[:120]


def parse_wg(text):
    """Đọc file .conf WireGuard -> {'interface': {...}, 'peer': {...}}"""
    out, cur = {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        m = re.match(r"^\[(\w+)\]$", line)
        if m:
            cur = m.group(1).lower()
            out.setdefault(cur, {})
            continue
        if cur and "=" in line:
            k, v = line.split("=", 1)
            out[cur][k.strip().lower()] = v.strip()
    return out


def validate_wg(text):
    c = parse_wg(text)
    i, p = c.get("interface", {}), c.get("peer", {})
    missing = [k for k, d in (("privatekey", i), ("address", i), ("publickey", p), ("endpoint", p)) if k not in d]
    if missing:
        raise ValueError("File thiếu trường: " + ", ".join(missing))
    return c


def split_endpoint(ep):
    ep = ep.strip()
    if ep.startswith("["):
        host, _, port = ep[1:].partition("]:")
    else:
        host, _, port = ep.rpartition(":")
    return host, int(port or 51820)


def is_ip(s):
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


def resolve_ipv4(host, port):
    try:
        infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_DGRAM)
        return sorted({i[4][0] for i in infos})
    except OSError:
        return []


def build_wg_runtime(text, endpoint, keepalive):
    """Viết lại file WireGuard: thay Endpoint, thêm PersistentKeepalive, bỏ các khóa wg-quick."""
    drop = {"postup", "postdown", "preup", "predown", "table", "saveconfig", "fwmark"}
    out, section, has_ka = [], None, False
    for raw in text.splitlines():
        line = raw.strip()
        m = re.match(r"^\[(\w+)\]$", line)
        if m:
            if section == "peer" and not has_ka and keepalive:
                out.append(f"PersistentKeepalive = {keepalive}")
            section, has_ka = m.group(1).lower(), False
            out.append(line)
            continue
        if "=" in line and not line.startswith("#"):
            k = line.split("=", 1)[0].strip().lower()
            if k in drop:
                continue
            if section == "peer" and k == "endpoint":
                line = f"Endpoint = {endpoint}"
            if section == "peer" and k == "persistentkeepalive":
                has_ka = True
        out.append(line)
    if section == "peer" and not has_ka and keepalive:
        out.append(f"PersistentKeepalive = {keepalive}")
    return "\n".join(out) + "\n"


def port_free(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if not IS_WIN:  # Linux/macOS: bỏ qua TIME_WAIT (Windows không cần, và REUSEADDR ở Windows có nghĩa khác)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((host if host not in ("", "0.0.0.0") else "0.0.0.0", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def port_open(host, port, timeout=0.5):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def tail(path, size=12000):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            n = f.tell()
            f.seek(max(0, n - size))
            return f.read().decode("utf-8", "replace")
    except OSError:
        return ""


def kill_pid(pid):
    """Diệt tiến trình wireproxy mồ côi từ lần chạy trước (chỉ khi đúng là wireproxy)."""
    if not pid:
        return
    try:
        if IS_WIN:
            out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                                 capture_output=True, text=True, creationflags=NO_WINDOW).stdout
            if "wireproxy" in out.lower():
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, creationflags=NO_WINDOW)
        else:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                if b"wireproxy" in f.read():
                    os.kill(pid, signal.SIGKILL)
    except Exception:
        pass


def download_wireproxy():
    arch = platform.machine().lower()
    arch = "arm64" if arch in ("arm64", "aarch64") else "amd64"
    osname = "windows" if IS_WIN else ("darwin" if sys.platform == "darwin" else "linux")
    asset = f"wireproxy_{osname}_{arch}.tar.gz"
    last_err = None
    for repo in WP_REPOS:
        url = f"https://github.com/{repo}/releases/latest/download/{asset}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SurfProxyManager"})
            with urllib.request.urlopen(req, timeout=60) as r:
                blob = r.read()
            with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
                for m in tf.getmembers():
                    if os.path.basename(m.name).startswith("wireproxy") and m.isfile():
                        data = tf.extractfile(m).read()
                        with open(WP_EXE, "wb") as f:
                            f.write(data)
                        if not IS_WIN:
                            os.chmod(WP_EXE, 0o755)
                        log.info("Đã tải wireproxy từ %s", url)
                        return wp_version()
            last_err = "Không tìm thấy wireproxy trong gói tải về"
        except Exception as e:  # thử repo kế tiếp
            last_err = str(e)
    raise RuntimeError(f"Tải wireproxy thất bại: {last_err}")


def wp_version():
    if not os.path.isfile(WP_EXE):
        return None
    try:
        out = subprocess.run([WP_EXE, "--version"], capture_output=True, text=True, timeout=10,
                             creationflags=NO_WINDOW)
        return (out.stdout or out.stderr).strip().splitlines()[-1]
    except Exception as e:
        return f"lỗi: {e}"


# ----------------------------------------------------------------------------- lõi quản lý
class Runtime:
    """Trạng thái sống của 1 tunnel (không lưu xuống đĩa, trừ pid)."""

    def __init__(self):
        self.proc = None
        self.status = "stopped"      # stopped | starting | online | degraded | recovering | error
        self.error = ""
        self.ip = ""
        self.country = ""
        self.colo = ""
        self.latency = None
        self.last_check = 0
        self.next_check = 0
        self.fails = 0
        self.restarts = 0
        self.started_at = 0
        self.last_rotate = 0
        self.retry_at = 0
        self.backoff = 0
        self.endpoint = ""
        self.endpoint_ip = ""
        self.checking = False
        self.history = []            # [(ts, ip, country)]
        self.hard_fails = 0          # lỗi liên tiếp kể cả sau restart -> bỏ random server


class Manager:
    def __init__(self):
        self.lock = threading.RLock()
        self.settings = dict(DEFAULT_SETTINGS)
        self.tunnels = {}            # id -> dict cấu hình
        self.rt = {}                 # id -> Runtime
        self.stop_evt = threading.Event()
        self._load()

    # ---------- lưu trữ
    def _load(self):
        if not os.path.isfile(STATE_FILE):
            return
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                st = json.load(f)
            self.settings.update(st.get("settings", {}))
            for t in st.get("tunnels", []):
                self.tunnels[t["id"]] = t
                self.rt[t["id"]] = Runtime()
                kill_pid(t.pop("pid", None))
        except Exception as e:
            log.error("Không đọc được state.json: %s", e)

    def save(self):
        with self.lock:
            tunnels = []
            for tid, t in self.tunnels.items():
                d = dict(t)
                p = self.rt[tid].proc
                d["pid"] = p.pid if p and p.poll() is None else None
                tunnels.append(d)
            tmp = STATE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"settings": self.settings, "tunnels": tunnels}, f, ensure_ascii=False, indent=2)
            os.replace(tmp, STATE_FILE)

    # ---------- thư viện file .conf
    def list_confs(self):
        res = []
        used = {}
        for t in self.tunnels.values():
            for c in t["confs"]:
                used.setdefault(c, []).append(t["name"])
        for name in sorted(os.listdir(CONF_DIR)):
            if not name.lower().endswith(".conf"):
                continue
            try:
                with open(os.path.join(CONF_DIR, name), encoding="utf-8") as f:
                    c = parse_wg(f.read())
                ep = c.get("peer", {}).get("endpoint", "")
                key = hashlib.sha256(c.get("interface", {}).get("privatekey", "").encode()).hexdigest()[:8]
            except Exception:
                ep, key = "?", "?"
            res.append({"name": name, "endpoint": ep, "key": key, "used_by": used.get(name, [])})
        return res

    def add_conf(self, filename, content):
        validate_wg(content)
        name = safe_name(filename)
        with open(os.path.join(CONF_DIR, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(content.replace("\r\n", "\n"))
        return name

    def delete_conf(self, name):
        name = safe_name(name)
        for t in self.tunnels.values():
            if name in t["confs"]:
                raise ValueError(f"File đang được tunnel '{t['name']}' dùng")
        p = os.path.join(CONF_DIR, name)
        if os.path.isfile(p):
            os.remove(p)

    def read_conf(self, name):
        with open(os.path.join(CONF_DIR, safe_name(name)), encoding="utf-8") as f:
            return f.read()

    # ---------- cổng
    def used_ports(self, exclude=None):
        ports = set()
        for tid, t in self.tunnels.items():
            if tid != exclude:
                ports.update((t["socks_port"], t["http_port"]))
        ports.add(int(self.settings["ui_port"]))
        return ports

    def next_port(self, base, extra=()):
        used = self.used_ports() | set(extra)
        p = int(base)
        while p in used or not port_free("127.0.0.1", p):
            p += 1
            if p > 65000:
                raise ValueError("Hết cổng trống")
        return p

    # ---------- CRUD tunnel
    def _clean(self, data, tid=None):
        confs = [safe_name(c) for c in data.get("confs", []) if c]
        if not confs:
            raise ValueError("Chọn ít nhất 1 file cấu hình WireGuard")
        for c in confs:
            if not os.path.isfile(os.path.join(CONF_DIR, c)):
                raise ValueError(f"Không có file {c}")
        sp, hp = int(data.get("socks_port") or 0), int(data.get("http_port") or 0)
        for p in (sp, hp):
            if not 1024 <= p <= 65535:
                raise ValueError("Cổng phải nằm trong khoảng 1024–65535")
        if sp == hp:
            raise ValueError("Cổng SOCKS5 và HTTP phải khác nhau")
        clash = self.used_ports(exclude=tid) & {sp, hp}
        if clash:
            raise ValueError(f"Cổng {', '.join(map(str, clash))} đã được dùng")
        bind = data.get("bind", "127.0.0.1").strip() or "127.0.0.1"
        if bind != "0.0.0.0" and not is_ip(bind):
            raise ValueError("Địa chỉ bind không hợp lệ")
        user, pw = str(data.get("username", "")).strip(), str(data.get("password", "")).strip()
        if bool(user) != bool(pw):
            raise ValueError("Nhập đủ cả tên đăng nhập và mật khẩu, hoặc để trống cả hai")
        if bind == "0.0.0.0" and not user:
            raise ValueError("Mở proxy ra mạng LAN (0.0.0.0) bắt buộc phải đặt tài khoản/mật khẩu")
        return {
            "name": (str(data.get("name", "")).strip() or confs[0][:-5])[:60],
            "confs": confs,
            "socks_port": sp,
            "http_port": hp,
            "bind": bind,
            "username": user,
            "password": pw,
            "rotate_minutes": max(0, int(data.get("rotate_minutes") or 0)),
            "random_server": bool(data.get("random_server", True)),
            "enabled": bool(data.get("enabled", False)),
        }

    def create(self, data):
        with self.lock:
            if not data.get("socks_port"):
                data["socks_port"] = self.next_port(self.settings["socks_base"])
            if not data.get("http_port"):
                data["http_port"] = self.next_port(self.settings["http_base"], extra=[int(data["socks_port"])])
            t = self._clean(data)
            t["id"] = secrets.token_hex(4)
            t["conf_index"] = 0
            t["created"] = int(now())
            self.tunnels[t["id"]] = t
            self.rt[t["id"]] = Runtime()
            self.save()
            if t["enabled"]:
                self.start(t["id"])
            return t

    def bulk_create(self, confs, data):
        created = []
        for c in confs:
            d = dict(data)
            d.update({"confs": [c], "name": safe_name(c)[:-5], "socks_port": 0, "http_port": 0})
            created.append(self.create(d))
        return created

    def update(self, tid, data):
        with self.lock:
            old = self.tunnels[tid]
            merged = dict(old)
            merged.update(data)
            t = self._clean(merged, tid=tid)
            t.update({"id": tid, "conf_index": min(old.get("conf_index", 0), len(t["confs"]) - 1),
                      "created": old.get("created", int(now()))})
            t["enabled"] = old["enabled"]
            self.tunnels[tid] = t
            self.save()
            if self._running(tid):
                self.restart(tid, reason="đổi cấu hình")
            return t

    def delete(self, tid):
        with self.lock:
            self.stop(tid)
            self.tunnels.pop(tid, None)
            self.rt.pop(tid, None)
            for ext in (".wg.conf", ".wireproxy.conf"):
                try:
                    os.remove(os.path.join(RUN_DIR, tid + ext))
                except OSError:
                    pass
            self.save()

    # ---------- tiến trình
    def _running(self, tid):
        p = self.rt[tid].proc
        return p is not None and p.poll() is None

    def _choose_endpoint(self, tid, conf_text):
        t, rt = self.tunnels[tid], self.rt[tid]
        c = parse_wg(conf_text)
        ep = c["peer"]["endpoint"]
        host, port = split_endpoint(ep)
        key = c["interface"]["privatekey"]
        # Các server đang được tunnel khác dùng CHUNG private key: tránh trùng, vì
        # cùng 1 key kết nối 2 lần vào 1 server sẽ đá nhau rớt mạng.
        taken = set()
        for oid, o in self.tunnels.items():
            if oid == tid or not self._running(oid):
                continue
            try:
                ok = parse_wg(self.read_conf(o["confs"][o.get("conf_index", 0) % len(o["confs"])]))
                if ok["interface"]["privatekey"] == key:
                    taken.add(self.rt[oid].endpoint_ip or self.rt[oid].endpoint)
            except Exception:
                pass
        if is_ip(host) or not t.get("random_server", True) or rt.hard_fails >= 2:
            return ep, host, ("Trùng server với tunnel khác cùng key" if host in taken or ep in taken else "")
        ips = resolve_ipv4(host, port)
        if not ips:
            return ep, "", ""
        free = [i for i in ips if i not in taken]
        pool = [i for i in free if i != rt.endpoint_ip] or free
        if not pool:
            return f"{random.choice(ips)}:{port}", "", "Mọi server của vị trí này đều đang bị tunnel khác cùng key chiếm — nên tạo thêm cặp key WireGuard"
        ip = random.choice(pool)
        return f"{ip}:{port}", ip, ""

    def start(self, tid):
        with self.lock:
            t, rt = self.tunnels[tid], self.rt[tid]
            t["enabled"] = True
            if self._running(tid) or self.stop_evt.is_set():
                return
            if not os.path.isfile(WP_EXE):
                rt.status, rt.error = "error", "Chưa có wireproxy — bấm 'Tải wireproxy' trong phần Cài đặt"
                self.save()
                return
            probe = "127.0.0.1" if t["bind"] == "0.0.0.0" else t["bind"]
            for p in (t["socks_port"], t["http_port"]):
                if not port_free(t["bind"], p) or port_open(probe, p, 0.2):
                    rt.status, rt.error = "error", f"Cổng {p} đang bị chương trình khác chiếm"
                    rt.retry_at = now() + 15
                    self.save()
                    return
            conf_name = t["confs"][t.get("conf_index", 0) % len(t["confs"])]
            try:
                text = self.read_conf(conf_name)
                validate_wg(text)
            except Exception as e:
                rt.status, rt.error = "error", f"Lỗi file {conf_name}: {e}"
                self.save()
                return
            ep, ep_ip, warn = self._choose_endpoint(tid, text)
            wg_path = os.path.join(RUN_DIR, tid + ".wg.conf")
            cfg_path = os.path.join(RUN_DIR, tid + ".wireproxy.conf")
            with open(wg_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(build_wg_runtime(text, ep, self.settings["keepalive"]))
            auth = f"Username = {t['username']}\nPassword = {t['password']}\n" if t["username"] else ""
            with open(cfg_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(f"WGConfig = {wg_path.replace(os.sep, '/')}\n\n"
                        f"[Socks5]\nBindAddress = {t['bind']}:{t['socks_port']}\n{auth}\n"
                        f"[http]\nBindAddress = {t['bind']}:{t['http_port']}\n{auth}")
            logf_path = os.path.join(LOG_DIR, tid + ".log")
            if os.path.isfile(logf_path) and os.path.getsize(logf_path) > 1_000_000:
                os.replace(logf_path, logf_path + ".old")
            logf = open(logf_path, "ab")
            logf.write(f"\n==== {time.strftime('%Y-%m-%d %H:%M:%S')} khởi động {conf_name} -> {ep}\n".encode())
            logf.flush()
            try:
                rt.proc = subprocess.Popen([WP_EXE, "-c", cfg_path], stdout=logf, stderr=subprocess.STDOUT,
                                           stdin=subprocess.DEVNULL, cwd=RUN_DIR, creationflags=NO_WINDOW)
            except Exception as e:
                rt.status, rt.error = "error", f"Không chạy được wireproxy: {e}"
                logf.close()
                self.save()
                return
            logf.close()
            rt.status, rt.error = "starting", warn
            rt.endpoint, rt.endpoint_ip = ep, ep_ip
            rt.started_at = now()
            rt.fails = 0
            rt.next_check = now() + 3
            rt.last_rotate = rt.last_rotate or now()
            log.info("[%s] start %s -> %s (pid %s)", t["name"], conf_name, ep, rt.proc.pid)
            self.save()

    def _kill(self, tid):
        rt = self.rt[tid]
        p = rt.proc
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(4)
            except subprocess.TimeoutExpired:
                p.kill()
        rt.proc = None

    def stop(self, tid):
        with self.lock:
            if tid not in self.tunnels:
                return
            self.tunnels[tid]["enabled"] = False
            self._kill(tid)
            rt = self.rt[tid]
            rt.status, rt.error, rt.latency = "stopped", "", None
            rt.backoff, rt.hard_fails = 0, 0
            self.save()

    def restart(self, tid, reason="thủ công"):
        with self.lock:
            log.info("[%s] restart (%s)", self.tunnels[tid]["name"], reason)
            self._kill(tid)
            self.rt[tid].restarts += reason != "thủ công"
            self.start(tid)

    def rotate(self, tid):
        """Đổi IP: chuyển sang file cấu hình kế tiếp (nếu tunnel có nhiều vị trí),
        và/hoặc kết nối lại tới 1 server khác trong cùng vị trí."""
        with self.lock:
            t = self.tunnels[tid]
            if len(t["confs"]) > 1:
                t["conf_index"] = (t.get("conf_index", 0) + 1) % len(t["confs"])
            self.rt[tid].last_rotate = now()
            self.rt[tid].hard_fails = 0
            self._kill(tid)
            self.start(tid)

    def stop_all(self):
        with self.lock:
            for tid in list(self.tunnels):
                self._kill(tid)
            self.save()

    # ---------- kiểm tra sức khỏe
    def _check(self, tid):
        rt = self.rt[tid]
        try:
            with self.lock:
                t = dict(self.tunnels[tid])
            host = "127.0.0.1" if t["bind"] == "0.0.0.0" else t["bind"]
            auth = f"{quote(t['username'], safe='')}:{quote(t['password'], safe='')}@" if t["username"] else ""
            proxy = f"http://{auth}{host}:{t['http_port']}"
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
            t0 = now()
            body = opener.open(urllib.request.Request(self.settings["check_url"],
                                                      headers={"User-Agent": "Mozilla/5.0"}), timeout=12).read()
            ms = int((now() - t0) * 1000)
            kv = dict(l.split("=", 1) for l in body.decode("utf-8", "replace").splitlines() if "=" in l)
            ip = kv.get("ip", "").strip()
            if not ip:
                raise ValueError("Phản hồi không có IP")
            with self.lock:
                if ip != rt.ip:
                    rt.history.insert(0, [int(now()), ip, kv.get("loc", "")])
                    del rt.history[10:]
                rt.ip, rt.country, rt.colo, rt.latency = ip, kv.get("loc", ""), kv.get("colo", ""), ms
                rt.fails, rt.hard_fails, rt.backoff = 0, 0, 0
                if rt.status in ("starting", "degraded", "recovering"):
                    rt.status = "online"
                if rt.error.startswith("Kiểm tra lỗi"):
                    rt.error = ""
        except Exception as e:
            with self.lock:
                rt.fails += 1
                rt.latency = None
                msg = str(getattr(e, "reason", e))[:160]
                rt.error = f"Kiểm tra lỗi ({rt.fails}/{self.settings['fail_threshold']}): {msg}"
                grace = now() - rt.started_at < 20
                if rt.status == "online" or not grace:
                    rt.status = "degraded"
                if rt.fails >= int(self.settings["fail_threshold"]) and not grace:
                    rt.hard_fails += 1
                    rt.status = "recovering"
                    self.restart(tid, reason="mất kết nối")
        finally:
            rt.last_check = now()
            interval = int(self.settings["health_interval"])
            rt.next_check = now() + (interval if rt.fails == 0 else min(10, interval))
            rt.checking = False

    def check_now(self, tid):
        rt = self.rt[tid]
        if rt.checking or not self._running(tid):
            return
        rt.checking = True
        threading.Thread(target=self._check, args=(tid,), daemon=True).start()

    # ---------- vòng giám sát
    def supervise(self):
        while not self.stop_evt.wait(2):
            try:
                with self.lock:
                    ids = list(self.tunnels)
                for tid in ids:
                    with self.lock:
                        t, rt = self.tunnels.get(tid), self.rt.get(tid)
                        if not t or not t["enabled"]:
                            continue
                        if rt.proc is not None and rt.proc.poll() is not None:
                            code = rt.proc.returncode
                            last = tail(os.path.join(LOG_DIR, tid + ".log"), 600).strip().splitlines()
                            rt.error = f"wireproxy đã thoát (mã {code}): {last[-1] if last else ''}"[:220]
                            rt.status = "recovering"
                            rt.proc = None
                            rt.backoff = min(60, max(5, rt.backoff * 2))
                            rt.retry_at = now() + rt.backoff
                            rt.hard_fails += 1
                            log.warning("[%s] %s", t["name"], rt.error)
                        if rt.proc is None:
                            if now() >= rt.retry_at:
                                rt.restarts += rt.status in ("recovering", "error")
                                self.start(tid)
                            continue
                        rm = t.get("rotate_minutes", 0)
                        if rm and now() - rt.last_rotate >= rm * 60:
                            log.info("[%s] xoay IP theo lịch", t["name"])
                            self.rotate(tid)
                            continue
                    if now() >= rt.next_check:
                        self.check_now(tid)
            except Exception:
                log.error("Lỗi vòng giám sát:\n%s", __import__("traceback").format_exc())

    # ---------- xuất dữ liệu cho UI
    def snapshot(self):
        with self.lock:
            keys = {}
            items = []
            for tid, t in self.tunnels.items():
                rt = self.rt[tid]
                conf = t["confs"][t.get("conf_index", 0) % len(t["confs"])]
                try:
                    k = hashlib.sha256(parse_wg(self.read_conf(conf))["interface"]["privatekey"].encode()).hexdigest()[:8]
                except Exception:
                    k = "?"
                keys.setdefault(k, 0)
                keys[k] += 1
                d = {k2: v for k2, v in t.items()}
                d.update({
                    "status": rt.status if t["enabled"] or rt.status == "error" else "stopped",
                    "running": self._running(tid), "error": rt.error, "ip": rt.ip, "country": rt.country,
                    "colo": rt.colo, "latency": rt.latency, "last_check": rt.last_check,
                    "restarts": rt.restarts, "uptime": int(now() - rt.started_at) if self._running(tid) else 0,
                    "endpoint": rt.endpoint, "active_conf": conf, "key": k, "history": rt.history,
                    "next_rotate": int(rt.last_rotate + t["rotate_minutes"] * 60 - now())
                    if t["rotate_minutes"] and self._running(tid) else None,
                })
                items.append(d)
            items.sort(key=lambda x: x["socks_port"])
            return {"tunnels": items, "settings": {k: v for k, v in self.settings.items() if k != "ui_password"},
                    "has_password": bool(self.settings["ui_password"]), "shared_keys": keys,
                    "wireproxy": wp_version(), "lan_ip": lan_ip(), "confs": self.list_confs()}

    def export(self, ids, fmt, proto):
        host = self.settings.get("export_host") or "127.0.0.1"
        lines = []
        with self.lock:
            for tid in ids or [t["id"] for t in sorted(self.tunnels.values(), key=lambda x: x["socks_port"])]:
                t = self.tunnels.get(tid)
                if not t:
                    continue
                port = t["socks_port"] if proto == "socks5" else t["http_port"]
                u, p = t["username"], t["password"]
                if fmt == "host_port":
                    s = f"{host}:{port}" + (f":{u}:{p}" if u else "")
                elif fmt == "url":
                    s = f"{proto}://" + (f"{quote(u, safe='')}:{quote(p, safe='')}@" if u else "") + f"{host}:{port}"
                else:  # scheme_colon: socks5://host:port:user:pass
                    s = f"{proto}://{host}:{port}" + (f":{u}:{p}" if u else "")
                lines.append(s)
        return "\n".join(lines)


M = Manager()

# ----------------------------------------------------------------------------- HTTP API
class Handler(BaseHTTPRequestHandler):
    server_version = "SurfProxyManager"

    def log_message(self, *a):
        pass

    def _auth_ok(self):
        pw = M.settings.get("ui_password")
        if not pw:
            return True
        h = self.headers.get("Authorization", "")
        if h.startswith("Basic "):
            try:
                _, _, given = base64.b64decode(h[6:]).decode().partition(":")
                return secrets.compare_digest(given, pw)
            except Exception:
                return False
        return False

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _guard(self):
        if self._auth_ok():
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Surf Proxy Manager"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def do_GET(self):
        if not self._guard():
            return
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path in ("/", "/index.html"):
            with open(os.path.join(WEB_DIR, "index.html"), "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        if u.path == "/api/state":
            return self._send(200, M.snapshot())
        m = re.match(r"^/api/tunnels/(\w+)/log$", u.path)
        if m:
            return self._send(200, {"log": tail(os.path.join(LOG_DIR, m.group(1) + ".log"))})
        m = re.match(r"^/api/confs/([^/]+)$", u.path)
        if m:
            try:
                text = M.read_conf(urllib.request.unquote(m.group(1)))
                text = re.sub(r"(?im)^(\s*PrivateKey\s*=\s*).+$", r"\1(ẩn)", text)
                return self._send(200, {"content": text})
            except OSError:
                return self._send(404, {"error": "Không có file"})
        if u.path == "/api/export":
            ids = [i for i in q.get("ids", [""])[0].split(",") if i]
            txt = M.export(ids, q.get("fmt", ["scheme_colon"])[0], q.get("proto", ["socks5"])[0])
            return self._send(200, txt, "text/plain; charset=utf-8")
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self._guard():
            return
        # Chống CSRF: chỉ chấp nhận request JSON từ chính giao diện
        if "application/json" not in self.headers.get("Content-Type", ""):
            return self._send(415, {"error": "Yêu cầu Content-Type application/json"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}") if n else {}
            return self._send(200, self._route(urlparse(self.path).path, data) or {"ok": True})
        except KeyError:
            return self._send(404, {"error": "Không tìm thấy tunnel"})
        except (ValueError, RuntimeError) as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:
            log.error("API lỗi: %s", e)
            return self._send(500, {"error": str(e)})

    def _route(self, path, d):
        if path == "/api/confs/upload":
            names, errors = [], []
            for f in d.get("files", []):
                try:
                    names.append(M.add_conf(f["name"], f["content"]))
                except Exception as e:
                    errors.append(f"{f.get('name')}: {e}")
            return {"saved": names, "errors": errors}
        if path == "/api/confs/delete":
            M.delete_conf(d["name"])
            return
        if path == "/api/tunnels":
            return M.create(d)
        if path == "/api/tunnels/bulk_create":
            return {"created": M.bulk_create(d.get("confs", []), d)}
        if path == "/api/bulk":
            act = d.get("action")
            for tid in d.get("ids", []):
                if tid in M.tunnels:
                    {"start": M.start, "stop": M.stop, "rotate": M.rotate,
                     "restart": M.restart, "delete": M.delete}[act](tid)
            return
        m = re.match(r"^/api/tunnels/(\w+)/(\w+)$", path)
        if m:
            tid, act = m.groups()
            if tid not in M.tunnels:
                raise KeyError(tid)
            if act == "update":
                return M.update(tid, d)
            if act == "check":
                M.check_now(tid)
                return
            {"start": M.start, "stop": M.stop, "restart": M.restart,
             "rotate": M.rotate, "delete": M.delete}[act](tid)
            return
        if path == "/api/settings":
            allowed = {"health_interval": int, "fail_threshold": int, "check_url": str, "keepalive": int,
                       "socks_base": int, "http_base": int, "export_host": str, "ui_host": str, "ui_port": int}
            for k, typ in allowed.items():
                if k in d:
                    M.settings[k] = typ(d[k])
            M.settings["health_interval"] = max(10, M.settings["health_interval"])
            M.settings["fail_threshold"] = max(1, M.settings["fail_threshold"])
            if "ui_password" in d:
                M.settings["ui_password"] = str(d["ui_password"])
            M.save()
            return
        if path == "/api/wireproxy/download":
            running = [tid for tid in M.tunnels if M._running(tid)]
            for tid in running:
                M._kill(tid)
            ver = download_wireproxy()
            return {"version": ver}
        if path == "/api/shutdown":
            threading.Thread(target=shutdown, daemon=True).start()
            return
        raise KeyError(path)


httpd = None


def shutdown(*_):
    log.info("Đang tắt: dừng mọi tunnel...")
    M.stop_evt.set()
    M.stop_all()
    if httpd:
        threading.Thread(target=httpd.shutdown, daemon=True).start()


def main():
    global httpd
    host, port = M.settings["ui_host"], int(M.settings["ui_port"])
    url = f"http://{'127.0.0.1' if host == '0.0.0.0' else host}:{port}/"
    if port_open("127.0.0.1" if host == "0.0.0.0" else host, port):
        log.info("Đã có 1 phiên đang chạy tại %s", url)
        if "--open" in sys.argv:
            webbrowser.open(url)
        return
    if host == "0.0.0.0" and not M.settings.get("ui_password"):
        log.warning("Web UI mở ra LAN mà chưa đặt mật khẩu — chuyển về 127.0.0.1")
        host = "127.0.0.1"
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, shutdown)
        except Exception:
            pass
    threading.Thread(target=M.supervise, daemon=True).start()
    for tid, t in list(M.tunnels.items()):
        if t.get("enabled"):
            M.start(tid)
    log.info("Surf Proxy Manager chạy tại %s  (wireproxy: %s)", url, wp_version() or "chưa có")
    if "--open" in sys.argv:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    try:
        httpd.serve_forever()
    finally:
        M.stop_evt.set()
        M.stop_all()
        log.info("Đã tắt.")


if __name__ == "__main__":
    main()
