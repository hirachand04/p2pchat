import { nanoid } from 'nanoid';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

/**
 * Session Manager - Handles all chat sessions in memory
 * No data is ever persisted to disk or database
 */
export class SessionManager {
  constructor() {
    // In-memory session storage
    this.sessions = new Map();
    // Session expiration time (15 minutes of inactivity)
    this.SESSION_EXPIRY = 15 * 60 * 1000;
    // Maximum users per session
    this.MAX_USERS = 64;
  }

  /**
   * Generate a unique session code (8 alphanumeric - letters and numbers only)
   */
  generateSessionCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return code;
  }

  /**
   * Generate an anonymous nickname for users
   */
  generateNickname() {
    return uniqueNamesGenerator({
      dictionaries: [colors, animals],
      separator: '',
      style: 'capital',
      length: 2
    }) + Math.floor(Math.random() * 100);
  }

  /**
   * Create a new chat session
   */
  createSession(creatorSocketId, customNickname = null) {
    const code = this.generateSessionCode();
    const nickname = customNickname || this.generateNickname();
    
    const session = {
      code,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      adminId: creatorSocketId, // Track who created the session (admin)
      users: new Map(),
      // Store public keys for E2E encryption key exchange
      publicKeys: new Map(),
      // Banned users (can only rejoin if admin approves)
      bannedUsers: new Map() // Map<identifier, { nickname, bannedAt, reason }>
    };

    session.users.set(creatorSocketId, {
      id: creatorSocketId,
      nickname,
      joinedAt: Date.now(),
      isAdmin: true
    });

    this.sessions.set(code, session);

    return { code, nickname, session };
  }

  /**
   * Join an existing session
   */
  joinSession(code, socketId, customNickname = null, clientIP = null) {
    const session = this.sessions.get(code.toUpperCase());
    
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.users.size >= this.MAX_USERS) {
      return { success: false, error: 'Session is full (max 64 users)' };
    }

    // Check if user is banned (by IP)
    if (clientIP && session.bannedUsers && session.bannedUsers.has(clientIP)) {
      const banInfo = session.bannedUsers.get(clientIP);
      return { 
        success: false, 
        error: 'You have been banned from this session. Contact the admin for approval.',
        banned: true,
        bannedNickname: banInfo.nickname
      };
    }

    const nickname = customNickname || this.generateNickname();
    
    session.users.set(socketId, {
      id: socketId,
      nickname,
      joinedAt: Date.now(),
      isAdmin: false,
      clientIP: clientIP // Store IP for ban tracking
    });

    session.lastActivity = Date.now();

    return { success: true, nickname, session };
  }

  /**
   * Ban a user from a session
   */
  banUser(code, clientIP, nickname) {
    const session = this.sessions.get(code.toUpperCase());
    if (session && clientIP) {
      if (!session.bannedUsers) {
        session.bannedUsers = new Map();
      }
      session.bannedUsers.set(clientIP, {
        nickname,
        bannedAt: Date.now(),
        reason: 'Kicked by admin'
      });
      return true;
    }
    return false;
  }

  /**
   * Unban a user from a session
   */
  unbanUser(code, clientIP) {
    const session = this.sessions.get(code.toUpperCase());
    if (session && session.bannedUsers) {
      return session.bannedUsers.delete(clientIP);
    }
    return false;
  }

  /**
   * Get list of banned users in a session
   */
  getBannedUsers(code) {
    const session = this.sessions.get(code.toUpperCase());
    if (session && session.bannedUsers) {
      return Array.from(session.bannedUsers.entries()).map(([ip, info]) => ({
        ip,
        nickname: info.nickname,
        bannedAt: info.bannedAt
      }));
    }
    return [];
  }

  /**
   * Get session by code
   */
  getSession(code) {
    return this.sessions.get(code.toUpperCase());
  }

  /**
   * Get session by socket ID
   */
  getSessionBySocketId(socketId) {
    for (const [code, session] of this.sessions) {
      if (session.users.has(socketId)) {
        return { code, session };
      }
    }
    return null;
  }

  /**
   * Remove user from session
   */
  removeUser(socketId) {
    const result = this.getSessionBySocketId(socketId);
    
    if (!result) return null;

    const { code, session } = result;
    const user = session.users.get(socketId);
    
    session.users.delete(socketId);
    session.publicKeys.delete(socketId);

    // If no users left, destroy the session completely
    if (session.users.size === 0) {
      this.sessions.delete(code);
      return { code, user, sessionDestroyed: true };
    }

    session.lastActivity = Date.now();
    return { code, user, sessionDestroyed: false, remainingUsers: session.users.size };
  }

  /**
   * Store user's public key for E2E encryption
   */
  storePublicKey(code, socketId, publicKey) {
    const session = this.sessions.get(code.toUpperCase());
    if (session) {
      session.publicKeys.set(socketId, publicKey);
      return true;
    }
    return false;
  }

  /**
   * Get all public keys in a session
   */
  getPublicKeys(code) {
    const session = this.sessions.get(code.toUpperCase());
    if (session) {
      return Object.fromEntries(session.publicKeys);
    }
    return {};
  }

  /**
   * Get list of users in a session
   */
  getUsers(code) {
    const session = this.sessions.get(code.toUpperCase());
    if (session) {
      return Array.from(session.users.values());
    }
    return [];
  }

  /**
   * Update session activity timestamp
   */
  updateActivity(code) {
    const session = this.sessions.get(code.toUpperCase());
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Cleanup expired sessions (inactive for 15 minutes)
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [code, session] of this.sessions) {
      if (now - session.lastActivity > this.SESSION_EXPIRY) {
        this.sessions.delete(code);
        cleaned++;
        console.log(`🧹 Cleaned up expired session: ${code}`);
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Total sessions cleaned: ${cleaned}`);
    }
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * Get total user count across all sessions
   */
  getTotalUserCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      count += session.users.size;
    }
    return count;
  }
}
