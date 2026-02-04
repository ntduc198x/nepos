
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PrintAction } from '../types/settingsTypes';

interface PreviewData {
  html: string;
  title: string;
  meta?: {
    action: PrintAction;
    orderId?: string;
  };
}

interface PrintPreviewContextType {
  isOpen: boolean;
  data: PreviewData | null;
  openPreview: (data: PreviewData) => void;
  closePreview: () => void;
}

const PrintPreviewContext = createContext<PrintPreviewContextType | undefined>(undefined);

export const PrintPreviewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);

  const openPreview = (newData: PreviewData) => {
    setData(newData);
    setIsOpen(true);
  };

  const closePreview = () => {
    setIsOpen(false);
    setData(null);
  };

  return (
    <PrintPreviewContext.Provider value={{ isOpen, data, openPreview, closePreview }}>
      {children}
    </PrintPreviewContext.Provider>
  );
};

export const usePrintPreview = () => {
  const context = useContext(PrintPreviewContext);
  if (!context) throw new Error('usePrintPreview must be used within PrintPreviewProvider');
  return context;
};
