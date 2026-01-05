import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, X, Loader2, FileImage, File, Upload } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB max
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain'];

export default function MediaUploader({ isOpen, onClose, onSendMedia }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef(null);
  const { isDark } = useThemeStore();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPreview(null);
      setError(null);
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

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

  const handleFileSelect = useCallback((file) => {
    setError(null);
    
    if (!file) return;
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 20MB.');
      return;
    }
    
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError('Unsupported file type. Please use JPG, PNG, GIF, WebP, PDF, or TXT.');
      return;
    }
    
    setSelectedFile(file);
    
    // Generate preview for images
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, []);

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        const isImage = ALLOWED_IMAGE_TYPES.includes(selectedFile.type);
        
        onSendMedia({
          type: isImage ? 'image' : 'file',
          data: base64,
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
          preview: isImage ? reader.result : null
        });
        
        // Reset state and close modal after sending
        setSelectedFile(null);
        setPreview(null);
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        onClose();
      };
      reader.onerror = () => {
        console.error('Failed to read file');
        setError('Failed to read file');
        setIsProcessing(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      console.error('Failed to process file:', err);
      setError('Failed to process file');
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 bg-black/50 z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={`w-full max-w-md p-4 rounded-xl pointer-events-auto ${
                isDark ? 'bg-dark-card border border-dark-border' : 'bg-white shadow-xl'
              }`}
            >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${isDark ? 'text-dark-text' : 'text-slate-900'}`}>
                Send Media
              </h3>
              <button
                onClick={handleCancel}
                className={`p-1.5 rounded-full ${
                  isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_FILE_TYPES.join(',')}
              onChange={handleInputChange}
              className="hidden"
            />
            
            {!selectedFile ? (
              // File selection area
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-primary-500 bg-primary-500/10'
                    : isDark
                      ? 'border-dark-border hover:border-primary-500'
                      : 'border-slate-300 hover:border-primary-500'
                }`}
              >
                <Upload className={`w-12 h-12 mx-auto mb-3 ${
                  isDark ? 'text-dark-muted' : 'text-slate-400'
                }`} />
                <p className={`text-sm font-medium mb-1 ${
                  isDark ? 'text-dark-text' : 'text-slate-700'
                }`}>
                  Drop an image or file here
                </p>
                <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                  or click to select (max 5MB)
                </p>
                <p className={`text-xs mt-2 ${isDark ? 'text-dark-muted' : 'text-slate-400'}`}>
                  JPG, PNG, GIF, WebP, PDF, TXT
                </p>
              </div>
            ) : (
              // File preview
              <div className="space-y-4">
                {preview ? (
                  <div className="relative">
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-64 mx-auto rounded-lg"
                    />
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className={`flex items-center gap-3 p-4 rounded-lg ${
                    isDark ? 'bg-dark-bg' : 'bg-slate-100'
                  }`}>
                    <File className="w-10 h-10 text-primary-500" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isDark ? 'text-dark-text' : 'text-slate-700'
                      }`}>
                        {selectedFile.name}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className={`p-1.5 rounded ${
                        isDark ? 'hover:bg-dark-border' : 'hover:bg-slate-200'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium ${
                      isDark 
                        ? 'bg-dark-border hover:bg-dark-muted/20 text-dark-text' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={isProcessing}
                    className="flex-1 py-2.5 px-4 gradient-bg text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Send'
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {error && (
              <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
            )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
