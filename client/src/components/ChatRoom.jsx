import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Copy,
  LogOut,
  Users,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Download,
  Shield,
  Menu,
  X,
  MessageSquare,
  ChevronDown,
  Image,
  Mic,
  Settings,
  XCircle
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import VoiceRecorder from './VoiceRecorder';
import MediaUploader from './MediaUploader';
import AdminControls from './AdminControls';

export default function ChatRoom() {
  const [message, setMessage] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showMediaUploader, setShowMediaUploader] = useState(false);
  const [showAdminControls, setShowAdminControls] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const prevMessagesLength = useRef(0);
  
  const {
    sessionCode,
    nickname,
    users,
    messages,
    typingUsers,
    sendMessage,
    sendTyping,
    leaveChat,
    exportChat,
    isConnected,
    markMessagesAsRead,
    isAdmin,
    replyingTo,
    clearReply,
    sendVoice,
    sendMedia
  } = useChatStore();
  
  const { isDark, toggleTheme, soundEnabled, toggleSound } = useThemeStore();

  // Check if user is near bottom of chat
  const checkIfNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const threshold = 150; // pixels from bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < threshold;
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const nearBottom = checkIfNearBottom();
    setIsNearBottom(nearBottom);
    
    // Clear new message count when user scrolls to bottom
    if (nearBottom) {
      setNewMessageCount(0);
      markMessagesAsRead();
    }
  }, [checkIfNearBottom, markMessagesAsRead]);

  // Scroll to bottom function - use scrollTop instead of scrollIntoView to prevent layout shifts
  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesContainerRef.current;
    if (container) {
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
    setNewMessageCount(0);
    markMessagesAsRead();
  }, [markMessagesAsRead]);

  // Handle new messages - auto-scroll only if near bottom
  useEffect(() => {
    const newMessagesCount = messages.length - prevMessagesLength.current;
    
    if (newMessagesCount > 0 && prevMessagesLength.current > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // For own messages, scroll without animation to prevent jitter
      if (lastMessage?.isOwn) {
        // Use requestAnimationFrame to batch with render
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });
      } else if (isNearBottom) {
        // For others' messages when near bottom, smooth scroll
        scrollToBottom(true);
      } else {
        // Show new message indicator
        setNewMessageCount(prev => prev + newMessagesCount);
      }
    } else if (prevMessagesLength.current === 0) {
      // Initial load - scroll to bottom without animation
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
    
    prevMessagesLength.current = messages.length;
  }, [messages, isNearBottom, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Mobile keyboard detection
  useEffect(() => {
    const detectKeyboard = () => {
      // Detect keyboard by comparing visual viewport to window height
      if (window.visualViewport) {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(heightDiff > 150);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', detectKeyboard);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', detectKeyboard);
      }
    };
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!message.trim()) return;
    
    const inputElement = inputRef.current;
    const messageToSend = message.trim();
    
    // Clear message immediately to feel responsive
    setMessage('');
    
    // Send the message
    sendMessage(messageToSend);
    sendTyping(false);
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    
    // Keep keyboard open - multiple strategies for different mobile browsers
    if (inputElement) {
      // Prevent any blur that might happen
      inputElement.focus({ preventScroll: true });
      
      // Some mobile browsers need a slight delay
      requestAnimationFrame(() => {
        inputElement.focus({ preventScroll: true });
      });
    }
  };

  const handleTyping = (e) => {
    setMessage(e.target.value);
    
    // Send typing indicator
    sendTyping(true);
    
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Set new timeout to stop typing indicator
    const timeout = setTimeout(() => {
      sendTyping(false);
    }, 2000);
    
    setTypingTimeout(timeout);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(sessionCode);
    toast.success('Code copied to clipboard!');
  };

  const handleLeave = () => {
    if (confirm('Are you sure you want to leave? All chat history will be lost.')) {
      leaveChat();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="chat-container flex flex-col"
    >
      {/* Header */}
      <header className={`px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-b safe-area-top flex-shrink-0 ${
        isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-lg md:hidden ${
              isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="font-mono font-bold text-base sm:text-lg">{sessionCode}</span>
                <button
                  onClick={copyCode}
                  className={`p-1 sm:p-1.5 rounded-md transition-colors ${
                    isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
                  }`}
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500 pulse-green' : 'bg-red-500'
                }`} />
                <span className={isDark ? 'text-dark-muted' : 'text-slate-500'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Users count - visible on desktop */}
          <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            isDark ? 'bg-dark-border' : 'bg-slate-100'
          }`}>
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">{users.length}</span>
          </div>
          
          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
            }`}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          
          {/* Theme toggle - hidden on very small screens */}
          <button
            onClick={toggleTheme}
            className={`hidden xs:block p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
            }`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          {/* Export chat - hidden on small screens */}
          <button
            onClick={exportChat}
            className={`hidden sm:block p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
            }`}
            title="Export chat"
          >
            <Download className="w-5 h-5" />
          </button>
          
          {/* Admin Controls - only visible to admin */}
          {isAdmin && (
            <button
              onClick={() => setShowAdminControls(true)}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-dark-border text-amber-400' : 'hover:bg-slate-100 text-amber-600'
              }`}
              title="Admin Controls"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          
          {/* Leave button */}
          <button
            onClick={handleLeave}
            className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
            title="Leave chat"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Mobile overlay */}
        <AnimatePresence>
          {showSidebar && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSidebar(false)}
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
              />
              <motion.aside
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                className={`fixed left-0 top-0 bottom-0 w-72 z-50 p-4 md:hidden ${
                  isDark ? 'bg-dark-card' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold">Participants</h2>
                  <button onClick={() => setShowSidebar(false)}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <UsersList users={users} nickname={nickname} isDark={isDark} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Sidebar - Desktop */}
        <aside className={`hidden md:block w-64 border-r p-4 overflow-y-auto ${
          isDark ? 'bg-dark-card border-dark-border' : 'bg-slate-50 border-slate-200'
        }`}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Participants ({users.length})
          </h2>
          <UsersList users={users} nickname={nickname} isDark={isDark} />
        </aside>

        {/* Messages Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Messages Container with relative positioning for the button */}
          <div className="flex-1 relative overflow-hidden">
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className={`absolute inset-0 overflow-y-auto p-4 space-y-3 stable-scroll ${
                isDark ? 'bg-dark-bg' : 'bg-slate-50'
              }`}
              style={{ overscrollBehavior: 'contain' }}
            >
              {messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  nickname={nickname}
                  messages={messages}
                  onReply={(m) => useChatStore.getState().setReplyingTo(m)}
                />
              ))}
              
              {/* Typing Indicator */}
              {typingUsers.length > 0 && (
                <TypingIndicator users={typingUsers} />
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* New Messages Indicator - absolutely centered for all screen sizes */}
            <AnimatePresence>
              {newMessageCount > 0 && !isNearBottom && (
                <div className="absolute bottom-4 inset-x-0 flex items-center justify-center z-20 pointer-events-none px-4">
                  <motion.button
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    onClick={() => scrollToBottom()}
                    className={`pointer-events-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-full shadow-lg
                               transition-colors touch-manipulation mx-auto ${
                      isDark 
                        ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                        : 'bg-primary-500 hover:bg-primary-600 text-white'
                    }`}
                    style={{ 
                      maxWidth: 'calc(100% - 2rem)',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium whitespace-nowrap">
                      {newMessageCount} new message{newMessageCount > 1 ? 's' : ''}
                    </span>
                  </motion.button>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Input Area */}
          <div className={`input-area-container p-3 sm:p-4 border-t flex-shrink-0 ${
            isDark ? 'bg-dark-card border-dark-border' : 'bg-white border-slate-200'
          }`}>
            {/* Reply indicator */}
            {replyingTo && (
              <div className={`flex items-center gap-2 mb-2 p-2 rounded-lg text-sm ${
                isDark ? 'bg-dark-bg border-l-2 border-primary-500' : 'bg-slate-100 border-l-2 border-primary-500'
              }`}>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${isDark ? 'text-primary-400' : 'text-primary-600'}`}>
                    Replying to {replyingTo.senderNickname || 'yourself'}
                  </span>
                  <p className={`truncate ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                    {replyingTo.content}
                  </p>
                </div>
                <button
                  onClick={clearReply}
                  className={`p-1 rounded-full ${isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-200'}`}
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Encryption indicator - hidden on very small screens */}
            <div className={`hidden xs:flex items-center gap-1.5 text-xs mb-2 ${
              isDark ? 'text-green-400' : 'text-green-600'
            }`}>
              <Shield className="w-3 h-3" />
              <span>End-to-end encrypted</span>
            </div>
            
            {/* Media buttons */}
            <div className="flex items-center gap-1 mb-2">
              <button
                onClick={() => setShowMediaUploader(true)}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-dark-border text-dark-muted hover:text-dark-text' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                }`}
                title="Send image or file"
              >
                <Image className="w-5 h-5" />
              </button>
              <button
                onClick={async () => {
                  // Full diagnostic for microphone issues
                  console.log('=== Microphone Diagnostic ===');
                  console.log('isSecureContext:', window.isSecureContext);
                  console.log('protocol:', window.location.protocol);
                  console.log('mediaDevices available:', !!navigator.mediaDevices);
                  console.log('getUserMedia available:', !!navigator.mediaDevices?.getUserMedia);
                  
                  // Check permission state first
                  if (navigator.permissions && navigator.permissions.query) {
                    try {
                      const permStatus = await navigator.permissions.query({ name: 'microphone' });
                      console.log('Permission state:', permStatus.state);
                      
                      if (permStatus.state === 'denied') {
                        toast.error(
                          'Microphone is BLOCKED. Click the lock 🔒 icon in address bar → Site settings → Microphone → Allow, then refresh.',
                          { duration: 10000 }
                        );
                        return;
                      }
                    } catch (e) {
                      console.log('Could not query permission:', e);
                    }
                  }
                  
                  // Try to get microphone
                  try {
                    console.log('Requesting getUserMedia...');
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log('SUCCESS - got stream:', stream.id);
                    stream.getTracks().forEach(track => track.stop());
                    setShowVoiceRecorder(true);
                  } catch (err) {
                    console.error('getUserMedia error:', err.name, err.message);
                    
                    if (err.name === 'NotAllowedError') {
                      toast.error(
                        'Microphone BLOCKED by browser. Click 🔒 icon → Site settings → Microphone → Allow → Refresh page',
                        { duration: 10000 }
                      );
                    } else if (err.name === 'NotFoundError') {
                      toast.error('No microphone found. Please connect a microphone.');
                    } else if (err.name === 'NotReadableError') {
                      toast.error('Microphone is being used by another app.');
                    } else {
                      toast.error(`Microphone error: ${err.name} - ${err.message}`);
                    }
                  }
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-dark-border text-dark-muted hover:text-dark-text' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                }`}
                title="Record voice message"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={handleTyping}
                placeholder="Type a message..."
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck="true"
                inputMode="text"
                onBlur={(e) => {
                  // Prevent keyboard from closing when tapping send button
                  // by checking if the related target is the submit button
                  const relatedTarget = e.relatedTarget;
                  if (relatedTarget?.type === 'submit') {
                    e.preventDefault();
                    requestAnimationFrame(() => {
                      inputRef.current?.focus({ preventScroll: true });
                    });
                  }
                }}
                className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border transition-all
                           text-base focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  isDark 
                    ? 'bg-dark-bg border-dark-border text-dark-text placeholder:text-dark-muted' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <button
                type="submit"
                disabled={!message.trim()}
                onTouchStart={(e) => {
                  // Prevent default touch behavior that might blur the input
                  if (message.trim()) {
                    e.preventDefault();
                  }
                }}
                onMouseDown={(e) => {
                  // Prevent mousedown from stealing focus
                  e.preventDefault();
                }}
                onClick={(e) => {
                  // Handle click for desktop
                  if (message.trim()) {
                    handleSend(e);
                  }
                }}
                className="gradient-bg text-white p-2.5 sm:p-3 rounded-xl hover:opacity-90 
                          transition-opacity disabled:opacity-50 disabled:cursor-not-allowed
                          flex items-center justify-center min-w-[44px] touch-manipulation"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </main>
      </div>

      {/* Footer Credit - hidden on very small screens */}
      <footer className={`hidden sm:block text-center py-2 text-xs ${
        isDark ? 'bg-dark-card text-dark-muted border-t border-dark-border' : 'bg-white text-slate-400 border-t border-slate-100'
      }`}>
        Crafted with <span className="text-red-500">❤️</span> by Hirachand Barik
      </footer>
      
      {/* Voice Recorder Modal */}
      <VoiceRecorder
        isOpen={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onSendVoice={(audioData) => {
          sendVoice(audioData);
          setShowVoiceRecorder(false);
        }}
      />
      
      {/* Media Uploader Modal */}
      <MediaUploader
        isOpen={showMediaUploader}
        onClose={() => setShowMediaUploader(false)}
        onSendMedia={(mediaData) => {
          sendMedia(mediaData);
          setShowMediaUploader(false);
        }}
      />
      
      {/* Admin Controls Modal */}
      <AdminControls
        isOpen={showAdminControls}
        onClose={() => setShowAdminControls(false)}
      />
    </div>
  );
}

// Users List Component
function UsersList({ users, nickname, isDark }) {
  return (
    <ul className="space-y-2">
      {users.map((user, index) => (
        <li
          key={index}
          className={`flex items-center gap-3 p-2 rounded-lg ${
            user.nickname === nickname
              ? isDark ? 'bg-primary-900/30' : 'bg-primary-50'
              : ''
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            user.nickname === nickname
              ? 'gradient-bg text-white'
              : isDark ? 'bg-dark-border text-dark-text' : 'bg-slate-200 text-slate-700'
          }`}>
            {user.nickname?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {user.nickname}
              {user.nickname === nickname && (
                <span className={`ml-2 text-xs ${isDark ? 'text-primary-400' : 'text-primary-600'}`}>
                  (You)
                </span>
              )}
            </p>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500" />
        </li>
      ))}
    </ul>
  );
}
