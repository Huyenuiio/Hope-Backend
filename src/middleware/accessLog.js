const AccessLog = require('../models/AccessLog');

// Middleware: log all requests to DB for security monitoring
const accessLogMiddleware = (req, res, next) => {
  // Don't log options requests or health checks to avoid noise
  if (req.method === 'OPTIONS' || req.path === '/api/health') {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', async () => {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]
        || (req.connection && req.connection.remoteAddress)
        || req.ip
        || 'unknown';

      const responseTime = Date.now() - startTime;

      // Safe body sanitization - don't touch req.query (may be sealed by mongo-sanitize)
      let sanitizedBody = {};
      try {
        if (req.body && typeof req.body === 'object') {
          sanitizedBody = { ...req.body };
          delete sanitizedBody.password;
          delete sanitizedBody.token;
          delete sanitizedBody.secret;
        }
      } catch (_) { /* ignore */ }

      // Detect threats from path and body only (not query, which may be sealed)
      let threat = 'none';
      let details = null;
      try {
        if (AccessLog.detectThreat) {
          const result = AccessLog.detectThreat(req.path, {}, sanitizedBody);
          threat = result.threat || 'none';
          details = result.details || null;
        }
      } catch (_) { /* ignore */ }

      await AccessLog.create({
        user: req.user?._id || null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        ip,
        userAgent: req.headers['user-agent'] || '',
        threat,
        threatDetails: details,
        isFlagged: threat !== 'none',
        requestSummary: Object.keys(sanitizedBody).length
          ? JSON.stringify(sanitizedBody).substring(0, 500)
          : null,
      });
    } catch (err) {
      // Silently ignore — never let logging crash the app
    }
  });

  next();
};

module.exports = accessLogMiddleware;

