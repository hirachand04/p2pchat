import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useChatStore } from './store/chatStore';
import { useThemeStore } from './store/themeStore';
import LandingPage from './components/LandingPage';
import ChatRoom from './components/ChatRoom';

function App() {
  const { isInChat, rejoinSession, initSocket } = useChatStore();
  const { isDark } = useThemeStore();
  const [isRejoining, setIsRejoining] = useState(false);

  // Check URL for session code on mount and handle rejoining
  useEffect(() => {
    const checkUrlForSession = async () => {
      const path = window.location.pathname;
      const sessionCode = path.replace('/', '').toUpperCase();
      
      // Check if there's a valid session code in URL (8 characters)
      if (sessionCode && sessionCode.length === 8 && /^[A-Z0-9]+$/.test(sessionCode)) {
        const savedNickname = sessionStorage.getItem('p2pchat_nickname');
        
        setIsRejoining(true);
        initSocket();
        
        // Wait a bit for socket to connect
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await rejoinSession(sessionCode, savedNickname);
        setIsRejoining(false);
      }
    };
    
    checkUrlForSession();
  }, []);

  useEffect(() => {
    // Apply dark mode class to document
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark 
        ? 'bg-dark-bg text-dark-text' 
        : 'bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900'
    }`}>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: isDark ? '#1a1a1a' : '#ffffff',
            color: isDark ? '#e5e5e5' : '#1a1a1a',
            border: isDark ? '1px solid #2a2a2a' : '1px solid #e5e5e5',
          },
        }}
      />
      
      {isRejoining ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className={isDark ? 'text-dark-muted' : 'text-slate-600'}>Rejoining chat...</p>
          </div>
        </div>
      ) : isInChat ? <ChatRoom /> : <LandingPage />}
    </div>
  );
}

export default App;
