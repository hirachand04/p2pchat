import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Play, Pause, Download, Reply, File } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

// URL regex pattern for detecting links
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

// Function to parse message content and make links clickable
function parseMessageContent(content, isOwn, isDark) {
  if (!content) return null;
  const parts = content.split(URL_REGEX);
  
  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex
      URL_REGEX.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline break-all hover:opacity-80 transition-opacity ${
            isOwn 
              ? 'text-white underline-offset-2' 
              : isDark 
                ? 'text-primary-400' 
                : 'text-primary-600'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

// Voice message player component
function VoicePlayer({ data, mimeType, duration, isOwn, isDark }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <audio
        ref={audioRef}
        src={`data:${mimeType};base64,${data}`}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
      
      <button
        onClick={togglePlay}
        className={`p-2 rounded-full ${
          isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-primary-500/20 hover:bg-primary-500/30'
        }`}
      >
        {isPlaying ? (
          <Pause className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-primary-500'}`} />
        ) : (
          <Play className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-primary-500'}`} />
        )}
      </button>
      
      <div className="flex-1">
        <div className={`h-1 rounded-full overflow-hidden ${
          isOwn ? 'bg-white/20' : isDark ? 'bg-dark-border' : 'bg-slate-200'
        }`}>
          <div
            className={`h-full transition-all ${isOwn ? 'bg-white' : 'bg-primary-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-xs mt-1 ${isOwn ? 'text-white/70' : isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
          {formatDuration(duration || 0)}
        </span>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, nickname, onReply, messages = [] }) {
  const { isDark } = useThemeStore();
  
  // Render message status ticks (WhatsApp style)
  const renderStatus = () => {
    if (!message.isOwn || message.type !== 'message') return null;
    
    const status = message.status || 'sent';
    
    if (status === 'sent') {
      // Single gray tick - sent
      return <Check className="w-3.5 h-3.5 text-white/60" />;
    } else if (status === 'delivered') {
      // Double gray tick - delivered
      return <CheckCheck className="w-3.5 h-3.5 text-white/60" />;
    } else if (status === 'read') {
      // Double blue tick - read
      return <CheckCheck className="w-3.5 h-3.5 text-blue-300" />;
    }
    return null;
  };
  
  // System message (join/leave notifications)
  if (message.type === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-4"
      >
        <span className={`text-xs px-3 py-1.5 rounded-full ${
          isDark ? 'bg-dark-border text-dark-muted' : 'bg-slate-200 text-slate-500'
        }`}>
          {message.content}
        </span>
      </motion.div>
    );
  }
  
  const isOwn = message.isOwn || message.sender === nickname;
  const time = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // Find replied message if exists
  const repliedMessage = message.replyTo ? messages.find(m => m.id === message.replyTo) : null;

  // Handle file download
  const handleDownload = (data, fileName, fileType) => {
    const link = document.createElement('a');
    link.href = `data:${fileType};base64,${data}`;
    link.download = fileName;
    link.click();
  };

  // Render message content based on type
  const renderContent = () => {
    const mediaType = message.mediaType || 'text';
    
    switch (mediaType) {
      case 'voice':
        return (
          <VoicePlayer
            data={message.mediaData?.data}
            mimeType={message.mediaData?.mimeType}
            duration={message.mediaData?.duration}
            isOwn={isOwn}
            isDark={isDark}
          />
        );
        
      case 'image':
        if (!message.mediaData?.data) {
          return (
            <div className={`p-3 rounded-lg ${isOwn ? 'bg-white/10' : isDark ? 'bg-dark-bg' : 'bg-slate-100'}`}>
              <p className={`text-sm ${isOwn ? 'text-white/70' : isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                📷 Image failed to load
              </p>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <img
              src={`data:${message.mediaData?.fileType};base64,${message.mediaData?.data}`}
              alt={message.mediaData?.fileName || 'Image'}
              className="max-w-full rounded-lg cursor-pointer"
              onClick={() => {
                // Open full size in new tab
                const win = window.open();
                win.document.write(`<img src="data:${message.mediaData?.fileType};base64,${message.mediaData?.data}" />`);
              }}
            />
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {parseMessageContent(message.content, isOwn, isDark)}
              </p>
            )}
          </div>
        );
        
      case 'file':
        return (
          <div 
            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
              isOwn ? 'bg-white/10 hover:bg-white/20' : isDark ? 'bg-dark-bg hover:bg-dark-border' : 'bg-slate-100 hover:bg-slate-200'
            }`}
            onClick={() => handleDownload(message.mediaData?.data, message.mediaData?.fileName, message.mediaData?.fileType)}
          >
            <File className={`w-8 h-8 ${isOwn ? 'text-white' : 'text-primary-500'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isOwn ? 'text-white' : ''}`}>
                {message.mediaData?.fileName}
              </p>
              <p className={`text-xs ${isOwn ? 'text-white/70' : isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                {(message.mediaData?.fileSize / 1024).toFixed(1)} KB
              </p>
            </div>
            <Download className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-primary-500'}`} />
          </div>
        );
        
      default:
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {parseMessageContent(message.content, isOwn, isDark)}
          </p>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[80%] md:max-w-[60%] ${isOwn ? 'order-2' : 'order-1'}`}>
        {/* Sender name (only for others) */}
        {!isOwn && (
          <p className={`text-xs mb-1 ml-3 font-medium ${
            isDark ? 'text-primary-400' : 'text-primary-600'
          }`}>
            {message.sender}
          </p>
        )}
        
        {/* Message bubble */}
        <div className={`relative px-4 py-2.5 rounded-2xl ${
          isOwn
            ? 'gradient-bg text-white rounded-br-md'
            : isDark
              ? 'bg-dark-card text-dark-text rounded-bl-md border border-dark-border'
              : 'bg-white text-slate-900 rounded-bl-md shadow-sm border border-slate-100'
        }`}>
          {/* Reply context */}
          {repliedMessage && (
            <div 
              className={`mb-2 p-2 rounded-lg border-l-2 ${
                isOwn 
                  ? 'bg-white/10 border-white/50' 
                  : isDark 
                    ? 'bg-dark-bg border-primary-500' 
                    : 'bg-slate-100 border-primary-500'
              }`}
            >
              <p className={`text-xs font-medium ${isOwn ? 'text-white/80' : 'text-primary-500'}`}>
                {repliedMessage.sender}
              </p>
              <p className={`text-xs truncate ${isOwn ? 'text-white/60' : isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                {repliedMessage.mediaType === 'voice' ? '🎤 Voice message' : 
                 repliedMessage.mediaType === 'image' ? '📷 Image' :
                 repliedMessage.mediaType === 'file' ? '📎 File' :
                 repliedMessage.content?.slice(0, 50)}
                {repliedMessage.content?.length > 50 ? '...' : ''}
              </p>
            </div>
          )}
          
          {/* Message content */}
          {renderContent()}
          
          {/* Timestamp and status */}
          <div className={`flex items-center justify-end gap-1 mt-1 ${
            isOwn 
              ? 'text-white/70' 
              : isDark ? 'text-dark-muted' : 'text-slate-400'
          }`}>
            <span className="text-[10px]">{time}</span>
            {renderStatus()}
          </div>
          
          {/* Reply button - appears on hover */}
          {/* Sent messages (right): button on left side, Received messages (left): button on right side */}
          {onReply && message.type === 'message' && (
            <button
              onClick={() => onReply(message)}
              className={`absolute ${isOwn ? '-left-8' : '-right-8'} top-1/2 -translate-y-1/2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 ${
                isDark ? 'bg-dark-border hover:bg-dark-muted/50 text-dark-text' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              } shadow-md`}
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
