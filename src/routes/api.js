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

  return router;
}
