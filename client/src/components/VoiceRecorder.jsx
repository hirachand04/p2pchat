import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Send, Trash2, Loader2, X } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

export default function VoiceRecorder({ isOpen, onClose, onSendVoice }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  
  const { isDark } = useThemeStore();
  
  const MAX_DURATION = 120; // 2 minutes max

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      streamRef.current = null;
    }
    
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  // Reset all state
  const resetState = useCallback(() => {
    cleanup();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
  }, [cleanup, audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const startRecording = async () => {
    setError(null);
    
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser does not support audio recording.');
      return;
    }

    try {
      // First, check current permission state if available
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
          console.log('Microphone permission state:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            setError('Microphone permission is blocked. Click the lock/site settings icon in your browser address bar to allow microphone access, then try again.');
            return;
          }
        } catch (permErr) {
          // Some browsers don't support querying microphone permission, continue anyway
          console.log('Could not query permission:', permErr);
        }
      }

      console.log('Requesting microphone access...');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      console.log('Microphone access granted, got stream:', stream.id);
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Find supported mimeType
      let mimeType = '';
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      // Create MediaRecorder
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { 
            type: mediaRecorder.mimeType || 'audio/webm'
          });
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
        }
        setIsRecording(false);
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError('Recording error occurred.');
        cleanup();
        setIsRecording(false);
      };
      
      // Start recording
      mediaRecorder.start(1000);
      setIsRecording(true);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_DURATION) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (err) {
      console.error('Recording error:', err.name, err.message);
      
      let errorMessage = 'Could not access microphone.';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please allow microphone permission and try again.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Microphone is in use by another application.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Microphone settings not supported.';
      }
      
      setError(errorMessage);
      cleanup();
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        onSendVoice({
          type: 'voice',
          data: base64,
          duration: recordingTime,
          mimeType: audioBlob.type
        });
        resetState();
        onClose();
      };
      reader.onerror = () => {
        setError('Failed to process audio.');
        setIsProcessing(false);
      };
      reader.readAsDataURL(audioBlob);
    } catch (err) {
      console.error('Failed to process audio:', err);
      setError('Failed to process audio.');
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/50 z-50"
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className={`w-full max-w-md p-4 rounded-xl pointer-events-auto ${
            isDark ? 'bg-dark-card border border-dark-border' : 'bg-white shadow-xl'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-semibold ${isDark ? 'text-dark-text' : 'text-slate-900'}`}>
              Voice Message
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className={`p-1.5 rounded-full ${
                isDark ? 'hover:bg-dark-border text-dark-text' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-500 text-center">{error}</p>
            </div>
          )}
          
          {/* Recorder content */}
          <div className="flex flex-col items-center gap-4">
            {!isRecording && !audioBlob ? (
              // Start recording button
              <>
                <button
                  onClick={startRecording}
                  className="flex flex-col items-center gap-3 p-8 gradient-bg text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  <Mic className="w-12 h-12" />
                </button>
                <p className={`text-sm text-center ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                  Tap to start recording (max 2 minutes)
                </p>
              </>
            ) : isRecording ? (
              // Recording in progress
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className={`font-mono text-2xl ${isDark ? 'text-dark-text' : 'text-slate-900'}`}>
                    {formatTime(recordingTime)}
                  </span>
                </div>
                
                <div className="w-full h-12 flex items-center justify-center gap-1 px-4">
                  {[...Array(30)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: [8, Math.random() * 32 + 8, 8]
                      }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.03
                      }}
                      className="w-1.5 bg-primary-500 rounded-full"
                    />
                  ))}
                </div>
                
                <p className={`text-sm ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                  {MAX_DURATION - recordingTime}s remaining
                </p>
                
                <button
                  onClick={stopRecording}
                  className="p-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <Square className="w-6 h-6" />
                </button>
              </div>
            ) : audioBlob ? (
              // Recording complete, preview
              <div className="flex flex-col items-center gap-4 w-full">
                <audio src={audioUrl} controls className="w-full" />
                
                <span className={`font-mono text-lg ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                  Duration: {formatTime(recordingTime)}
                </span>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClose}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      isDark ? 'bg-dark-border hover:bg-dark-muted/50 text-red-400' : 'bg-slate-100 hover:bg-slate-200 text-red-500'
                    }`}
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>Discard</span>
                  </button>
                  
                  <button
                    onClick={handleSend}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 gradient-bg text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    <span>Send</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
