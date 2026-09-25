import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function createWebRoutes() {
  const router = express.Router();

  // Serve static files
  router.use(express.static(path.join(__dirname, '../../public')));

  // Main page
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  // Fallback to index.html for SPA routing
  router.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  return router;
}
