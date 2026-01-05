/**
 * CryptoService - End-to-End Encryption using Web Crypto API
 * Uses AES-GCM for symmetric encryption with authenticated encryption
 * 
 * Security Features:
 * - AES-256-GCM for authenticated encryption
 * - PBKDF2 with 250,000 iterations for key derivation
 * - Random IV per message to prevent pattern analysis
 * - Message integrity verification via GCM authentication tag
 */
export class CryptoService {
  constructor() {
    this.key = null;
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.iterations = 250000; // Increased iterations for better security
  }

  /**
   * Generate a new random encryption key
   */
  async generateKey() {
    this.key = await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    return this.key;
  }

  /**
   * Derive a deterministic key from a session code with enhanced security
   * All users with the same session code will derive the same key
   * @param {string} sessionCode - The session code to derive key from
   */
  async deriveKeyFromSession(sessionCode) {
    // Use PBKDF2 to derive a key from the session code
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(sessionCode),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Use a versioned salt for key derivation
    // Salt includes version for future upgrades
    const salt = encoder.encode('p2pchat-e2e-secure-salt-v2-2025');

    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.iterations, // High iteration count for security
        hash: 'SHA-512', // Upgraded to SHA-512
      },
      keyMaterial,
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return this.key;
  }

  /**
   * Export the key as a base64 string for sharing
   */
  async exportKey() {
    if (!this.key) throw new Error('No key generated');
    
    const exported = await crypto.subtle.exportKey('raw', this.key);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * Import a key from base64 string
   */
  async importKey(base64Key) {
    const keyData = this.base64ToArrayBuffer(base64Key);
    
    this.key = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    return this.key;
  }

  /**
   * Encrypt a message
   * @param {string} plaintext - The message to encrypt
   * @returns {Object} - { encrypted: base64, iv: base64 }
   */
  async encrypt(plaintext) {
    if (!this.key) throw new Error('No key available');

    // Generate a random IV for each message
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encode the plaintext
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      this.key,
      data
    );

    return {
      encrypted: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
    };
  }

  /**
   * Decrypt a message
   * @param {string} encryptedBase64 - The encrypted message in base64
   * @param {string} ivBase64 - The IV in base64
   * @returns {string} - The decrypted plaintext
   */
  async decrypt(encryptedBase64, ivBase64) {
    if (!this.key) throw new Error('No key available');

    const encrypted = this.base64ToArrayBuffer(encryptedBase64);
    const iv = this.base64ToArrayBuffer(ivBase64);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      this.key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Generate a secure random session key for sharing
   * In production, this would be exchanged via RSA/ECDH
   */
  static generateSessionSecret() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hash a string using SHA-256
   */
  static async hash(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
