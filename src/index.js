import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pino from 'pino';

import { VPNManager } from './managers/VPNManager.js';
import { ProxyManager } from './managers/ProxyManager.js';
import { SystemMonitor } from './utils/SystemMonitor.js';
import apiRoutes from './routes/api.js';
import webRoutes from './routes/web.js';
import { authMiddleware } from './middleware/auth.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Initialize managers
const vpnManager = new VPNManager(logger);
const proxyManager = new ProxyManager(logger);
const systemMonitor = new SystemMonitor(logger);

// Express app
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/', apiRoutes(vpnManager, proxyManager, systemMonitor));
app.use('/', webRoutes);

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');

  const sendUpdate = async () => {
    try {
      const vpnStatus = await vpnManager.getStatus();
      const proxyStatus = await proxyManager.getStatus();
      const sysInfo = await systemMonitor.getSystemInfo();

      ws.send(JSON.stringify({
        type: 'update',
        data: {
          vpn: vpnStatus,
          proxy: proxyStatus,
          system: sysInfo,
          timestamp: Date.now()
        }
      }));
    } catch (error) {
      logger.error({ error }, 'WebSocket update error');
    }
  };

  // Send initial update
  sendUpdate();

  // Send updates every 5 seconds
  const interval = setInterval(sendUpdate, 5000);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      await handleWebSocketMessage(data, ws, vpnManager, proxyManager);
    } catch (error) {
      logger.error({ error }, 'WebSocket message error');
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    clearInterval(interval);
  });

  ws.on('error', (error) => {
    logger.error({ error }, 'WebSocket error');
  });
});

// WebSocket message handler
async function handleWebSocketMessage(data, ws, vpnManager, proxyManager) {
  const { action, payload } = data;

  switch (action) {
    case 'rotate_ip':
      try {
        await vpnManager.rotateIP();
        ws.send(JSON.stringify({
          type: 'action_result',
          action: 'rotate_ip',
          status: 'success'
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'action_result',
          action: 'rotate_ip',
          status: 'error',
          error: error.message
        }));
      }
      break;
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');

  try {
    await vpnManager.disconnect();
    await proxyManager.stop();
    wss.clients.forEach(client => client.close());
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, 'Shutdown error');
    process.exit(1);
  }

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.warn('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const PORT = process.env.MANAGEMENT_PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 Server running on port ${PORT}`);

  try {
    // Initialize VPN
    logger.info('Initializing VPN connection...');
    await vpnManager.initialize();

    // Start proxy servers
    logger.info('Starting proxy servers...');
    await proxyManager.start();

    // Start auto-rotation if enabled
    if (process.env.AUTO_ROTATE === 'true') {
      const rotateInterval = (parseInt(process.env.ROTATE_INTERVAL_MINUTES) || 30) * 60 * 1000;
      setInterval(() => vpnManager.rotateIP(), rotateInterval);
      logger.info(`Auto-rotation enabled every ${process.env.ROTATE_INTERVAL_MINUTES} minutes`);
    }

    // Start system monitoring
    systemMonitor.start();

    logger.info('✅ All services started successfully');
  } catch (error) {
    logger.error({ error }, 'Startup error');
    process.exit(1);
  }
});

export { app, server, wss, vpnManager, proxyManager };
