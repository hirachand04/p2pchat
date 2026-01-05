import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Users, 
  Lock, 
  Zap, 
  ArrowRight, 
  Copy, 
  Sun, 
  Moon,
  Shield,
  Clock,
  Trash2
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';

export default function LandingPage() {
  // Check URL for initial code (in case session expired but user has the link)
  const getInitialCode = () => {
    const path = window.location.pathname;
    const code = path.replace('/', '').toUpperCase();
    if (code && code.length === 8 && /^[A-Z0-9]+$/.test(code)) {
      return code;
    }
    return '';
  };
  
  const [joinCode, setJoinCode] = useState(getInitialCode);
  const [nickname, setNickname] = useState(() => {
    return sessionStorage.getItem('p2pchat_nickname') || '';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const { createSession, joinSession, initSocket } = useChatStore();
  const { isDark, toggleTheme } = useThemeStore();

  const handleCreate = async () => {
    setIsCreating(true);
    initSocket();
    await createSession(nickname.trim() || null);
    setIsCreating(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      toast.error('Please enter a session code');
      return;
    }
    
    setIsJoining(true);
    initSocket();
    await joinSession(joinCode.trim(), nickname.trim() || null);
    setIsJoining(false);
  };

  const features = [
    {
      icon: Lock,
      title: 'End-to-End Encrypted',
      description: 'All messages are encrypted. Not even we can read them.'
    },
    {
      icon: Clock,
      title: 'Ephemeral',
      description: 'No data storage. Everything vanishes when you leave.'
    },
    {
      icon: Users,
      title: 'Group Chat',
      description: 'Up to 64 users can join a single session.'
    },
    {
      icon: Trash2,
      title: 'No Account Needed',
      description: 'Just create or join. No signup, no login, no trace.'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold gradient-text">P2P Chat</span>
        </div>
        
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            isDark 
              ? 'bg-dark-card hover:bg-dark-border' 
              : 'bg-white hover:bg-slate-100 shadow-sm'
          }`}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-8 sm:mb-12"
        >
          <h1 className="text-3xl xs:text-4xl md:text-6xl font-bold mb-3 sm:mb-4 leading-tight">
            <span className="gradient-text">Secure</span> & <span className="gradient-text">Ephemeral</span>
            <br />Chat Platform
          </h1>
          <p className={`text-base sm:text-lg md:text-xl px-2 ${isDark ? 'text-dark-muted' : 'text-slate-600'}`}>
            End-to-end encrypted messaging that leaves no trace.
            <br className="hidden xs:block" />
            <span className="xs:hidden"> </span>No login required. Just connect and chat.
          </p>
        </motion.div>

        {/* Action Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-xl mx-auto grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2"
        >
          {/* Create Chat Card */}
          <div className={`p-4 sm:p-6 rounded-2xl ${
            isDark 
              ? 'bg-dark-card border border-dark-border' 
              : 'bg-white shadow-lg'
          }`}>
            <div className="w-10 sm:w-12 h-10 sm:h-12 gradient-bg rounded-xl flex items-center justify-center mb-3 sm:mb-4">
              <Zap className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2">Create New Chat</h2>
            <p className={`text-xs sm:text-sm mb-3 sm:mb-4 ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
              Start a secure session and invite others with a code
            </p>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your name (optional)"
              maxLength={20}
              autoComplete="name"
              className={`w-full px-3 sm:px-4 py-2.5 rounded-xl border mb-3 text-sm
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${
                isDark 
                  ? 'bg-dark-bg border-dark-border text-dark-text placeholder:text-dark-muted' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
              }`}
            />
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="w-full gradient-bg text-white py-2.5 sm:py-3 px-4 rounded-xl font-medium 
                         hover:opacity-90 transition-opacity flex items-center justify-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              {isCreating ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Create Chat <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Join Chat Card */}
          <div className={`p-4 sm:p-6 rounded-2xl ${
            isDark 
              ? 'bg-dark-card border border-dark-border' 
              : 'bg-white shadow-lg'
          }`}>
            <div className={`w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center mb-3 sm:mb-4 ${
              isDark ? 'bg-dark-border' : 'bg-slate-100'
            }`}>
              <Users className="w-5 sm:w-6 h-5 sm:h-6 text-primary-500" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2">Join with Code</h2>
            <p className={`text-xs sm:text-sm mb-3 sm:mb-4 ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
              Enter the session code to join an existing chat
            </p>
            <form onSubmit={handleJoin} className="space-y-2 sm:space-y-3">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your name (optional)"
                maxLength={20}
                autoComplete="name"
                className={`w-full px-3 sm:px-4 py-2.5 rounded-xl border text-sm
                           focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${
                  isDark 
                    ? 'bg-dark-bg border-dark-border text-dark-text placeholder:text-dark-muted' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g., ABC12345)"
                maxLength={8}
                autoComplete="off"
                className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border text-center font-mono text-base sm:text-lg uppercase tracking-wider
                           focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${
                  isDark 
                    ? 'bg-dark-bg border-dark-border text-dark-text placeholder:text-dark-muted' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <button
                type="submit"
                disabled={isJoining || !joinCode.trim()}
                className={`w-full py-2.5 sm:py-3 px-4 rounded-xl font-medium transition-all 
                           flex items-center justify-center gap-2
                           disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${
                  isDark 
                    ? 'bg-dark-border hover:bg-dark-muted/20 text-dark-text' 
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {isJoining ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Join Chat <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-4xl mx-auto mt-8 sm:mt-16 grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4"
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className={`p-3 sm:p-4 rounded-xl text-center ${
                isDark ? 'bg-dark-card/50' : 'bg-white/50'
              }`}
            >
              <div className={`w-8 sm:w-10 h-8 sm:h-10 mx-auto rounded-lg flex items-center justify-center mb-2 sm:mb-3 ${
                isDark ? 'bg-dark-border' : 'bg-slate-100'
              }`}>
                <feature.icon className="w-4 sm:w-5 h-4 sm:h-5 text-primary-500" />
              </div>
              <h3 className="font-semibold mb-1 text-xs sm:text-sm">{feature.title}</h3>
              <p className={`text-[10px] sm:text-xs leading-tight ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                {feature.description}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Security Badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className={`mt-6 sm:mt-12 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full ${
            isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-700'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span className="text-sm font-medium">256-bit AES Encryption</span>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className={`p-6 text-center ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
        <p className="text-sm">
          Crafted with <span className="text-red-500">❤️</span> by Hirachand Barik
        </p>
      </footer>
    </div>
  );
}
