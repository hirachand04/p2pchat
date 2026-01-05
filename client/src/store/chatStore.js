import { create } from 'zustand';
import { io } from 'socket.io-client';
import { CryptoService } from '../services/cryptoService';
import toast from 'react-hot-toast';

// Use same origin in production, or explicit URL in development
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const useChatStore = create((set, get) => ({
  // Connection state
  socket: null,
  isConnected: false,
  isConnecting: false,
  
  // Session state
  isInChat: false,
  sessionCode: null,
  nickname: null,
  users: [],
  isAdmin: false, // Track if current user is session creator
  adminId: null, // Socket ID of the admin
  
  // Messages
  messages: [],
  typingUsers: [],
  replyingTo: null, // Message being replied to
  mutedUsers: [], // List of muted user IDs
  bannedUsers: [], // List of banned users (admin only)
  wasBanned: false, // Track if current user was banned
  
  // Encryption
  cryptoService: null,
  
  // Initialize socket connection
  initSocket: () => {
    const { socket } = get();
    if (socket?.connected) return;
    
    set({ isConnecting: true });
    
    const newSocket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      timeout: 20000,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: false,
      forceNew: true,
    });
    
    let hasShownError = false;
    
    newSocket.on('connect', () => {
      console.log('🔌 Connected to server');
      hasShownError = false;
      set({ isConnected: true, isConnecting: false });
    });
    
    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      set({ isConnected: false });
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      set({ isConnecting: false });
      // Only show error once to prevent toast spam
      if (!hasShownError) {
        hasShownError = true;
        toast.error('Failed to connect to server');
      }
    });
    
    // Message handlers
    newSocket.on('new-message', async (data) => {
      const { cryptoService, messages, sessionCode, mutedUsers } = get();
      
      // Check if sender is muted
      if (mutedUsers.includes(data.senderId)) {
        return; // Ignore messages from muted users
      }
      
      try {
        // Decrypt the message
        const decryptedContent = await cryptoService.decrypt(
          data.encryptedMessage,
          data.iv
        );
        
        // Parse media data if present (sent unencrypted for performance)
        let mediaType = data.mediaType || 'text';
        let mediaData = null;
        
        if (data.rawMediaData) {
          try {
            mediaData = JSON.parse(data.rawMediaData);
          } catch (e) {
            console.error('Failed to parse media data:', e);
          }
        }
        
        const newMessage = {
          id: data.messageId,
          content: decryptedContent,
          sender: data.senderNickname,
          senderId: data.senderId,
          timestamp: data.timestamp,
          isOwn: false,
          type: 'message',
          status: 'delivered',
          mediaType,
          mediaData,
          replyTo: data.replyTo || null
        };
        
        set({ messages: [...messages, newMessage] });
        
        // Send delivery acknowledgment back to sender
        newSocket.emit('message-delivered', {
          code: sessionCode,
          messageId: data.messageId,
          senderId: data.senderId
        });
        
        // Play notification sound
        get().playNotificationSound();
      } catch (error) {
        console.error('Failed to decrypt message:', error);
      }
    });
    
    // Handle message status updates (delivered/read)
    newSocket.on('message-status-update', (data) => {
      const { messages } = get();
      
      if (data.messageIds) {
        // Multiple messages read
        const updatedMessages = messages.map(msg => {
          if (data.messageIds.includes(msg.id) && msg.isOwn) {
            return { ...msg, status: data.status };
          }
          return msg;
        });
        set({ messages: updatedMessages });
      } else if (data.messageId) {
        // Single message delivered
        const updatedMessages = messages.map(msg => {
          if (msg.id === data.messageId && msg.isOwn && msg.status !== 'read') {
            return { ...msg, status: data.status };
          }
          return msg;
        });
        set({ messages: updatedMessages });
      }
    });
    
    newSocket.on('user-joined', (data) => {
      const { messages, users } = get();
      
      set({
        messages: [...messages, {
          id: Date.now(),
          type: 'system',
          content: `${data.nickname} joined the chat`,
          timestamp: Date.now()
        }],
        users: [...users, { nickname: data.nickname, id: data.id }]
      });
      
      toast.success(`${data.nickname} joined the chat`);
    });
    
    newSocket.on('user-left', (data) => {
      const { messages, users, mutedUsers } = get();
      
      set({
        messages: [...messages, {
          id: Date.now(),
          type: 'system',
          content: `${data.nickname} left the chat`,
          timestamp: Date.now()
        }],
        users: users.filter(u => u.nickname !== data.nickname),
        mutedUsers: mutedUsers.filter(id => id !== data.id)
      });
      
      toast(`${data.nickname} left the chat`, { icon: '👋' });
    });
    
    // Handle being kicked by admin
    newSocket.on('kicked', (data) => {
      const { updateUrl } = get();
      toast.error(data.reason || 'You have been removed from the chat');
      updateUrl(null);
      sessionStorage.removeItem('p2pchat_nickname');
      set({
        isInChat: false,
        sessionCode: null,
        nickname: null,
        users: [],
        messages: [],
        typingUsers: [],
        cryptoService: null,
        isAdmin: false,
        adminId: null,
        mutedUsers: [],
        wasBanned: data.banned || false // Track if user was banned
      });
    });
    
    // Handle user being kicked (for other users to see)
    newSocket.on('user-kicked', (data) => {
      const { messages, users, mutedUsers } = get();
      set({
        messages: [...messages, {
          id: Date.now(),
          type: 'system',
          content: `${data.nickname} was removed from the chat`,
          timestamp: Date.now()
        }],
        users: users.filter(u => u.nickname !== data.nickname),
        mutedUsers: mutedUsers.filter(id => id !== data.userId)
      });
    });
    
    // Handle banned users list update (admin only)
    newSocket.on('banned-users-updated', (data) => {
      set({ bannedUsers: data.bannedUsers || [] });
    });
    
    // Handle user muted/unmuted by admin
    newSocket.on('user-muted', (data) => {
      const { mutedUsers, messages } = get();
      
      if (data.muted) {
        if (!mutedUsers.includes(data.userId)) {
          set({ 
            mutedUsers: [...mutedUsers, data.userId],
            messages: [...messages, {
              id: Date.now(),
              type: 'system',
              content: `${data.nickname} was muted`,
              timestamp: Date.now()
            }]
          });
        }
      } else {
        set({ 
          mutedUsers: mutedUsers.filter(id => id !== data.userId),
          messages: [...messages, {
            id: Date.now(),
            type: 'system',
            content: `${data.nickname} was unmuted`,
            timestamp: Date.now()
          }]
        });
      }
    });
    
    newSocket.on('user-typing', (data) => {
      const { typingUsers, mutedUsers } = get();
      
      // Ignore typing from muted users
      if (mutedUsers.includes(data.senderId)) return;
      
      if (data.isTyping) {
        if (!typingUsers.includes(data.nickname)) {
          set({ typingUsers: [...typingUsers, data.nickname] });
        }
      } else {
        set({ typingUsers: typingUsers.filter(n => n !== data.nickname) });
      }
    });
    
    newSocket.on('rate-limited', (data) => {
      toast.error(data.message);
    });
    
    set({ socket: newSocket });
  },
  
  // Update URL with session code (for browser history and refresh support)
  updateUrl: (code) => {
    if (code) {
      window.history.pushState({}, '', `/${code}`);
    } else {
      window.history.pushState({}, '', '/');
    }
  },
  
  // Save nickname to sessionStorage for refresh persistence
  saveNickname: (nickname) => {
    if (nickname) {
      sessionStorage.setItem('p2pchat_nickname', nickname);
    }
  },
  
  // Create a new chat session
  createSession: async (customNickname = null) => {
    const { socket, initSocket, updateUrl, saveNickname } = get();
    
    // Initialize socket if needed
    if (!socket) {
      initSocket();
    }
    
    // Wait for socket to connect with retries
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const currentSocket = get().socket;
      if (currentSocket?.connected) break;
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
    
    const currentSocket = get().socket;
    if (!currentSocket?.connected) {
      toast.error('Unable to connect to server. Please try again.');
      return false;
    }
    
    // Initialize encryption - key will be derived after we get the session code
    const cryptoService = new CryptoService();
    
    return new Promise((resolve) => {
      currentSocket.emit('create-session', { nickname: customNickname }, async (response) => {
        if (response.success) {
          // Derive encryption key from session code
          await cryptoService.deriveKeyFromSession(response.code);
          
          // Update URL and save nickname for refresh persistence
          updateUrl(response.code);
          saveNickname(response.nickname);
          
          set({
            isInChat: true,
            sessionCode: response.code,
            nickname: response.nickname,
            users: response.users,
            cryptoService,
            isAdmin: true, // Creator is always admin
            adminId: currentSocket.id,
            messages: [{
              id: Date.now(),
              type: 'system',
              content: 'You created the chat. Share the code with others to start chatting!',
              timestamp: Date.now()
            }]
          });
          
          toast.success(`Chat created! Code: ${response.code}`);
          resolve(true);
        } else {
          toast.error(response.error || 'Failed to create session');
          resolve(false);
        }
      });
    });
  },
  
  // Join an existing session
  joinSession: async (code, customNickname = null) => {
    const { socket, initSocket, updateUrl, saveNickname } = get();
    
    // Initialize socket if needed
    if (!socket) {
      initSocket();
    }
    
    // Wait for socket to connect with retries
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const currentSocket = get().socket;
      if (currentSocket?.connected) break;
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
    
    const currentSocket = get().socket;
    if (!currentSocket?.connected) {
      toast.error('Unable to connect to server. Please try again.');
      return false;
    }
    
    // Initialize encryption - derive key from session code
    const cryptoService = new CryptoService();
    
    return new Promise((resolve) => {
      currentSocket.emit('join-session', { code, nickname: customNickname }, async (response) => {
        if (response.success) {
          // Derive encryption key from session code (same as creator)
          await cryptoService.deriveKeyFromSession(response.code);
          
          // Update URL and save nickname for refresh persistence
          updateUrl(response.code);
          saveNickname(response.nickname);
          
          set({
            isInChat: true,
            sessionCode: response.code,
            nickname: response.nickname,
            users: response.users,
            cryptoService,
            isAdmin: false,
            adminId: response.adminId || null,
            messages: [{
              id: Date.now(),
              type: 'system',
              content: 'You joined the chat',
              timestamp: Date.now()
            }]
          });
          
          toast.success('Joined chat successfully!');
          resolve(true);
        } else {
          toast.error(response.error || 'Failed to join session');
          resolve(false);
        }
      });
    });
  },
  
  // Rejoin a session after page refresh (silent join)
  rejoinSession: async (code, savedNickname = null) => {
    const { socket, initSocket, updateUrl, saveNickname } = get();
    
    // Initialize socket if needed
    if (!socket) {
      initSocket();
    }
    
    // Wait for socket to connect with retries
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const currentSocket = get().socket;
      if (currentSocket?.connected) break;
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
    
    const currentSocket = get().socket;
    if (!currentSocket?.connected) {
      // Clear URL if can't connect
      updateUrl(null);
      return false;
    }
    
    // Initialize encryption - derive key from session code
    const cryptoService = new CryptoService();
    
    return new Promise((resolve) => {
      currentSocket.emit('join-session', { code, nickname: savedNickname }, async (response) => {
        if (response.success) {
          // Derive encryption key from session code
          await cryptoService.deriveKeyFromSession(response.code);
          
          // Save nickname for future refreshes
          saveNickname(response.nickname);
          
          set({
            isInChat: true,
            sessionCode: response.code,
            nickname: response.nickname,
            users: response.users,
            cryptoService,
            messages: [{
              id: Date.now(),
              type: 'system',
              content: 'You rejoined the chat',
              timestamp: Date.now()
            }]
          });
          
          toast.success('Rejoined chat!');
          resolve(true);
        } else {
          // Session doesn't exist anymore, clear URL
          updateUrl(null);
          toast.error('Session no longer exists');
          resolve(false);
        }
      });
    });
  },
  
  // Set message to reply to
  setReplyingTo: (message) => {
    set({ replyingTo: message });
  },
  
  // Clear reply
  clearReply: () => {
    set({ replyingTo: null });
  },
  
  // Send a message (with optional media and reply support)
  sendMessage: async (content, mediaType = 'text', mediaData = null) => {
    const { socket, sessionCode, cryptoService, nickname, messages, replyingTo } = get();
    
    if (!socket?.connected || !sessionCode) return;
    if (!content?.trim() && !mediaData) return;
    
    try {
      // Encrypt the message content
      const { encrypted, iv } = await cryptoService.encrypt(content || '');
      
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();
      
      // Send media data directly without encryption (for performance with large files)
      // Media is only transmitted, never stored on server
      const rawMediaData = mediaData ? JSON.stringify(mediaData) : null;
      
      // Debug logging
      console.log('📤 Sending message:', {
        mediaType,
        hasMediaData: !!mediaData,
        rawMediaDataLength: rawMediaData?.length || 0
      });
      
      // Send message to server
      socket.emit('send-message', {
        code: sessionCode,
        encryptedMessage: encrypted,
        iv,
        messageId,
        timestamp,
        mediaType,
        rawMediaData, // Send media unencrypted for better performance
        replyTo: replyingTo?.id || null
      });
      
      // Add to local messages (unencrypted for self)
      const newMessage = {
        id: messageId,
        content: content || '',
        sender: nickname,
        senderId: socket.id,
        timestamp,
        isOwn: true,
        type: 'message',
        status: 'sent',
        mediaType,
        mediaData,
        replyTo: replyingTo?.id || null
      };
      
      set({ 
        messages: [...messages, newMessage],
        replyingTo: null // Clear reply after sending
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  },
  
  // Send voice message
  sendVoice: async (voiceData) => {
    const { sendMessage } = get();
    await sendMessage('', 'voice', voiceData);
  },
  
  // Send media (image/file)
  sendMedia: async (mediaData) => {
    console.log('📷 sendMedia called:', {
      type: mediaData?.type,
      hasData: !!mediaData?.data,
      dataLength: mediaData?.data?.length || 0,
      fileName: mediaData?.fileName
    });
    const { sendMessage } = get();
    await sendMessage('', mediaData.type, mediaData);
  },
  
  // Kick user (admin only)
  kickUser: (userId) => {
    const { socket, sessionCode, isAdmin } = get();
    if (!socket?.connected || !isAdmin) return;
    
    return new Promise((resolve) => {
      socket.emit('kick-user', {
        code: sessionCode,
        targetUserId: userId
      }, (response) => {
        if (response?.success) {
          toast.success('User removed from chat');
        } else {
          toast.error(response?.error || 'Failed to kick user');
        }
        resolve(response);
      });
    });
  },
  
  // Mute user (admin only - server broadcast)
  muteUser: (userId) => {
    const { socket, sessionCode, isAdmin } = get();
    if (!socket?.connected || !isAdmin) return;
    
    socket.emit('mute-user', {
      code: sessionCode,
      targetUserId: userId,
      muted: true
    }, (response) => {
      if (response?.success) {
        toast.success('User muted');
      } else {
        toast.error(response?.error || 'Failed to mute user');
      }
    });
  },
  
  // Unmute user (admin only - server broadcast)
  unmuteUser: (userId) => {
    const { socket, sessionCode, isAdmin } = get();
    if (!socket?.connected || !isAdmin) return;
    
    socket.emit('mute-user', {
      code: sessionCode,
      targetUserId: userId,
      muted: false
    }, (response) => {
      if (response?.success) {
        toast.success('User unmuted');
      } else {
        toast.error(response?.error || 'Failed to unmute user');
      }
    });
  },
  
  // Unban user (admin only) - allows them to rejoin
  unbanUser: (userIP) => {
    const { socket, sessionCode, isAdmin } = get();
    if (!socket?.connected || !isAdmin) return;
    
    return new Promise((resolve) => {
      socket.emit('unban-user', {
        code: sessionCode,
        userIP
      }, (response) => {
        if (response?.success) {
          toast.success('User unbanned - they can now rejoin');
        } else {
          toast.error(response?.error || 'Failed to unban user');
        }
        resolve(response);
      });
    });
  },
  
  // Get list of banned users (admin only)
  getBannedUsers: () => {
    const { socket, sessionCode, isAdmin } = get();
    if (!socket?.connected || !isAdmin) return;
    
    socket.emit('get-banned-users', {
      code: sessionCode
    }, (response) => {
      if (response?.success) {
        set({ bannedUsers: response.bannedUsers || [] });
      }
    });
  },
  
  // Mark messages as read (called when chat is visible)
  markMessagesAsRead: () => {
    const { socket, sessionCode, messages } = get();
    if (!socket?.connected || !sessionCode) return;
    
    // Find unread messages from others
    const unreadMessages = messages.filter(
      msg => msg.type === 'message' && !msg.isOwn && msg.status !== 'read'
    );
    
    if (unreadMessages.length === 0) return;
    
    // Group by sender and send read receipts
    const bySender = {};
    unreadMessages.forEach(msg => {
      if (!bySender[msg.senderId]) bySender[msg.senderId] = [];
      bySender[msg.senderId].push(msg.id);
    });
    
    Object.entries(bySender).forEach(([senderId, messageIds]) => {
      socket.emit('message-read', {
        code: sessionCode,
        messageIds,
        senderId
      });
    });
    
    // Update local state to mark as read
    const updatedMessages = messages.map(msg => {
      if (msg.type === 'message' && !msg.isOwn && msg.status !== 'read') {
        return { ...msg, status: 'read' };
      }
      return msg;
    });
    set({ messages: updatedMessages });
  },
  
  // Send typing indicator
  sendTyping: (isTyping) => {
    const { socket, sessionCode } = get();
    if (socket?.connected && sessionCode) {
      socket.emit('typing', { code: sessionCode, isTyping });
    }
  },
  
  // Leave the chat
  leaveChat: () => {
    const { socket, updateUrl } = get();
    
    if (socket?.connected) {
      socket.emit('leave-session');
    }
    
    // Clear URL and session storage
    updateUrl(null);
    sessionStorage.removeItem('p2pchat_nickname');
    
    set({
      isInChat: false,
      sessionCode: null,
      nickname: null,
      users: [],
      messages: [],
      typingUsers: [],
      cryptoService: null
    });
    
    toast.success('You left the chat');
  },
  
  // Export chat log (client-side only)
  exportChat: () => {
    const { messages, sessionCode, nickname } = get();
    
    const chatLog = messages
      .filter(m => m.type === 'message' || m.type === 'system')
      .map(m => {
        const time = new Date(m.timestamp).toLocaleString();
        if (m.type === 'system') {
          return `[${time}] --- ${m.content} ---`;
        }
        return `[${time}] ${m.sender}: ${m.content}`;
      })
      .join('\n');
    
    const header = `P2P Chat Export\nSession: ${sessionCode}\nExported by: ${nickname}\nDate: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
    
    const blob = new Blob([header + chatLog], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `p2pchat-${sessionCode}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Chat exported successfully!');
  },
  
  // Play notification sound
  playNotificationSound: () => {
    // Check if sound is enabled from theme store
    const soundEnabled = useThemeStore.getState().soundEnabled;
    if (!soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      // Audio not supported
    }
  }
}));
