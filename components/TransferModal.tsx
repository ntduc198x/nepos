
import React, { useState, useMemo } from 'react';
import { X, ArrowRight, ArrowRightLeft, Users, Check, Loader2 } from 'lucide-react';
// Corrected import to use central types file instead of screens/FloorPlan
import { TableData } from '../types';
import { useTheme } from '../ThemeContext';
import { useSettingsContext } from '../context/SettingsContext';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetTableId: string, mode: 'move' | 'merge') => Promise<void>;
  currentTable: TableData;
  allTables: TableData[];
  isProcessing: boolean;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentTable,
  allTables,
  isProcessing
}) => {
  const { t } = useTheme();
  const { can } = useSettingsContext();
  const [mode, setMode] = useState<'move' | 'merge'>('move');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // LOGIC LỌC & SẮP XẾP DANH SÁCH BÀN ĐÍCH
  const targetTables = useMemo(() => {
    const filtered = allTables.filter(t => {
      // Không hiện bàn hiện tại
      if (t.id === currentTable.id) return false;

      // Không hiện bàn mang về / quầy
      if (t.id === 'Takeaway' || t.id === 'Counter') return false;

      if (mode === 'move') {
        // Chuyển bàn: Chỉ hiện bàn TRỐNG
        return t.status === 'Available';
      } else {
        // Gộp bàn: Chỉ hiện bàn CÓ KHÁCH (Occupied)
        return t.status === 'Occupied';
      }
    });

    // Natural Sort: VIP 2 < VIP 10
    return filtered.sort((a, b) => 
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [allTables, currentTable, mode]);

  if (!isOpen) return null;

  const canMerge = can('bill.merge');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-border bg-background flex justify-between items-center shrink-0">
          <h3 className="font-bold text-text-main text-lg">{t('Table Actions')}</h3>
          <button onClick={onClose} disabled={isProcessing}>
            <X size={20} className="text-secondary hover:text-text-main" />
          </button>
        </div>

        {/* Mode Selection Tabs */}
        <div className="flex p-2 bg-background border-b border-border shrink-0">
          <button
            onClick={() => { setMode('move'); setSelectedTargetId(null); }}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all
              ${mode === 'move' ? 'bg-primary text-background shadow-md' : 'text-secondary hover:bg-surface'}`}
          >
            <ArrowRight size={18} /> {t('Move Table')}
          </button>
          
          {canMerge && (
            <button
              onClick={() => { setMode('merge'); setSelectedTargetId(null); }}
              className={`flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all
                ${mode === 'merge' ? 'bg-primary text-background shadow-md' : 'text-secondary hover:bg-surface'}`}
            >
              <Users size={18} /> {t('Merge Table')}
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar bg-surface/50">
           <div className="text-center mb-4">
              <p className="text-secondary text-xs uppercase font-bold tracking-wider mb-1">{t('From Table')}</p>
              <div className="text-2xl font-black text-text-main">{currentTable.label}</div>
              <p className="text-xs text-secondary mt-1">{mode === 'move' ? t('Select an empty table to move to') : t('Select an occupied table to merge with')}</p>
           </div>

           <div className="grid grid-cols-2 gap-3">
              {targetTables.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-secondary text-sm border-2 border-dashed border-border rounded-xl">
                  {mode === 'move' ? t('No empty tables available') : t('No other occupied tables')}
                </div>
              ) : (
                targetTables.map(table => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTargetId(table.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all
                      ${selectedTargetId === table.id 
                        ? 'bg-primary/10 border-primary ring-1 ring-primary' 
                        : 'bg-background border-border hover:border-primary/50'
                      }`}
                  >
                     <div className={`font-bold ${selectedTargetId === table.id ? 'text-primary' : 'text-text-main'}`}>{table.label}</div>
                     {table.status === 'Occupied' && (
                        <div className="text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded font-bold">In Use</div>
                     )}
                     {table.status === 'Available' && (
                        <div className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded font-bold">Empty</div>
                     )}
                  </button>
                ))
              )}
           </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-background shrink-0">
           <button
             onClick={() => selectedTargetId && onConfirm(selectedTargetId, mode)}
             disabled={!selectedTargetId || isProcessing}
             className="w-full h-12 bg-primary text-background rounded-xl font-bold text-sm hover:bg-primary-hover shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Check size={18} />}
             {t('Confirm')}
           </button>
        </div>

      </div>
    </div>
  );
};
