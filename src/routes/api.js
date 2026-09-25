import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

export default function createApiRoutes(vpnManager, proxyManager, systemMonitor) {
  const router = express.Router();

  // Apply auth to all routes
  router.use(authMiddleware);

  // VPN Routes
  router.get('/vpn/status', async (req, res) => {
    try {
      const status = await vpnManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/vpn/rotate', async (req, res) => {
    try {
      await vpnManager.rotateIP();
      const status = await vpnManager.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/vpn/location/:location', async (req, res) => {
    try {
      const { location } = req.params;
      await vpnManager.changeLocation(location);
      const status = await vpnManager.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/vpn/locations', (req, res) => {
    try {
      const locations = vpnManager.getAvailableLocations();
      res.json({ locations });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/vpn/disconnect', async (req, res) => {
    try {
      await vpnManager.disconnect();
      res.json({ success: true, message: 'VPN disconnected' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/vpn/connect', async (req, res) => {
    try {
      await vpnManager.connect();
      const status = await vpnManager.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Proxy Routes
  router.get('/proxy/status', async (req, res) => {
    try {
      const status = await proxyManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/proxy/connections', (req, res) => {
    try {
      const stats = proxyManager.getConnectionStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // System Monitor Routes
  router.get('/system/info', async (req, res) => {
    try {
      const info = await systemMonitor.getSystemInfo();
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/system/resources', async (req, res) => {
    try {
      const resources = await systemMonitor.getResourceUsage();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Combined Status
  router.get('/status', async (req, res) => {
    try {
      const vpnStatus = await vpnManager.getStatus();
      const proxyStatus = await proxyManager.getStatus();
      const sysInfo = await systemMonitor.getSystemInfo();

      res.json({
        vpn: vpnStatus,
        proxy: proxyStatus,
        system: sysInfo,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Upload VPN config files
  router.post('/config/upload/wireguard', async (req, res) => {
    try {
      const { config } = req.body;

      if (!config) {
        return res.status(400).json({ error: 'Config content required' });
      }

      // Write WireGuard config
      const fs = await import('fs/promises');
      await fs.writeFile('/etc/wireguard/surfshark.conf', config, { mode: 0o600 });

      res.json({ success: true, message: 'WireGuard config uploaded successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/config/upload/openvpn', async (req, res) => {
    try {
      const { config, location } = req.body;

      if (!config) {
        return res.status(400).json({ error: 'Config content required' });
      }

      const loc = location || 'default';
      const configPath = `/etc/openvpn/client/surfshark-${loc}.ovpn`;

      // Write OpenVPN config
      const fs = await import('fs/promises');
      await fs.mkdir('/etc/openvpn/client', { recursive: true });
      await fs.writeFile(configPath, config, { mode: 0o600 });

      res.json({ success: true, message: `OpenVPN config uploaded to ${configPath}` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/config/upload/credentials', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      // Write credentials file
      const fs = await import('fs/promises');
      const credsContent = `${username}\n${password}`;
      await fs.writeFile('/etc/openvpn/client/surfshark-creds.txt', credsContent, { mode: 0o600 });

      res.json({ success: true, message: 'Credentials uploaded successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
