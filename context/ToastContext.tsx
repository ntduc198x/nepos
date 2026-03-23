
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToast({ id, message, type });
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[10000] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border animate-in slide-in-from-top-2 fade-in duration-300
          ${toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' :
            toast.type === 'error' ? 'bg-red-500 text-white border-red-600' :
            toast.type === 'warning' ? 'bg-amber-500 text-white border-amber-600' :
            'bg-blue-500 text-white border-blue-600'
          }`}>
          {toast.type === 'success' && <CheckCircle2 size={20} />}
          {toast.type === 'error' && <XCircle size={20} />}
          {toast.type === 'warning' && <AlertTriangle size={20} />}
          {toast.type === 'info' && <Info size={20} />}
          <span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
