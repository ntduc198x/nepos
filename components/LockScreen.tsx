
import React, { useState, useEffect, useRef } from 'react';
import { Lock, Delete, Unlock, AlertCircle, ChefHat, User } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettingsContext } from '../context/SettingsContext';
import { useTheme } from '../ThemeContext';
import { SettingsService } from '../services/SettingsService';

export const LockScreen: React.FC = () => {
  const { isLocked, unlockApp, user, role } = useAuth();
  const { settings } = useSettingsContext();
  const { t } = useTheme();
  
  const [pin, setPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Ref to trap focus or handle keyboard events globally
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus trap and Reset on Mount
  useEffect(() => {
    if (isLocked) {
      setPin('');
      setIsError(false);
      containerRef.current?.focus();
    }
  }, [isLocked]);

  // Keyboard Event Listener
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent ESC from unlocking or closing
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isVerifying) return;

      if (/^\d$/.test(e.key)) {
        handleNumInput(parseInt(e.key, 10));
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        if (pin.length === 4) handleUnlock();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Capture phase to block other listeners
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isLocked, pin, isVerifying]);

  const handleNumInput = (num: number) => {
    if (pin.length < 4) {
      setPin(prev => prev + num.toString());
      setIsError(false);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setIsError(false);
  };

  const handleClear = () => {
    setPin('');
    setIsError(false);
  };

  const handleUnlock = async () => {
    if (pin.length !== 4) return;
    
    setIsVerifying(true);
    
    try {
      // Small artificial delay for UX smoothness if desired (optional)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify PIN against current user session (async)
      const isValid = await SettingsService.verifyPin(pin, user);
      
      if (isValid) {
        setPin('');
        unlockApp();
      } else {
        setIsError(true);
        // Auto clear after error shake animation finishes
        setTimeout(() => {
            setPin('');
            setIsError(false);
        }, 600);
      }
    } catch (e) {
      console.error("Unlock error:", e);
      setIsError(true);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isLocked) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-[#11211c] flex items-center justify-center text-white overflow-hidden select-none outline-none"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from passing through
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
         <div className="absolute inset-0 bg-gradient-to-br from-black via-transparent to-black" />
         <img 
            src="https://images.unsplash.com/photo-1550989460-0adf9ea622e2?q=80&w=2070&auto=format&fit=crop" 
            className="w-full h-full object-cover grayscale" 
            alt="Lock BG" 
         />
      </div>

      {/* Main Card */}
      <div className={`relative z-10 w-full max-w-sm mx-4 bg-[#1a2c26]/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6 transition-transform duration-100 ${isError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div className="size-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-2">
            <Lock size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">{t('POS Locked')}</h1>
          {user && (
             <div className="flex items-center gap-2 text-white/50 text-xs font-medium bg-white/5 px-3 py-1 rounded-full border border-white/5">
                <User size={12} />
                <span>{user.user_metadata?.full_name || user.email}</span>
                <span className="w-px h-3 bg-white/20 mx-1"></span>
                <span className="uppercase tracking-wider">{role}</span>
             </div>
          )}
        </div>

        {/* PIN Display */}
        <div className="w-full flex flex-col items-center gap-2">
            <div className="flex gap-4 mb-2">
            {[0, 1, 2, 3].map((i) => (
                <div 
                key={i} 
                className={`size-4 rounded-full border-2 transition-all duration-300 ${
                    i < pin.length 
                    ? 'bg-primary border-primary scale-110 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                    : 'bg-transparent border-white/20'
                } ${isError ? 'border-red-500 bg-red-500/20' : ''}`}
                />
            ))}
            </div>
            <p className={`text-xs font-bold h-4 transition-colors ${isError ? 'text-red-500 animate-pulse' : 'text-white/40'}`}>
               {isError ? t('Invalid PIN') : t('Enter PIN to continue')}
            </p>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumInput(num)}
              disabled={isVerifying}
              className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/5 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <button 
            onClick={handleClear}
            disabled={isVerifying}
            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-red-500/20 text-white/70 hover:text-red-400 font-bold transition-all active:scale-95 flex items-center justify-center disabled:opacity-50 text-xs uppercase tracking-wider"
          >
            {t('Clear')}
          </button>
          <button
            onClick={() => handleNumInput(0)}
            disabled={isVerifying}
            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/5 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button 
            onClick={handleBackspace}
            disabled={isVerifying}
            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 text-white/70 hover:text-white font-bold transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
          >
            <Delete size={24} />
          </button>
        </div>

        {/* Unlock Button */}
        <button
          onClick={handleUnlock}
          disabled={pin.length !== 4 || isVerifying}
          className={`w-full h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-lg transition-all ${
             pin.length === 4 
             ? 'bg-primary text-[#1a2c26] hover:bg-primary-hover hover:scale-[1.02] active:scale-95 shadow-primary/25' 
             : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          {isVerifying ? (
             <div className="size-6 border-2 border-[#1a2c26]/30 border-t-[#1a2c26] rounded-full animate-spin" />
          ) : (
             <>
               <Unlock size={20} /> {t('Unlock')}
             </>
          )}
        </button>

      </div>
      
      {/* Footer Branding */}
      <div className="absolute bottom-8 flex items-center gap-2 text-white/20">
         <ChefHat size={16} />
         <span className="text-xs font-black uppercase tracking-[0.2em]">NEPOS System</span>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};
