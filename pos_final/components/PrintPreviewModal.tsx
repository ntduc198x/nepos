
import React, { useState, useEffect } from 'react';
import { X, Copy, Check, FileText, Printer } from 'lucide-react';
import { usePrintPreview } from '../context/PrintPreviewContext';
import { useTheme } from '../ThemeContext';
import { printViaIframe } from '../services/printService';

export const PrintPreviewModal: React.FC = () => {
  const { isOpen, data, closePreview } = usePrintPreview();
  const { t } = useTheme();
  const [copied, setCopied] = useState(false);

  // --- SHORTCUT LOGIC ---
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => closePreview();
    window.addEventListener('pos:shortcut:closeModal', handleClose);
    return () => window.removeEventListener('pos:shortcut:closeModal', handleClose);
  }, [isOpen, closePreview]);

  if (!isOpen || !data) return null;

  const handleCopy = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.html, 'text/html');
    const textContent = doc.body.innerText.trim();

    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handlePrintAction = () => {
      printViaIframe(data.html);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-border flex justify-between items-center bg-background/50 shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-lg text-primary"><FileText size={20} /></div>
             <div>
                <h3 className="font-bold text-text-main text-lg leading-none">{data.title}</h3>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-1">SAFE PRINT PREVIEW</p>
             </div>
          </div>
          <button onClick={closePreview} className="p-2 hover:bg-border rounded-xl text-secondary transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body (Iframe Container) */}
        <div className="flex-1 overflow-hidden relative bg-gray-200 flex justify-center p-6">
           <div 
             className="h-full overflow-y-auto custom-scrollbar bg-white shadow-lg ring-1 ring-black/5 relative"
             style={{ 
                 // Force wider visual container to show paper edges clearly
                 width: '100%',
                 maxWidth: '400px', // Max reasonable width for preview
                 padding: '20px 0', 
                 display: 'flex',
                 justifyContent: 'center',
                 alignItems: 'flex-start'
             }}
           >
              {/* Iframe renders the HTML which already has strict width and centering logic inside */}
              <iframe 
                srcDoc={data.html} 
                className="border-none pointer-events-none select-none bg-white block shadow-sm" 
                style={{ 
                    // Let the internal HTML dictate the width (58mm or 72mm)
                    // We simply provide full height
                    width: '100%', 
                    height: '100%',
                    minHeight: '400px'
                }} 
                title="Receipt Preview" 
              />
           </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-background shrink-0 flex gap-3">
           <button onClick={closePreview} className="flex-1 py-3 border border-border rounded-xl font-bold text-secondary hover:bg-border transition-colors">
             {t('Đóng')}
           </button>
           <button onClick={handlePrintAction} className="flex-1 py-3 bg-surface border-2 border-primary/20 text-primary font-bold rounded-xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2">
             <Printer size={18} /> {t('In Ngay')}
           </button>
           <button onClick={handleCopy} className="flex-1 py-3 bg-primary text-background rounded-xl font-bold hover:bg-primary-hover shadow-lg flex items-center justify-center gap-2 transition-all">
             {copied ? <Check size={18} /> : <Copy size={18} />}
             {copied ? t('Đã sao chép') : t('Copy Text')}
           </button>
        </div>
      </div>
    </div>
  );
};
