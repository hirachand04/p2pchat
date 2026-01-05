import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, UserX, VolumeX, Volume2, X, UserCheck, Ban } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useChatStore } from '../store/chatStore';

export default function AdminControls({ isOpen, onClose }) {
  const { isDark } = useThemeStore();
  const { 
    users, 
    nickname, 
    isAdmin, 
    mutedUsers,
    bannedUsers,
    kickUser, 
    muteUser, 
    unmuteUser,
    unbanUser,
    getBannedUsers,
    socket 
  } = useChatStore();
  
  // Fetch banned users when modal opens
  useEffect(() => {
    if (isOpen && isAdmin) {
      getBannedUsers();
    }
  }, [isOpen, isAdmin]);
  
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);
  
  if (!isAdmin) return null;
  
  // Get current user's socket id
  const currentUserId = socket?.id;
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`fixed inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-sm p-4 rounded-xl z-50 ${
              isDark ? 'bg-dark-card border border-dark-border' : 'bg-white shadow-xl'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <h3 className={`font-semibold ${isDark ? 'text-dark-text' : 'text-slate-900'}`}>
                  Admin Controls
                </h3>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-full ${
                  isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* User list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.filter(u => u.nickname !== nickname).map((user) => {
                const isMuted = mutedUsers.includes(user.id);
                
                return (
                  <div 
                    key={user.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isDark ? 'bg-dark-bg' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isDark ? 'bg-dark-border text-dark-text' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {user.nickname?.charAt(0)?.toUpperCase()}
                      </div>
                      <span className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                        {user.nickname}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => isMuted ? unmuteUser(user.id) : muteUser(user.id)}
                        title={isMuted ? 'Unmute user' : 'Mute user'}
                        className={`p-2 rounded-lg transition-colors ${
                          isMuted
                            ? 'bg-orange-500/20 text-orange-500'
                            : isDark ? 'hover:bg-dark-border text-dark-muted' : 'hover:bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isMuted ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (confirm(`Are you sure you want to kick ${user.nickname}?`)) {
                            kickUser(user.id);
                          }
                        }}
                        title="Kick user"
                        className={`p-2 rounded-lg transition-colors ${
                          isDark ? 'hover:bg-red-500/20' : 'hover:bg-red-50'
                        } text-red-500`}
                      >
                        <UserX className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>
                );
              })}
              
              {users.filter(u => u.nickname !== nickname).length === 0 && (
                <div className={`text-center py-8 ${
                  isDark ? 'text-dark-muted' : 'text-slate-500'
                }`}>
                  <p className="text-sm">No other users to manage</p>
                  <p className="text-xs mt-1">Invite someone to join!</p>
                </div>
              )}
            </div>
            
            {/* Banned Users Section */}
            {bannedUsers && bannedUsers.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="w-4 h-4 text-red-500" />
                  <h4 className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                    Banned Users ({bannedUsers.length})
                  </h4>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {bannedUsers.map((banned) => (
                    <div 
                      key={banned.ip}
                      className={`flex items-center justify-between p-2 rounded-lg ${
                        isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-red-500/20 text-red-500`}>
                          {banned.nickname?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className={`text-sm ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>
                          {banned.nickname || 'Unknown'}
                        </span>
                      </div>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (confirm(`Allow ${banned.nickname} to rejoin the chat?`)) {
                            unbanUser(banned.ip);
                          }
                        }}
                        title="Unban - Allow to rejoin"
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDark ? 'hover:bg-green-500/20' : 'hover:bg-green-50'
                        } text-green-500`}
                      >
                        <UserCheck className="w-4 h-4" />
                      </motion.button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Info text */}
            <p className={`mt-4 text-xs text-center ${
              isDark ? 'text-dark-muted' : 'text-slate-500'
            }`}>
              Kicked users are banned and can only rejoin if you approve them
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
