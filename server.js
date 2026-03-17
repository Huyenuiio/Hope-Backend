require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');

// Config
const connectDB = require('./src/config/db');
const passport = require('./src/config/passport');

// Middleware
const accessLogMiddleware = require('./src/middleware/accessLog');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { apiLimiter } = require('./src/middleware/rateLimit');

// Routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const jobRoutes = require('./src/routes/jobs');
const messageRoutes = require('./src/routes/messages');
const portfolioRoutes = require('./src/routes/portfolio');
const reviewRoutes = require('./src/routes/reviews');
const meetingRoutes = require('./src/routes/meetings');
const adminRoutes = require('./src/routes/admin');


// Socket
const initSocket = require('./src/socket');

// ── INIT ───────────────────────────────────────────────────────────
connectDB();

const app = express();
const httpServer = http.createServer(app);

// ── SECURITY MIDDLEWARE ────────────────────────────────────────────
// Security HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting (global)
app.use('/api/', apiLimiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── SAFE INPUT SANITIZATION ──────────────────────────────────────
// NOTE: We avoid express-mongo-sanitize because it uses Object.defineProperty
// to lock req.query as a non-writable getter, which crashes downstream middleware.
// Custom implementation: strip MongoDB operators ($, .) from req.body only.
app.use((req, res, next) => {
  const xssPattern = /<script[\s\S]*?>[\s\S]*?<\/script>|javascript:|on\w+\s*=/gi;
  const noSqlPattern = /\$|\./g; // MongoDB operator chars

  const sanitizeValue = (val) => {
    if (typeof val === 'string') {
      return val.replace(xssPattern, '');
    }
    if (Array.isArray(val)) return val.map(sanitizeValue);
    if (val && typeof val === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(val)) {
        // Skip keys starting with $ (MongoDB operators)
        if (!k.startsWith('$')) {
          clean[k] = sanitizeValue(v);
        } else {
          console.warn(`⚠️  NoSQL injection attempt blocked. Key: ${k} | IP: ${req.ip}`);
        }
      }
      return clean;
    }
    return val;
  };

  if (req.body && typeof req.body === 'object') {
    try { req.body = sanitizeValue(req.body); } catch (e) { /* ignore */ }
  }
  next();
});


// Session (for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Access log to DB (security monitoring)
app.use(accessLogMiddleware);

// ── ROUTES ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Server đang hoạt động ✅',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/admin', adminRoutes);


// ── 404 & ERROR HANDLERS ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── SOCKET.IO ──────────────────────────────────────────────────────
const io = initSocket(httpServer);
app.set('io', io); // Make io accessible in routes

// ── START SERVER ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log('\n================================');
  console.log(`🚀  Hope Platform API Server`);
  console.log(`📡  Port: ${PORT}`);
  console.log(`🌍  ENV: ${process.env.NODE_ENV}`);
  console.log(`🔗  Frontend: ${process.env.FRONTEND_URL}`);
  console.log(`🔐  OAuth Callback: ${process.env.BACKEND_URL}/api/auth/google/callback`);
  console.log('================================\n');
});

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error('❌  Unhandled Promise Rejection:', err.message);
  httpServer.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('❌  Uncaught Exception:', err.message);
  process.exit(1);
});

module.exports = { app, httpServer };
