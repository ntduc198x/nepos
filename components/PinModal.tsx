
import React, { useState, useEffect } from 'react';
import { X, Delete, Check } from 'lucide-react';

interface PinModalProps {
  title: string;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({ title, onCancel, onSubmit }) => {
  const [pin, setPin] = useState('');

  useEffect(() => {
    // Local keydown for Numpad support
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Escape via local handler IF global shortcuts are disabled or redundant? 
      // Requirement: "Esc -> close topmost modal ... controlled by settings.enableShortcuts".
      // App.tsx dispatches 'pos:shortcut:closeModal' on Esc if enabled.
      // If we remove 'Escape' here, it will rely solely on the event bus.
      // However, if shortcuts are disabled, the user might still expect Esc to close a modal?
      // Spec says "controlled by settings.enableShortcuts". 
      // So if disabled, Esc should NOT work. Thus relying on event bus is correct.
      
      if (e.key === 'Enter' && pin.length === 4) onSubmit(pin);
      if (e.key === 'Backspace') setPin(prev => prev.slice(0, -1));
      if (/^\d$/.test(e.key) && pin.length < 4) setPin(prev => prev + e.key);
    };

    // Global Shortcut Handler
    const handleGlobalClose = () => onCancel();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pos:shortcut:closeModal', handleGlobalClose);
    
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('pos:shortcut:closeModal', handleGlobalClose);
    };
  }, [pin, onCancel, onSubmit]);

  const handleNumClick = (num: number) => {
    if (pin.length < 4) setPin(prev => prev + num.toString());
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (pin.length === 4) onSubmit(pin);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-3xl w-full max-w-xs shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 bg-background border-b border-border text-center relative">
          <h3 className="font-bold text-text-main text-lg">{title}</h3>
          <button onClick={onCancel} className="absolute top-4 right-4 text-secondary hover:text-text-main">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-8 flex justify-center gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`size-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-primary border-primary' : 'border-border bg-surface'}`} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-px bg-border">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button 
              key={num}
              onClick={() => handleNumClick(num)}
              className="bg-surface hover:bg-background/80 active:bg-primary/10 h-16 flex items-center justify-center text-2xl font-bold text-text-main transition-colors"
            >
              {num}
            </button>
          ))}
          <button onClick={handleBackspace} className="bg-surface hover:bg-background/80 active:bg-red-500/10 h-16 flex items-center justify-center text-secondary hover:text-red-500 transition-colors">
            <Delete size={24} />
          </button>
          <button 
            onClick={() => handleNumClick(0)}
            className="bg-surface hover:bg-background/80 active:bg-primary/10 h-16 flex items-center justify-center text-2xl font-bold text-text-main transition-colors"
          >
            0
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={pin.length !== 4}
            className={`h-16 flex items-center justify-center transition-colors font-bold ${pin.length === 4 ? 'bg-primary text-background' : 'bg-surface text-secondary/50 cursor-not-allowed'}`}
          >
            <Check size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
