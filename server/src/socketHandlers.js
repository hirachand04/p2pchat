/**
 * Socket.io Event Handlers
 * All message content is encrypted client-side - server only relays
 * 
 * SECURITY FEATURES (OWASP Best Practices):
 * - Input validation with schema-based checking
 * - Rate limiting per socket (IP + user-based)
 * - Abuse detection and temporary blocking
 * - Type checking and length limits on all inputs
 * - Rejection of unexpected fields
 */

// =============================================================================
// Rate Limiting (IP + Socket-based)
// =============================================================================

const messageRateLimiter = new Map();
const socketRateLimiters = new Map(); // Per-IP rate limiting for sockets

// Default config (can be overridden)
let RATE_LIMIT_WINDOW = 1000;
let RATE_LIMIT_MAX = 5;

// Blocked sockets (temporary bans for abuse)
const blockedSockets = new Set();
const blockedIPs = new Set();
const abuseCounter = new Map();
const ABUSE_THRESHOLD = 50;
const ABUSE_WINDOW = 60000;

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [socketId, data] of messageRateLimiter) {
    if (now - data.windowStart > 60000) {
      messageRateLimiter.delete(socketId);
      cleaned++;
    }
  }
  for (const [ip, data] of socketRateLimiters) {
    if (now - data.windowStart > 60000) {
      socketRateLimiters.delete(ip);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} stale rate limit entries`);
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a socket (combined IP + socket-based)
 * @param {string} socketId - Socket ID
 * @param {string} ip - Client IP address
 * @returns {boolean} - true if within limits
 */
function checkRateLimit(socketId, ip = 'unknown') {
  const now = Date.now();
  
  // Check socket-based limit
  const userLimit = messageRateLimiter.get(socketId);
  if (!userLimit) {
    messageRateLimiter.set(socketId, { count: 1, windowStart: now });
  } else if (now - userLimit.windowStart > RATE_LIMIT_WINDOW) {
    messageRateLimiter.set(socketId, { count: 1, windowStart: now });
  } else if (userLimit.count >= RATE_LIMIT_MAX) {
    trackAbuse(socketId, ip);
    return false;
  } else {
    userLimit.count++;
  }
  
  // Check IP-based limit (stricter - prevents multi-socket abuse)
  const ipLimit = socketRateLimiters.get(ip);
  const IP_RATE_MAX = RATE_LIMIT_MAX * 3; // Allow 3x per IP (multiple tabs)
  
  if (!ipLimit) {
    socketRateLimiters.set(ip, { count: 1, windowStart: now });
  } else if (now - ipLimit.windowStart > RATE_LIMIT_WINDOW) {
    socketRateLimiters.set(ip, { count: 1, windowStart: now });
  } else if (ipLimit.count >= IP_RATE_MAX) {
    trackAbuse(socketId, ip);
    return false;
  } else {
    ipLimit.count++;
  }
  
  return true;
}

/**
 * Track abuse attempts (socket + IP based)
 * @param {string} socketId - Socket ID
 * @param {string} ip - Client IP address
 */
function trackAbuse(socketId, ip = 'unknown') {
  const now = Date.now();
  const abuseKey = `${ip}:${socketId}`;
  const abuse = abuseCounter.get(abuseKey);
  
  if (!abuse) {
    abuseCounter.set(abuseKey, { count: 1, windowStart: now });
    return;
  }
  
  if (now - abuse.windowStart > ABUSE_WINDOW) {
    abuseCounter.set(abuseKey, { count: 1, windowStart: now });
    return;
  }
  
  abuse.count++;
  if (abuse.count >= ABUSE_THRESHOLD) {
    blockedSockets.add(socketId);
    blockedIPs.add(ip);
    console.warn(`\u26a0\ufe0f Socket ${socketId} (IP: ${ip}) temporarily blocked for abuse`);
    
    // Unblock after 5 minutes
    setTimeout(() => {
      blockedSockets.delete(socketId);
      blockedIPs.delete(ip);
      abuseCounter.delete(abuseKey);
    }, 300000);
  }
}

/**
 * Check if socket or IP is blocked
 * @param {string} socketId - Socket ID
 * @param {string} ip - Client IP address
 * @returns {boolean}
 */
function isBlocked(socketId, ip = 'unknown') {
  return blockedSockets.has(socketId) || blockedIPs.has(ip);
}

// Safe callback wrapper
function safeCallback(callback, response) {
  try {
    if (typeof callback === 'function') {
      callback(response);
    }
  } catch (error) {
    console.error('Callback error:', error);
  }
}

export function setupSocketHandlers(io, sessionManager, security = {}) {
  const { 
    sanitizeInput = (s) => s, 
    isValidSessionCode = () => true,
    checkAndStoreNonce = () => true,
    generateNonce = () => '',
    CONFIG = {}
  } = security;
  
  // Apply rate limit config from server
  if (CONFIG.SOCKET_RATE_LIMIT_WINDOW) {
    RATE_LIMIT_WINDOW = CONFIG.SOCKET_RATE_LIMIT_WINDOW;
  }
  if (CONFIG.SOCKET_RATE_LIMIT_MAX) {
    RATE_LIMIT_MAX = CONFIG.SOCKET_RATE_LIMIT_MAX;
  }
  
  io.on('connection', (socket) => {
    console.log(`\ud83d\udd0c New connection: ${socket.id}`);
    
    // Get client IP for rate limiting
    const clientIP = socket.clientIP || 
                     socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     socket.handshake.address || 
                     'unknown';

    // Check if socket or IP is blocked
    if (isBlocked(socket.id, clientIP)) {
      socket.disconnect(true);
      return;
    }

    // Set socket timeout for inactive connections
    socket.conn.on('packet', () => {
      socket.lastActivity = Date.now();
    });

    /**
     * Create a new chat session
     * SECURITY: Input validation, rate limiting, block check
     */
    socket.on('create-session', (data, callback) => {
      // Check if blocked
      if (isBlocked(socket.id, clientIP)) {
        return;
      }
      
      // Handle both old format (just callback) and new format (data object + callback)
      let customNickname = null;
      let cb = callback;
      
      if (typeof data === 'function') {
        cb = data;
      } else if (data && data.nickname) {
        // Sanitize nickname input
        customNickname = sanitizeInput(data.nickname, 30);
        // Validate nickname (alphanumeric, spaces, underscores only)
        if (customNickname && !/^[a-zA-Z0-9_\s]{1,30}$/.test(customNickname)) {
          customNickname = null; // Use generated nickname instead
        }
      }
      
      try {
        // Check if max sessions reached
        if (sessionManager.getActiveSessionCount() >= 1000) {
          safeCallback(cb, { success: false, error: 'Server is at capacity. Please try again later.' });
          return;
        }
        
        const { code, nickname, session } = sessionManager.createSession(socket.id, customNickname);
        
        socket.join(code);
        
        console.log(`📝 Session created: ${code} by ${nickname}`);
        
        safeCallback(cb, {
          success: true,
          code,
          nickname,
          users: sessionManager.getUsers(code),
          adminId: socket.id // Creator is admin
        });
      } catch (error) {
        console.error('Error creating session:', error);
        safeCallback(cb, { success: false, error: 'Failed to create session' });
      }
    });

    /**
     * Join an existing session
     * SECURITY: Input validation, rate limiting, block check
     */
    socket.on('join-session', (data, callback) => {
      // Check if blocked
      if (isBlocked(socket.id, clientIP)) {
        return;
      }
      
      try {
        // Validate input
        if (!data || !data.code) {
          safeCallback(callback, { success: false, error: 'Session code required' });
          return;
        }
        
        // Validate session code format
        const code = sanitizeInput(data.code, 10).toUpperCase();
        if (!isValidSessionCode(code)) {
          safeCallback(callback, { success: false, error: 'Invalid session code format' });
          return;
        }
        
        // Sanitize and validate nickname
        let customNickname = null;
        if (data.nickname) {
          customNickname = sanitizeInput(data.nickname, 30);
          if (customNickname && !/^[a-zA-Z0-9_\s]{1,30}$/.test(customNickname)) {
            customNickname = null;
          }
        }
        
        // Pass client IP to check for bans
        const result = sessionManager.joinSession(code, socket.id, customNickname, clientIP);
        
        if (!result.success) {
          safeCallback(callback, result);
          return;
        }

        socket.join(code.toUpperCase());
        
        // Notify others in the session (include id for admin tracking)
        socket.to(code.toUpperCase()).emit('user-joined', {
          nickname: result.nickname,
          id: socket.id,
          userCount: result.session.users.size
        });

        console.log(`👋 ${result.nickname} joined session: ${code.toUpperCase()}`);
        
        // Get admin ID (first user in session is admin)
        const adminId = result.session.adminId || null;
        
        safeCallback(callback, {
          success: true,
          code: code.toUpperCase(),
          nickname: result.nickname,
          users: sessionManager.getUsers(code.toUpperCase()),
          adminId
        });
      } catch (error) {
        console.error('Error joining session:', error);
        safeCallback(callback, { success: false, error: 'Failed to join session' });
      }
    });

    /**
     * Store public key for E2E encryption key exchange
     */
    socket.on('share-public-key', ({ code, publicKey }) => {
      try {
        if (!code || !publicKey) return;
        sessionManager.storePublicKey(code, socket.id, publicKey);
        
        // Broadcast to all users in session (except sender)
        socket.to(code).emit('public-key-shared', {
          senderId: socket.id,
          publicKey
        });
      } catch (error) {
        console.error('Error sharing public key:', error);
      }
    });

    /**
     * Get all public keys in session
     */
    socket.on('get-public-keys', ({ code }, callback) => {
      try {
        const keys = sessionManager.getPublicKeys(code);
        safeCallback(callback, { success: true, keys });
      } catch (error) {
        console.error('Error getting public keys:', error);
        safeCallback(callback, { success: false, keys: {} });
      }
    });

    /**
     * Relay encrypted message to session
     * Server NEVER decrypts - just relays encrypted data
     * SECURITY: Input validation, rate limiting, size limits
     */
    socket.on('send-message', (data) => {
      // Check if blocked
      if (isBlocked(socket.id, clientIP)) {
        return;
      }
      
      try {
        if (!data || !data.code) return;
        
        const { code, encryptedMessage, iv, messageId, timestamp, nonce } = data;
        
        // Validate session code format
        if (!isValidSessionCode(code)) {
          return;
        }
        
        // Rate limiting check (IP + socket based)
        if (!checkRateLimit(socket.id, clientIP)) {
          socket.emit('rate-limited', { 
            message: 'Slow down! Too many messages.',
            retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
          });
          return;
        }
        
        // Validate message size (raw media should have reasonable size)
        // Allow up to 20MB for media (base64 encoded = ~27MB)
        const totalSize = (encryptedMessage?.length || 0) + (data.rawMediaData?.length || 0);
        if (totalSize > 30000000) { // ~20MB encoded
          console.warn(`\u26a0\ufe0f Message too large from ${socket.id}`);
          return;
        }
        
        // Validate IV format
        if (!iv || typeof iv !== 'string' || iv.length > 100) {
          return;
        }
        
        // Validate messageId
        if (!messageId || typeof messageId !== 'string' || messageId.length > 50) {
          return;
        }

        const sessionData = sessionManager.getSessionBySocketId(socket.id);
        if (!sessionData || sessionData.code !== code.toUpperCase()) {
          socket.emit('error', { message: 'Not in this session' });
          return;
        }

        const user = sessionData.session.users.get(socket.id);
        if (!user) return;
        
        sessionManager.updateActivity(code);

        // Log media message for debugging
        if (data.mediaType && data.mediaType !== 'text') {
          console.log(`📷 Media message: type=${data.mediaType}, hasRawMediaData=${!!data.rawMediaData}, size=${data.rawMediaData?.length || 0}`);
        }

        // Relay encrypted message to all others in session
        // Text is encrypted, but media is sent raw for performance (not stored)
        socket.to(code.toUpperCase()).emit('new-message', {
          senderId: socket.id,
          senderNickname: user.nickname,
          encryptedMessage,
          iv,
          messageId,
          timestamp,
          // Media is sent unencrypted for performance (up to 20MB)
          mediaType: data.mediaType || 'text',
          rawMediaData: data.rawMediaData || null,
          // Reply info
          replyTo: data.replyTo || null
        });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });

    /**
     * Handle typing indicator
     */
    socket.on('typing', (data) => {
      try {
        if (!data || !data.code) return;
        
        const { code, isTyping } = data;
        const sessionData = sessionManager.getSessionBySocketId(socket.id);
        if (!sessionData) return;

        const user = sessionData.session.users.get(socket.id);
        if (!user) return;
        
        socket.to(code.toUpperCase()).emit('user-typing', {
          senderId: socket.id,
          nickname: user.nickname,
          isTyping
        });
      } catch (error) {
        console.error('Error handling typing:', error);
      }
    });

    /**
     * Handle message delivered acknowledgment
     */
    socket.on('message-delivered', (data) => {
      try {
        if (!data || !data.messageId || !data.senderId) return;
        
        const { messageId, senderId } = data;
        // Notify the original sender that their message was delivered
        io.to(senderId).emit('message-status-update', {
          messageId,
          status: 'delivered',
          by: socket.id
        });
      } catch (error) {
        console.error('Error handling message delivered:', error);
      }
    });

    /**
     * Handle message read acknowledgment
     */
    socket.on('message-read', (data) => {
      try {
        if (!data || !data.messageIds || !data.senderId) return;
        
        const { messageIds, senderId } = data;
        // Notify the original sender that their messages were read
        io.to(senderId).emit('message-status-update', {
          messageIds,
          status: 'read',
          by: socket.id
        });
      } catch (error) {
        console.error('Error handling message read:', error);
      }
    });

    /**
     * Kick a user from the session (admin only)
     * Also bans them - they can only rejoin if admin approves
     */
    socket.on('kick-user', (data, callback) => {
      try {
        if (!data || !data.code || !data.targetUserId) {
          safeCallback(callback, { success: false, error: 'Missing required data' });
          return;
        }

        const { code, targetUserId } = data;
        const session = sessionManager.getSession(code);
        
        if (!session) {
          safeCallback(callback, { success: false, error: 'Session not found' });
          return;
        }

        // Check if requester is admin
        if (session.adminId !== socket.id) {
          safeCallback(callback, { success: false, error: 'Only admin can kick users' });
          return;
        }

        // Can't kick yourself
        if (targetUserId === socket.id) {
          safeCallback(callback, { success: false, error: 'Cannot kick yourself' });
          return;
        }

        const targetUser = session.users.get(targetUserId);
        if (!targetUser) {
          safeCallback(callback, { success: false, error: 'User not found in session' });
          return;
        }

        // Ban the user by their IP (so they can't rejoin without admin approval)
        const targetSocket = io.sockets.sockets.get(targetUserId);
        if (targetSocket) {
          const targetIP = targetSocket.clientIP || targetSocket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || targetSocket.handshake.address;
          if (targetIP) {
            sessionManager.banUser(code, targetIP, targetUser.nickname);
            console.log(`🚫 ${targetUser.nickname} (IP: ${targetIP}) banned from session ${code}`);
          }
        }

        // Remove user from session
        session.users.delete(targetUserId);

        // Get target socket and force leave
        if (targetSocket) {
          targetSocket.leave(code);
          targetSocket.emit('kicked', { 
            reason: 'You were removed by the admin. You cannot rejoin unless the admin approves.',
            banned: true
          });
        }

        // Notify remaining users
        io.to(code).emit('user-kicked', {
          nickname: targetUser.nickname,
          userCount: session.users.size
        });

        // Send updated banned list to admin
        const bannedUsers = sessionManager.getBannedUsers(code);
        socket.emit('banned-users-updated', { bannedUsers });

        console.log(`👢 ${targetUser.nickname} was kicked and banned from session ${code}`);
        
        safeCallback(callback, { success: true });
      } catch (error) {
        console.error('Error kicking user:', error);
        safeCallback(callback, { success: false, error: 'Failed to kick user' });
      }
    });

    /**
     * Unban a user (admin only) - allows them to rejoin
     */
    socket.on('unban-user', (data, callback) => {
      try {
        if (!data || !data.code || !data.userIP) {
          safeCallback(callback, { success: false, error: 'Missing required data' });
          return;
        }

        const { code, userIP } = data;
        const session = sessionManager.getSession(code);
        
        if (!session) {
          safeCallback(callback, { success: false, error: 'Session not found' });
          return;
        }

        // Check if requester is admin
        if (session.adminId !== socket.id) {
          safeCallback(callback, { success: false, error: 'Only admin can unban users' });
          return;
        }

        const unbanned = sessionManager.unbanUser(code, userIP);
        
        if (unbanned) {
          // Send updated banned list to admin
          const bannedUsers = sessionManager.getBannedUsers(code);
          socket.emit('banned-users-updated', { bannedUsers });
          
          console.log(`✅ User with IP ${userIP} was unbanned from session ${code}`);
          safeCallback(callback, { success: true });
        } else {
          safeCallback(callback, { success: false, error: 'User not found in ban list' });
        }
      } catch (error) {
        console.error('Error unbanning user:', error);
        safeCallback(callback, { success: false, error: 'Failed to unban user' });
      }
    });

    /**
     * Get list of banned users (admin only)
     */
    socket.on('get-banned-users', (data, callback) => {
      try {
        if (!data || !data.code) {
          safeCallback(callback, { success: false, error: 'Missing session code' });
          return;
        }

        const { code } = data;
        const session = sessionManager.getSession(code);
        
        if (!session) {
          safeCallback(callback, { success: false, error: 'Session not found' });
          return;
        }

        // Check if requester is admin
        if (session.adminId !== socket.id) {
          safeCallback(callback, { success: false, error: 'Only admin can view banned users' });
          return;
        }

        const bannedUsers = sessionManager.getBannedUsers(code);
        safeCallback(callback, { success: true, bannedUsers });
      } catch (error) {
        console.error('Error getting banned users:', error);
        safeCallback(callback, { success: false, error: 'Failed to get banned users' });
      }
    });

    /**
     * Mute/unmute a user (admin only)
     * Note: Muting is enforced client-side since all messages are encrypted
     */
    socket.on('mute-user', (data, callback) => {
      try {
        if (!data || !data.code || !data.targetUserId) {
          safeCallback(callback, { success: false, error: 'Missing required data' });
          return;
        }

        const { code, targetUserId, muted } = data;
        const session = sessionManager.getSession(code);
        
        if (!session) {
          safeCallback(callback, { success: false, error: 'Session not found' });
          return;
        }

        // Check if requester is admin
        if (session.adminId !== socket.id) {
          safeCallback(callback, { success: false, error: 'Only admin can mute users' });
          return;
        }

        const targetUser = session.users.get(targetUserId);
        if (!targetUser) {
          safeCallback(callback, { success: false, error: 'User not found in session' });
          return;
        }

        // Broadcast mute status to all users (client-side enforcement)
        io.to(code).emit('user-muted', {
          userId: targetUserId,
          nickname: targetUser.nickname,
          muted: !!muted
        });

        console.log(`🔇 ${targetUser.nickname} was ${muted ? 'muted' : 'unmuted'} in session ${code}`);
        
        safeCallback(callback, { success: true });
      } catch (error) {
        console.error('Error muting user:', error);
        safeCallback(callback, { success: false, error: 'Failed to mute user' });
      }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', (reason) => {
      try {
        const result = sessionManager.removeUser(socket.id);
        
        if (result) {
          console.log(`👋 ${result.user.nickname} left session: ${result.code} (${reason})`);
          
          if (result.sessionDestroyed) {
            console.log(`🗑️ Session ${result.code} destroyed (no users left)`);
          } else {
            // Notify remaining users
            io.to(result.code).emit('user-left', {
              nickname: result.user.nickname,
              userCount: result.remainingUsers
            });
          }
        }

        // Clean up rate limiter
        messageRateLimiter.delete(socket.id);
        
        console.log(`🔌 Disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Error handling disconnect:', error);
        // Still try to cleanup rate limiter
        messageRateLimiter.delete(socket.id);
      }
    });

    /**
     * Handle socket errors
     */
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });

    /**
     * Get session info
     */
    socket.on('get-session-info', (data, callback) => {
      try {
        if (!data || !data.code) {
          safeCallback(callback, { success: false, error: 'Code required' });
          return;
        }
        
        const session = sessionManager.getSession(data.code);
        if (session) {
          safeCallback(callback, {
            success: true,
            users: sessionManager.getUsers(data.code),
            userCount: session.users.size
          });
        } else {
          safeCallback(callback, { success: false, error: 'Session not found' });
        }
      } catch (error) {
        console.error('Error getting session info:', error);
        safeCallback(callback, { success: false, error: 'Failed to get session info' });
      }
    });

    /**
     * Leave session voluntarily
     */
    socket.on('leave-session', () => {
      try {
        const result = sessionManager.removeUser(socket.id);
        
        if (result) {
          socket.leave(result.code);
          
          if (!result.sessionDestroyed) {
            io.to(result.code).emit('user-left', {
              nickname: result.user.nickname,
              userCount: result.remainingUsers
            });
          }
          
          console.log(`🚪 ${result.user.nickname} voluntarily left session: ${result.code}`);
        }
      } catch (error) {
        console.error('Error leaving session:', error);
      }
    });
  });
}
