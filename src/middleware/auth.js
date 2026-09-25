export function authMiddleware(req, res, next) {
  // Skip auth for health check
  if (req.path === '/health') {
    return next();
  }

  // Check API key
  const apiKey = req.get('Authorization') || req.query.apiKey;
  const expectedApiKey = process.env.API_KEY;

  if (process.env.API_KEY_ENABLED === 'true') {
    if (!apiKey || apiKey.replace('Bearer ', '') !== expectedApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  next();
}
