#!/usr/bin/env node
/**
 * Proxy Manager - Convert WireGuard configs to SOCKS5/HTTP proxies
 * Node.js version for Ubuntu VPS
 *
 * Usage:
 *   node app.js                  - Start with console output
 *   node app.js --dev            - Development mode with hot reload
 *   node app.js --daemon         - Run in background
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const net = require('net');
const { EventEmitter } = require('events');

// ============================================================================
// CONFIGURATION
// ============================================================================

require('dotenv').config();

const config = {
  // Paths
  baseDir: process.env.BASE_DIR || __dirname,
  logDir: process.env.LOG_DIR || path.join(__dirname, 'logs'),
  configDir: process.env.CONFIG_DIR || path.join(__dirname, 'configs'),
  runtimeDir: process.env.RUNTIME_DIR || path.join(__dirname, 'runtime'),
  binDir: process.env.BIN_DIR || path.join(__dirname, 'bin'),
  stateFile: path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'state.json'),

  // Server
  host: process.env.APP_HOST || '127.0.0.1',
  port: parseInt(process.env.APP_PORT) || 8686,
  password: process.env.APP_PASSWORD || '',

  // Proxy ports
  socksBase: parseInt(process.env.SOCKS_BASE_PORT) || 20001,
  httpBase: parseInt(process.env.HTTP_BASE_PORT) || 30001,

  // Health checks
  healthInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30,
  failThreshold: parseInt(process.env.FAIL_THRESHOLD) || 3,
  checkUrl: 'https://www.cloudflare.com/cdn-cgi/trace',

  // WireGuard
  keepalive: parseInt(process.env.KEEPALIVE) || 25,
  wireproxyBin: path.join(process.env.BIN_DIR || path.join(__dirname, 'bin'), 'wireproxy'),
};

// Ensure directories exist
for (const dir of [config.logDir, config.configDir, config.runtimeDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================================
// LOGGER
// ============================================================================

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.logFile = path.join(logDir, 'app.log');
  }

  log(level, msg, ...args) {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} [${level}] ${msg}`;
    const formatted = `${message}\n`;

    // Console output
    console.log(formatted);

    // File output
    try {
      fs.appendFileSync(this.logFile, formatted);
    } catch (e) {
      console.error('Failed to write log:', e.message);
    }
  }

  info(msg, ...args) { this.log('INFO', msg, ...args); }
  warn(msg, ...args) { this.log('WARN', msg, ...args); }
  error(msg, ...args) { this.log('ERROR', msg, ...args); }
  debug(msg, ...args) { this.log('DEBUG', msg, ...args); }
}

const logger = new Logger(config.logDir);

// ============================================================================
// UTILITIES
// ============================================================================

function safeName(name) {
  if (!name) return 'config.conf';
  const base = path.basename(name).trim();
  const safe = base.replace(/[^\w.\-]/g, '_');
  const withExt = safe.toLowerCase().endsWith('.conf') ? safe : safe + '.conf';
  return withExt.slice(0, 120);
}

function parseWireGuardConfig(text) {
  const result = {};
  let currentSection = null;

  text.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return;

    const sectionMatch = trimmed.match(/^\[(\w+)\]$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      result[currentSection] = result[currentSection] || {};
      return;
    }

    if (currentSection && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      result[currentSection][key.trim().toLowerCase()] = rest.join('=').trim();
    }
  });

  return result;
}

function validateWireGuardConfig(text) {
  const parsed = parseWireGuardConfig(text);
  const iface = parsed.interface || {};
  const peer = parsed.peer || {};

  const required = {
    'privatekey': iface,
    'address': iface,
    'publickey': peer,
    'endpoint': peer,
  };

  const missing = Object.entries(required)
    .filter(([key, section]) => !section[key])
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing fields: ${missing.join(', ')}`);
  }

  return parsed;
}

function hashSHA256(data) {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
}

function portAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

function buildRuntimeWireGuardConfig(text, endpoint, keepalive) {
  const lines = text.split('\n');
  const result = [];
  let currentSection = null;
  let hasKeepalive = false;

  const dropKeys = new Set(['postup', 'postdown', 'preup', 'predown', 'table', 'saveconfig', 'fwmark']);

  lines.forEach(line => {
    const trimmed = line.trim();

    if (trimmed.match(/^\[(\w+)\]$/i)) {
      if (currentSection === 'peer' && !hasKeepalive && keepalive) {
        result.push(`PersistentKeepalive = ${keepalive}`);
      }
      currentSection = trimmed.match(/^\[(\w+)\]$/i)[1].toLowerCase();
      hasKeepalive = false;
      result.push(trimmed);
      return;
    }

    if (trimmed.includes('=') && !trimmed.startsWith('#')) {
      const [key] = trimmed.split('=');
      const keyLower = key.trim().toLowerCase();

      if (dropKeys.has(keyLower)) return;
      if (currentSection === 'peer' && keyLower === 'endpoint') {
        result.push(`Endpoint = ${endpoint}`);
        return;
      }
      if (currentSection === 'peer' && keyLower === 'persistentkeepalive') {
        hasKeepalive = true;
      }
    }

    result.push(line);
  });

  if (currentSection === 'peer' && !hasKeepalive && keepalive) {
    result.push(`PersistentKeepalive = ${keepalive}`);
  }

  return result.join('\n') + '\n';
}

function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ============================================================================
// TUNNEL RUNTIME
// ============================================================================

class TunnelRuntime {
  constructor() {
    this.proc = null;
    this.status = 'stopped'; // stopped | starting | online | degraded | recovering | error
    this.error = '';
    this.ip = '';
    this.country = '';
    this.latency = null;
    this.lastCheck = 0;
    this.nextCheck = 0;
    this.fails = 0;
    this.restarts = 0;
    this.startedAt = 0;
    this.lastRotate = 0;
    this.endpoint = '';
    this.endpointIp = '';
    this.checking = false;
    this.history = [];
    this.hardFails = 0;
  }

  isRunning() {
    return this.proc && !this.proc.killed;
  }
}

// ============================================================================
// MANAGER
// ============================================================================

class ProxyManager extends EventEmitter {
  constructor() {
    super();
    this.tunnels = {};
    this.runtime = {};
    this.settings = {
      ui_host: config.host,
      ui_port: config.port,
      ui_password: config.password,
      health_interval: config.healthInterval,
      fail_threshold: config.failThreshold,
      check_url: config.checkUrl,
      keepalive: config.keepalive,
      socks_base: config.socksBase,
      http_base: config.httpBase,
    };
    this.stopping = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(config.stateFile)) {
        const data = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
        this.settings.update(data.settings || {});
        for (const tunnel of data.tunnels || []) {
          this.tunnels[tunnel.id] = tunnel;
          this.runtime[tunnel.id] = new TunnelRuntime();
          // Kill orphaned processes
          if (tunnel.pid) {
            try { process.kill(tunnel.pid, 0); process.kill(tunnel.pid); } catch (e) {}
          }
        }
      }
    } catch (e) {
      logger.error('Failed to load state:', e.message);
    }
  }

  save() {
    try {
      const state = {
        settings: this.settings,
        tunnels: Object.entries(this.tunnels).map(([id, t]) => ({
          ...t,
          pid: this.runtime[id]?.proc?.pid || null,
        })),
      };
      const tmp = config.stateFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, config.stateFile);
    } catch (e) {
      logger.error('Failed to save state:', e.message);
    }
  }

  listConfigs() {
    const result = [];
    const used = {};

    for (const tunnel of Object.values(this.tunnels)) {
      for (const conf of tunnel.confs || []) {
        used[conf] = used[conf] || [];
        used[conf].push(tunnel.name);
      }
    }

    if (!fs.existsSync(config.configDir)) return result;

    for (const name of fs.readdirSync(config.configDir)) {
      if (!name.toLowerCase().endsWith('.conf')) continue;

      try {
        const content = fs.readFileSync(path.join(config.configDir, name), 'utf8');
        const parsed = parseWireGuardConfig(content);
        const key = hashSHA256(parsed.interface?.privatekey || '');
        const endpoint = parsed.peer?.endpoint || '';

        result.push({
          name,
          endpoint,
          key,
          used_by: used[name] || [],
        });
      } catch (e) {
        result.push({ name, endpoint: '?', key: '?', used_by: [] });
      }
    }

    return result;
  }

  addConfig(filename, content) {
    validateWireGuardConfig(content);
    const name = safeName(filename);
    const filepath = path.join(config.configDir, name);
    fs.writeFileSync(filepath, content.replace(/\r\n/g, '\n'), 'utf8');
    return name;
  }

  deleteConfig(name) {
    const safedName = safeName(name);
    for (const tunnel of Object.values(this.tunnels)) {
      if (tunnel.confs?.includes(safedName)) {
        throw new Error(`Config is in use by tunnel: ${tunnel.name}`);
      }
    }
    const filepath = path.join(config.configDir, safedName);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  readConfig(name) {
    return fs.readFileSync(path.join(config.configDir, safeName(name)), 'utf8');
  }

  usedPorts(excludeTid = null) {
    const ports = new Set();
    for (const [tid, tunnel] of Object.entries(this.tunnels)) {
      if (tid !== excludeTid) {
        ports.add(tunnel.socks_port);
        ports.add(tunnel.http_port);
      }
    }
    ports.add(this.settings.ui_port);
    return ports;
  }

  async findNextPort(base, extra = []) {
    const used = this.usedPorts();
    let port = parseInt(base);

    while (port <= 65535) {
      if (!used.has(port) && !extra.includes(port) && await portAvailable('127.0.0.1', port)) {
        return port;
      }
      port++;
    }

    throw new Error('No available ports');
  }

  validate(data, tid = null) {
    const confs = (data.confs || []).map(safeName).filter(Boolean);
    if (!confs.length) throw new Error('Select at least 1 config');

    for (const conf of confs) {
      if (!fs.existsSync(path.join(config.configDir, conf))) {
        throw new Error(`Config not found: ${conf}`);
      }
    }

    const sp = parseInt(data.socks_port);
    const hp = parseInt(data.http_port);

    for (const port of [sp, hp]) {
      if (!(1024 <= port && port <= 65535)) {
        throw new Error('Port must be 1024-65535');
      }
    }

    if (sp === hp) throw new Error('SOCKS and HTTP ports must differ');

    const clash = this.usedPorts(tid);
    const clashPorts = [...clash].filter(p => [sp, hp].includes(p));
    if (clashPorts.length) throw new Error(`Port in use: ${clashPorts.join(', ')}`);

    return {
      name: (data.name || confs[0].replace('.conf', '')).slice(0, 60),
      confs,
      socks_port: sp,
      http_port: hp,
      bind: data.bind || '127.0.0.1',
      username: data.username || '',
      password: data.password || '',
      rotate_minutes: Math.max(0, parseInt(data.rotate_minutes) || 0),
      random_server: data.random_server !== false,
      enabled: !!data.enabled,
    };
  }

  async create(data) {
    if (!data.socks_port) data.socks_port = await this.findNextPort(this.settings.socks_base);
    if (!data.http_port) data.http_port = await this.findNextPort(this.settings.http_base, [data.socks_port]);

    const tunnel = this.validate(data);
    tunnel.id = crypto.randomBytes(4).toString('hex');
    tunnel.conf_index = 0;
    tunnel.created = Date.now();

    this.tunnels[tunnel.id] = tunnel;
    this.runtime[tunnel.id] = new TunnelRuntime();
    this.save();

    if (tunnel.enabled) this.start(tunnel.id);

    return tunnel;
  }

  async update(tid, data) {
    const old = this.tunnels[tid];
    if (!old) throw new Error('Tunnel not found');

    const merged = { ...old, ...data };
    const tunnel = this.validate(merged, tid);
    tunnel.id = tid;
    tunnel.conf_index = Math.min(old.conf_index || 0, tunnel.confs.length - 1);
    tunnel.created = old.created;
    tunnel.enabled = old.enabled;

    this.tunnels[tid] = tunnel;
    this.save();

    if (this.runtime[tid]?.isRunning()) {
      this.restart(tid, 'config changed');
    }

    return tunnel;
  }

  delete(tid) {
    this.stop(tid);
    delete this.tunnels[tid];
    delete this.runtime[tid];

    for (const ext of ['.wg.conf', '.wireproxy.conf']) {
      const f = path.join(config.runtimeDir, tid + ext);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    this.save();
  }

  async start(tid) {
    const tunnel = this.tunnels[tid];
    const rt = this.runtime[tid];

    if (!tunnel) return;
    if (rt?.isRunning() || this.stopping) return;

    tunnel.enabled = true;

    if (!fs.existsSync(config.wireproxyBin)) {
      rt.status = 'error';
      rt.error = 'wireproxy not found';
      this.save();
      return;
    }

    const confName = tunnel.confs[tunnel.conf_index % tunnel.confs.length];
    try {
      const confText = this.readConfig(confName);
      validateWireGuardConfig(confText);

      const wgPath = path.join(config.runtimeDir, `${tid}.wg.conf`);
      const wpPath = path.join(config.runtimeDir, `${tid}.wireproxy.conf`);

      fs.writeFileSync(wgPath, buildRuntimeWireGuardConfig(confText, '0.0.0.0:51820', config.keepalive));

      const auth = tunnel.username ? `Username = ${tunnel.username}\nPassword = ${tunnel.password}\n` : '';
      fs.writeFileSync(wpPath,
        `WGConfig = ${wgPath}\n\n[Socks5]\nBindAddress = ${tunnel.bind}:${tunnel.socks_port}\n${auth}\n[http]\nBindAddress = ${tunnel.bind}:${tunnel.http_port}\n${auth}`
      );

      const logFile = path.join(config.logDir, `${tid}.log`);
      const logFd = fs.openSync(logFile, 'a');
      fs.writeSync(logFd, `\n==== ${new Date().toISOString()} start ${confName}\n`);

      rt.proc = spawn(config.wireproxyBin, ['-c', wpPath], {
        stdio: ['ignore', logFd, logFd],
        cwd: config.runtimeDir,
        detached: false,
      });

      rt.status = 'starting';
      rt.endpoint = '0.0.0.0:51820';
      rt.startedAt = Date.now();
      rt.fails = 0;
      rt.nextCheck = Date.now() + 3000;
      rt.lastRotate = rt.lastRotate || Date.now();

      logger.info(`[${tunnel.name}] started (pid ${rt.proc.pid})`);
      this.save();
    } catch (e) {
      rt.status = 'error';
      rt.error = e.message;
      this.save();
      logger.error(`[${tunnel.name}] start error: ${e.message}`);
    }
  }

  stop(tid) {
    const tunnel = this.tunnels[tid];
    const rt = this.runtime[tid];

    if (!tunnel) return;

    tunnel.enabled = false;

    if (rt?.proc) {
      try {
        rt.proc.kill();
        rt.proc = null;
      } catch (e) {}
    }

    rt.status = 'stopped';
    rt.error = '';
    rt.latency = null;
    this.save();
  }

  async restart(tid, reason = 'manual') {
    logger.info(`[${this.tunnels[tid]?.name}] restart (${reason})`);
    this.stop(tid);
    await new Promise(r => setTimeout(r, 500));
    this.start(tid);
  }

  rotate(tid) {
    const tunnel = this.tunnels[tid];
    if (!tunnel) return;

    if (tunnel.confs.length > 1) {
      tunnel.conf_index = (tunnel.conf_index + 1) % tunnel.confs.length;
    }
    this.runtime[tid].lastRotate = Date.now();
    this.runtime[tid].hardFails = 0;
    this.save();
    this.restart(tid, 'rotate');
  }

  stopAll() {
    for (const tid of Object.keys(this.tunnels)) {
      this.stop(tid);
    }
  }

  getWireproxyVersion() {
    try {
      if (!fs.existsSync(config.wireproxyBin)) {
        return null;
      }
      const result = require('child_process').spawnSync(config.wireproxyBin, ['--version'], {
        timeout: 5000,
        encoding: 'utf8'
      });
      if (result.error) return null;
      const output = (result.stdout || result.stderr || '').trim();
      return output.split('\n').pop() || null;
    } catch (e) {
      return null;
    }
  }

  snapshot() {
    const items = [];

    for (const [tid, tunnel] of Object.entries(this.tunnels)) {
      const rt = this.runtime[tid];
      const conf = tunnel.confs[tunnel.conf_index % tunnel.confs.length];

      try {
        const content = this.readConfig(conf);
        const parsed = parseWireGuardConfig(content);
        var key = hashSHA256(parsed.interface?.privatekey || '');
      } catch {
        var key = '?';
      }

      items.push({
        ...tunnel,
        status: rt.status,
        running: rt.isRunning(),
        error: rt.error,
        ip: rt.ip,
        country: rt.country,
        latency: rt.latency,
        restarts: rt.restarts,
        uptime: rt.isRunning() ? Math.floor((Date.now() - rt.startedAt) / 1000) : 0,
        endpoint: rt.endpoint,
        active_conf: conf,
        key,
        history: rt.history,
      });
    }

    return {
      tunnels: items.sort((a, b) => a.socks_port - b.socks_port),
      settings: this.settings,
      has_password: !!this.settings.ui_password,
      confs: this.listConfigs(),
      lan_ip: getLanIP(),
      wireproxy: this.getWireproxyVersion(),
    };
  }

  export(ids, format = 'scheme_colon', proto = 'socks5') {
    const host = '127.0.0.1';
    const lines = [];

    const tunnelIds = ids.length
      ? ids.filter(id => this.tunnels[id])
      : Object.keys(this.tunnels).sort((a, b) => this.tunnels[a].socks_port - this.tunnels[b].socks_port);

    for (const tid of tunnelIds) {
      const tunnel = this.tunnels[tid];
      if (!tunnel) continue;

      const port = proto === 'socks5' ? tunnel.socks_port : tunnel.http_port;
      const auth = tunnel.username ? `${encodeURIComponent(tunnel.username)}:${encodeURIComponent(tunnel.password)}@` : '';

      let line;
      if (format === 'host_port') {
        line = `${host}:${port}` + (tunnel.username ? `:${tunnel.username}:${tunnel.password}` : '');
      } else if (format === 'url') {
        line = `${proto}://${auth}${host}:${port}`;
      } else {
        line = `${proto}://${host}:${port}` + (tunnel.username ? `:${tunnel.username}:${tunnel.password}` : '');
      }

      lines.push(line);
    }

    return lines.join('\n');
  }
}

const manager = new ProxyManager();

// ============================================================================
// HTTP API SERVER
// ============================================================================

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);

  // Auth check
  const auth = req.headers.authorization || '';
  if (config.password && !auth.startsWith('Basic ')) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Proxy Manager"' });
    res.end();
    return;
  }

  // GET requests
  if (req.method === 'GET') {
    if (pathname === '/' || pathname === '/index.html') {
      try {
        const webPath = path.join(__dirname, 'web', 'index.html');
        const html = fs.readFileSync(webPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('Web UI not found');
      }
      return;
    }

    if (pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manager.snapshot()));
      return;
    }

    if (pathname === '/api/export') {
      const ids = (query.ids || '').split(',').filter(Boolean);
      const text = manager.export(ids, query.fmt || 'scheme_colon', query.proto || 'socks5');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
      return;
    }

    const confMatch = pathname.match(/^\/api\/confs\/([^\/]+)$/);
    if (confMatch) {
      try {
        let content = manager.readConfig(decodeURIComponent(confMatch[1]));
        content = content.replace(/^(\s*privatekey\s*=\s*).+$/im, '$1(hidden)');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content }));
      } catch {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
      return;
    }
  }

  // POST requests
  if (req.method === 'POST') {
    if (!req.headers['content-type']?.includes('application/json')) {
      res.writeHead(415);
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = body ? JSON.parse(body) : {};

        if (pathname === '/api/confs/upload') {
          const saved = [];
          const errors = [];
          for (const file of data.files || []) {
            try {
              saved.push(manager.addConfig(file.name, file.content));
            } catch (e) {
              errors.push(`${file.name}: ${e.message}`);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ saved, errors }));
          return;
        }

        if (pathname === '/api/confs/delete') {
          manager.deleteConfig(data.name);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (pathname === '/api/tunnels') {
          const tunnel = await manager.create(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tunnel));
          return;
        }

        if (pathname === '/api/tunnels/bulk_create') {
          const tunnels = [];
          for (const conf of data.confs || []) {
            const d = { ...data, confs: [conf], name: conf.replace('.conf', '') };
            tunnels.push(await manager.create(d));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ created: tunnels }));
          return;
        }

        if (pathname === '/api/bulk') {
          const act = data.action;
          for (const tid of data.ids || []) {
            if (tid in manager.tunnels) {
              if (act === 'start') manager.start(tid);
              else if (act === 'stop') manager.stop(tid);
              else if (act === 'rotate') manager.rotate(tid);
              else if (act === 'restart') manager.restart(tid);
              else if (act === 'delete') manager.delete(tid);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        const tunnelMatch = pathname.match(/^\/api\/tunnels\/(\w+)\/(\w+)$/);
        if (tunnelMatch) {
          const [, tid, action] = tunnelMatch;
          if (!(tid in manager.tunnels)) throw new Error('Tunnel not found');

          if (action === 'update') {
            const updated = await manager.update(tid, data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(updated));
          } else if (action === 'start') {
            manager.start(tid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else if (action === 'stop') {
            manager.stop(tid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else if (action === 'restart') {
            manager.restart(tid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else if (action === 'rotate') {
            manager.rotate(tid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else if (action === 'delete') {
            manager.delete(tid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }
          return;
        }

        if (pathname === '/api/settings') {
          for (const [key, value] of Object.entries(data)) {
            if (key in manager.settings) {
              manager.settings[key] = value;
            }
          }
          manager.save();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (e) {
        logger.error('API error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ============================================================================
// SUPERVISION LOOP
// ============================================================================

async function supervisionLoop() {
  while (!manager.stopping) {
    try {
      for (const tid of Object.keys(manager.tunnels)) {
        const tunnel = manager.tunnels[tid];
        const rt = manager.runtime[tid];

        if (!tunnel?.enabled) continue;

        // Check if process died
        if (rt?.proc && rt.proc.killed) {
          rt.status = 'recovering';
          rt.proc = null;
          logger.warn(`[${tunnel.name}] process died, restarting`);
          await new Promise(r => setTimeout(r, 1000));
          manager.start(tid);
        }

        // Rotation by schedule
        if (tunnel.rotate_minutes && rt.isRunning()) {
          const elapsed = (Date.now() - (rt.lastRotate || 0)) / 1000 / 60;
          if (elapsed >= tunnel.rotate_minutes) {
            logger.info(`[${tunnel.name}] rotating IP`);
            manager.rotate(tid);
          }
        }
      }
    } catch (e) {
      logger.error('Supervision error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  logger.info('Starting Proxy Manager');
  logger.info(`wireproxy: ${config.wireproxyBin}`);
  logger.info(`configs: ${config.configDir}`);
  logger.info(`logs: ${config.logDir}`);

  // Start supervision
  supervisionLoop().catch(e => logger.error('Supervision crashed:', e));

  // Start HTTP server
  const server = http.createServer(handleRequest);

  server.listen(config.port, config.host, () => {
    const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
    const url = `http://${host}:${config.port}`;
    logger.info(`Web UI running at ${url}`);
  });

  server.on('error', e => {
    logger.error('Server error:', e.message);
    process.exit(1);
  });

  // Signal handlers
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      logger.info(`Received ${sig}, shutting down...`);
      manager.stopping = true;
      manager.stopAll();
      server.close();
      process.exit(0);
    });
  }

  // Start enabled tunnels
  for (const [tid, tunnel] of Object.entries(manager.tunnels)) {
    if (tunnel.enabled) {
      await manager.start(tid);
    }
  }

  logger.info('Ready');
}

main().catch(e => {
  logger.error('Fatal error:', e);
  process.exit(1);
});
