
import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
  onConfirm,
  confirmText,
  cancelText,
  isDanger = false
}) => {
  const { t } = useTheme();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        <div className="p-6 pb-4 flex items-start gap-4">
          <div className={`p-3 rounded-full shrink-0 ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-text-main mb-2 leading-none">{title}</h3>
            <p className="text-sm text-secondary leading-relaxed">{message}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-secondary hover:text-text-main transition-colors -mt-2 -mr-2 p-2"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 pt-2 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-border rounded-xl font-bold text-secondary hover:bg-background transition-colors text-sm"
          >
            {cancelText || t('Cancel')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-lg transition-all text-sm active:scale-95
              ${isDanger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-primary hover:bg-primary-hover shadow-primary/20'}
            `}
          >
            {confirmText || t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
