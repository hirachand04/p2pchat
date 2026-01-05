import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { SessionManager } from './sessionManager.js';
import { setupSocketHandlers } from './socketHandlers.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// SECURITY: Input Validation Schemas (OWASP Best Practices)
// =============================================================================

/**
 * Schema-based input validator
 * Validates input against defined schemas with type checking, length limits,
 * and pattern matching. Rejects unexpected fields.
 */
const ValidationSchemas = {
  sessionCode: {
    type: 'string',
    required: true,
    minLength: 6,
    maxLength: 10,
    pattern: /^[A-Z0-9]+$/i,
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')
  },
  nickname: {
    type: 'string',
    required: false,
    minLength: 1,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_\s]+$/,
    sanitize: (v) => v.replace(/[^a-zA-Z0-9_\s]/g, '').trim()
  },
  messageId: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\-_]+$/
  },
  iv: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100
  },
  encryptedMessage: {
    type: 'string',
    required: false,
    maxLength: 100000  // 100KB for text messages
  },
  encryptedMedia: {
    type: 'string',
    required: false,
    maxLength: 7000000  // ~5MB base64 encoded
  },
  mediaType: {
    type: 'string',
    required: false,
    enum: ['text', 'voice', 'image', 'file']
  }
};

/**
 * Validate input against schema
 * @param {any} input - The input to validate
 * @param {object} schema - The validation schema
 * @returns {{ valid: boolean, value: any, error?: string }}
 */
function validateInput(input, schema) {
  // Type check
  if (schema.required && (input === undefined || input === null || input === '')) {
    return { valid: false, error: 'Required field missing' };
  }
  
  if (input === undefined || input === null) {
    return { valid: true, value: schema.default || null };
  }
  
  if (typeof input !== schema.type) {
    return { valid: false, error: `Expected ${schema.type}, got ${typeof input}` };
  }
  
  let value = input;
  
  // Sanitize if function provided
  if (schema.sanitize && typeof value === 'string') {
    value = schema.sanitize(value);
  }
  
  // String validations
  if (schema.type === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      return { valid: false, error: `Minimum length is ${schema.minLength}` };
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      return { valid: false, error: `Maximum length is ${schema.maxLength}` };
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      return { valid: false, error: 'Invalid format' };
    }
  }
  
  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    return { valid: false, error: `Must be one of: ${schema.enum.join(', ')}` };
  }
  
  return { valid: true, value };
}

/**
 * Validate object against multiple schemas, rejecting unexpected fields
 * @param {object} data - Object to validate
 * @param {object} schemas - Map of field name to schema
 * @param {string[]} allowedFields - List of allowed field names
 * @returns {{ valid: boolean, values: object, errors: object }}
 */
function validateObject(data, schemas, allowedFields) {
  const errors = {};
  const values = {};
  
  // Check for unexpected fields (security: reject unexpected data)
  if (data && typeof data === 'object') {
    const unexpectedFields = Object.keys(data).filter(key => !allowedFields.includes(key));
    if (unexpectedFields.length > 0) {
      errors._unexpected = `Unexpected fields: ${unexpectedFields.join(', ')}`;
    }
  }
  
  // Validate each expected field
  for (const [field, schema] of Object.entries(schemas)) {
    const result = validateInput(data?.[field], schema);
    if (!result.valid) {
      errors[field] = result.error;
    } else {
      values[field] = result.value;
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    values,
    errors
  };
}

// =============================================================================
// Global Error Handlers
// =============================================================================

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

// =============================================================================
// Server Configuration
// =============================================================================

const CONFIG = {
  MAX_SESSIONS: 1000,
  MAX_CONNECTIONS_PER_IP: 5,
  MAX_TOTAL_CONNECTIONS: 5000,
  MEMORY_CHECK_INTERVAL: 30000,
  MAX_MEMORY_MB: 512,
  MAX_MESSAGE_SIZE: 50000,
  SESSION_CODE_LENGTH: 8,
  NONCE_EXPIRY: 300000,
  // Rate limiting config (can be overridden by env vars)
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  SOCKET_RATE_LIMIT_WINDOW: parseInt(process.env.SOCKET_RATE_LIMIT_WINDOW) || 1000,
  SOCKET_RATE_LIMIT_MAX: parseInt(process.env.SOCKET_RATE_LIMIT_MAX) || 5,
};

// =============================================================================
// Rate Limiting Configuration (OWASP Best Practices)
// =============================================================================

// IP-based rate limiting for HTTP endpoints
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  // SECURITY: Use X-Forwarded-For for proxied requests
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.ip || 
           req.connection.remoteAddress || 
           'unknown';
  },
  // Graceful 429 response
  handler: (req, res, next, options) => {
    console.warn(`⚠️ Rate limit exceeded for IP: ${options.keyGenerator(req)}`);
    res.status(429).json({
      error: options.message.error,
      retryAfter: Math.ceil(options.windowMs / 1000)
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks from localhost
    return req.path === '/health' && req.ip === '127.0.0.1';
  }
});

// General API rate limiter
const generalLimiter = createRateLimiter(
  CONFIG.RATE_LIMIT_WINDOW_MS,
  CONFIG.RATE_LIMIT_MAX_REQUESTS,
  'Too many requests, please try again later.'
);

// Session API rate limiter (prevent enumeration attacks)
const sessionApiLimiter = createRateLimiter(
  60 * 1000,  // 1 minute window
  20,         // 20 requests per minute
  'Too many session requests. Please slow down.'
);

// =============================================================================
// Nonce Store for Replay Protection
// =============================================================================

const usedNonces = new Map();

