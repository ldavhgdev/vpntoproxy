import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class VPNManager {
  constructor(logger) {
    this.logger = logger;
    this.vpnProcess = null;
    this.isConnected = false;
    this.currentLocation = process.env.VPN_LOCATION || 'us-nyc';
    this.protocol = process.env.VPN_PROTOCOL || 'wireguard';
    this.connectionAttempts = 0;
    this.lastIpRotation = null;
    this.recoveryAttempts = 0;
  }

  async initialize() {
    try {
      this.logger.info(`Initializing VPN with ${this.protocol} protocol...`);

      // Check if VPN config file exists FIRST
      await this.checkConfigExists();

      // Check if VPN tools are installed
      await this.checkDependencies();

      // Connect to VPN
      await this.connect();

      this.isConnected = true;
      this.connectionAttempts = 0;

      // Start recovery monitor
      this.startRecoveryMonitor();

      this.logger.info('✅ VPN initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'VPN initialization failed');
      throw error;
    }
  }

  async checkConfigExists() {
    const configPath = this.protocol === 'wireguard'
      ? '/etc/wireguard/surfshark.conf'
      : '/etc/openvpn/client/surfshark-default.ovpn';

    try {
      await fs.access(configPath);
      this.logger.info(`✅ Config file found: ${configPath}`);
    } catch {
      const errorMsg = `
╔════════════════════════════════════════════════════════════════╗
║  ❌ VPN CONFIG FILE NOT FOUND                                  ║
╚════════════════════════════════════════════════════════════════╝

VPN ${this.protocol.toUpperCase()} config file is required to start.

Expected location: ${configPath}

📤 UPLOAD INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to Web UI: http://YOUR_VPS_IP:3000/upload.html

2. Upload your ${this.protocol.toUpperCase()} config:
   - For WireGuard: Get from https://my.surfshark.com → Account → VPN Credentials
   - For OpenVPN: Download from Surfshark support page

3. After uploading, restart the application

4. The VPN will automatically connect on startup

NEED HELP?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
See documentation: /opt/vpn-to-proxy/SURFSHARK_SETUP.md
      `;

      this.logger.error(errorMsg);
      throw new Error(`VPN config file not found at ${configPath}`);
    }
  }

  async checkDependencies() {
    const deps = this.protocol === 'wireguard'
      ? ['wg', 'wg-quick']
      : ['openvpn'];

    for (const dep of deps) {
      try {
        await execAsync(`which ${dep}`);
      } catch {
        throw new Error(`${dep} not found. Please install it first.`);
      }
    }

    this.logger.info('✅ All VPN dependencies found');
  }

  async connect() {
    try {
      if (this.protocol === 'wireguard') {
        await this.connectWireGuard();
      } else {
        await this.connectOpenVPN();
      }
    } catch (error) {
      this.logger.error({ error }, 'Connection failed');

      // Retry logic
      if (this.connectionAttempts < 3) {
        this.connectionAttempts++;
        this.logger.info(`Retrying connection (attempt ${this.connectionAttempts}/3)...`);
        await new Promise(r => setTimeout(r, 5000));
        return this.connect();
      }

      throw error;
    }
  }

  async connectWireGuard() {
    try {
      // Config file is already verified in checkConfigExists()
      // Just bring up WireGuard interface
      await execAsync('sudo wg-quick up surfshark');

      this.logger.info('✅ WireGuard connected');
    } catch (error) {
      this.logger.error({ error }, 'WireGuard connection failed');
      throw error;
    }
  }

  async connectOpenVPN() {
    try {
      // Config file is already verified in checkConfigExists()
      const configDir = '/etc/openvpn/client';
      const configFile = path.join(configDir, `surfshark-${this.currentLocation}.ovpn`);

      // Create credentials file if not exists
      const credsFile = path.join(configDir, 'surfshark-creds.txt');
      try {
        await fs.access(credsFile);
      } catch {
        if (process.env.SURFSHARK_USER && process.env.SURFSHARK_PASS) {
          const creds = `${process.env.SURFSHARK_USER}\n${process.env.SURFSHARK_PASS}`;
          await fs.writeFile(credsFile, creds, { mode: 0o600 });
          this.logger.info('Created credentials file from .env');
        }
      }

      // Start OpenVPN
      this.vpnProcess = spawn('sudo', [
        'openvpn',
        '--config', configFile,
        '--daemon',
        '--log', '/var/log/openvpn/surfshark.log'
      ]);

      this.logger.info('✅ OpenVPN connected');
    } catch (error) {
      this.logger.error({ error }, 'OpenVPN connection failed');
      throw error;
    }
  }

  async getSurfsharkWireGuardConfig() {
    try {
      // In production, download from Surfshark API or use stored config
      // For now, return a placeholder that would be replaced with actual config
      const config = `[Interface]
PrivateKey = <YOUR_PRIVATE_KEY>
Address = <YOUR_ADDRESS>
DNS = 1.1.1.1

[Peer]
PublicKey = <SURFSHARK_PUBLIC_KEY>
AllowedIPs = 0.0.0.0/0
Endpoint = <SURFSHARK_SERVER>:51820`;

      return config;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get WireGuard config');
      throw error;
    }
  }

  async getSurfsharkOpenVPNConfig() {
    try {
      // Fetch from Surfshark API or use cached config
      const configUrl = `https://api.surfshark.com/v4/server/get/ovpn/tcp/${this.currentLocation}`;

      // Placeholder - in production, implement actual API call
      const config = `client
proto tcp
remote ${this.currentLocation}.prod.surfshark.com 1194
cipher AES-256-CBC
auth SHA256
resolv-retry infinite
nobind
verb 3

<ca>
-----BEGIN CERTIFICATE-----
# Surfshark CA certificate
-----END CERTIFICATE-----
</ca>

<auth-user-pass>
</auth-user-pass>`;

      return config;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get OpenVPN config');
      throw error;
    }
  }

  async rotateIP() {
    try {
      this.logger.info('🔄 Rotating IP...');

      if (this.protocol === 'wireguard') {
        // Reconnect WireGuard
        await execAsync('sudo wg-quick down surfshark');
        await new Promise(r => setTimeout(r, 2000));
        await execAsync('sudo wg-quick up surfshark');
      } else {
        // Reconnect OpenVPN
        await this.disconnect();
        await new Promise(r => setTimeout(r, 2000));
        await this.connect();
      }

      this.lastIpRotation = new Date();
      this.recoveryAttempts = 0;

      this.logger.info('✅ IP rotated successfully');
    } catch (error) {
      this.logger.error({ error }, 'IP rotation failed');
      throw error;
    }
  }

  async changeLocation(location) {
    try {
      this.logger.info(`Changing location to ${location}...`);

      this.currentLocation = location;
      await this.disconnect();
      await new Promise(r => setTimeout(r, 2000));
      await this.connect();

      this.logger.info(`✅ Location changed to ${location}`);
    } catch (error) {
      this.logger.error({ error }, 'Location change failed');
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.protocol === 'wireguard') {
        await execAsync('sudo wg-quick down surfshark').catch(() => {});
      } else {
        if (this.vpnProcess) {
          await execAsync('sudo killall openvpn').catch(() => {});
        }
      }

      this.isConnected = false;
      this.logger.info('✅ VPN disconnected');
    } catch (error) {
      this.logger.error({ error }, 'Disconnect error');
    }
  }

  async getStatus() {
    try {
      const currentIP = await this.getCurrentIP();

      return {
        isConnected: this.isConnected,
        protocol: this.protocol,
        location: this.currentLocation,
        currentIP,
        lastRotation: this.lastIpRotation,
        connectionAttempts: this.connectionAttempts,
        recoveryAttempts: this.recoveryAttempts
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get VPN status');
      return {
        isConnected: this.isConnected,
        protocol: this.protocol,
        location: this.currentLocation,
        currentIP: null,
        error: error.message
      };
    }
  }

  async getCurrentIP() {
    try {
      const response = await execAsync('curl -s https://api.ipify.org');
      return response.stdout.trim();
    } catch {
      return null;
    }
  }

  startRecoveryMonitor() {
    const interval = setInterval(async () => {
      try {
        if (!this.isConnected) {
          this.logger.warn('VPN disconnected, attempting recovery...');
          this.recoveryAttempts++;

          if (this.recoveryAttempts <= parseInt(process.env.RECOVERY_MAX_ATTEMPTS || 5)) {
            await this.connect();
            this.isConnected = true;
            this.recoveryAttempts = 0;
            this.logger.info('✅ VPN recovered');
          }
        } else {
          // Check if connection is still active
          const ip = await this.getCurrentIP();
          if (!ip) {
            this.isConnected = false;
          }
        }
      } catch (error) {
        this.logger.error({ error }, 'Recovery monitor error');
      }
    }, (parseInt(process.env.RECOVERY_CHECK_INTERVAL || 60)) * 1000);

    this.recoveryMonitorInterval = interval;
  }

  getAvailableLocations() {
    // Surfshark server list (subset)
    return [
      'us-nyc', 'us-la', 'us-chi', 'gb-lon', 'fr-par',
      'de-ber', 'nl-ams', 'se-sto', 'ch-zrh', 'jp-tok',
      'sg-sgp', 'au-syd', 'ca-tor', 'mx-cdmx', 'br-sao'
    ];
  }
}