// Cleanup expired nonces every minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [nonce, timestamp] of usedNonces) {
    if (now - timestamp > CONFIG.NONCE_EXPIRY) {
      usedNonces.delete(nonce);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired nonces`);
  }
}, 60000);

// Input sanitization function
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  // Remove null bytes and control characters
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength)
    .trim();
}

// Validate session code format
function isValidSessionCode(code) {
  if (typeof code !== 'string') return false;
  return /^[A-Z0-9]{6,10}$/.test(code.toUpperCase());
}

// Generate secure nonce
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// Check if nonce was used (replay attack prevention)
function checkAndStoreNonce(nonce) {
  if (!nonce || usedNonces.has(nonce)) {
    return false; // Replay detected or no nonce
  }
  usedNonces.set(nonce, Date.now());
  return true;
}

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Trust proxy for ngrok/reverse proxies
app.set('trust proxy', 1);

// CORS configuration - allow all origins for ngrok
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({ limit: '100kb' })); // Limit body size

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // SECURITY: Allow data and blob URLs for media
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Allow microphone for voice messages, block geolocation and camera
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(self)');
  next();
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Socket.io setup with CORS - allow all origins for ngrok/cloudflare
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  allowEIO3: true,
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 30e6,        // 30MB max message size (for media up to 20MB)
  connectTimeout: 45000,          // Connection timeout
  allowUpgrades: true,
  perMessageDeflate: false,       // Disable compression for stability
});

// Track connections per IP
const connectionsByIP = new Map();

// Connection limiting middleware
io.use((socket, next) => {
  try {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               socket.handshake.address || 
               'unknown';
    
    // Check total connections
    if (io.engine.clientsCount >= CONFIG.MAX_TOTAL_CONNECTIONS) {
      console.warn(`⚠️ Max total connections reached (${CONFIG.MAX_TOTAL_CONNECTIONS})`);
      return next(new Error('Server is at capacity. Please try again later.'));
    }
    
    // Check connections per IP
    const currentCount = connectionsByIP.get(ip) || 0;
    if (currentCount >= CONFIG.MAX_CONNECTIONS_PER_IP) {
      console.warn(`⚠️ IP ${ip} exceeded connection limit`);
      return next(new Error('Too many connections from your IP.'));
    }
    
    // Track connection
    connectionsByIP.set(ip, currentCount + 1);
    socket.clientIP = ip;
    
    socket.on('disconnect', () => {
      const count = connectionsByIP.get(ip) || 1;
      if (count <= 1) {
        connectionsByIP.delete(ip);
      } else {
        connectionsByIP.set(ip, count - 1);
      }
    });
    
    next();
  } catch (error) {
    console.error('Connection middleware error:', error);
    next();
  }
});

// Initialize session manager
const sessionManager = new SessionManager();

// Setup socket handlers with security functions
setupSocketHandlers(io, sessionManager, {
  sanitizeInput,
  isValidSessionCode,
  checkAndStoreNonce,
  generateNonce,
  CONFIG
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({ 
    status: 'healthy', 
    activeSessions: sessionManager.getActiveSessionCount(),
    totalUsers: sessionManager.getTotalUserCount(),
    activeConnections: io.engine?.clientsCount || 0,
    uniqueIPs: connectionsByIP.size,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
    },
    uptime: Math.round(process.uptime()) + 's',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// Session API (with stricter rate limiting to prevent enumeration)
// =============================================================================

app.get('/api/session/:code', sessionApiLimiter, (req, res) => {
  // SECURITY: Validate session code format
  const codeResult = validateInput(req.params.code, ValidationSchemas.sessionCode);
  if (!codeResult.valid) {
    // Don't reveal validation details to prevent enumeration
    return res.json({ exists: false });
  }
  
  const session = sessionManager.getSession(codeResult.value);
  
  if (session) {
    res.json({ 
      exists: true, 
      userCount: session.users.size,
      maxUsers: 64
    });
  } else {
    res.json({ exists: false });
  }
});

// Serve static files from the client build with cache control
const clientBuildPath = join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    // Disable caching for HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Allow short caching for assets (they have hashed filenames)
    else if (path.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
  }
}));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(join(clientBuildPath, 'index.html'));
});

// Cleanup expired sessions every minute
setInterval(() => {
  try {
    sessionManager.cleanupExpiredSessions();
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}, 60000);

// Memory monitoring and cleanup every 30 seconds
setInterval(() => {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > CONFIG.MAX_MEMORY_MB) {
      console.warn(`⚠️ High memory usage: ${Math.round(heapUsedMB)}MB - triggering cleanup`);
      sessionManager.cleanupExpiredSessions();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('🧹 Forced garbage collection');
      }
    }
    
    // Log stats periodically
    console.log(`📊 Stats: ${sessionManager.getActiveSessionCount()} sessions, ${sessionManager.getTotalUserCount()} users, ${io.engine?.clientsCount || 0} connections, ${Math.round(heapUsedMB)}MB memory`);
  } catch (error) {
    console.error('Memory monitoring error:', error);
  }
}, CONFIG.MEMORY_CHECK_INTERVAL);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Notify all connected clients
  io.emit('server-shutdown', { message: 'Server is restarting. Please reconnect.' });
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('⚠️ Forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`🚀 P2P Chat Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for connections`);
  console.log(`🔒 End-to-end encryption enabled`);
  console.log(`🌐 Serving frontend from: ${clientBuildPath}`);
  console.log(`⚙️ Max sessions: ${CONFIG.MAX_SESSIONS}, Max connections: ${CONFIG.MAX_TOTAL_CONNECTIONS}`);
});
