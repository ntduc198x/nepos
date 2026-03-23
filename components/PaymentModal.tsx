
import React, { useState, useMemo, useEffect } from 'react';
import { X, DollarSign, CreditCard, QrCode, Printer, Check, AlertCircle, Percent, Divide, ChevronLeft, Split, Loader2, Minus, Plus, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../ThemeContext';
import { useSettingsContext } from '../context/SettingsContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { playBeep } from '../services/SoundService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (method: 'Cash' | 'Card' | 'Transfer', shouldPrint: boolean, discountInfo?: { amount: number, type: 'percent' | 'amount', value: number }, paymentAmount?: number) => void;
  onPrint: () => void; 
  totalAmount: number; 
  paidAmount?: number;
  orderId: string;
  isProcessing: boolean;
  discount?: { amount: number, type: 'percent' | 'amount', value: number } | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onPrint,
  totalAmount: originalTotal,
  paidAmount = 0,
  orderId,
  isProcessing,
  discount
}) => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const { can, settings, guardSensitive } = useSettingsContext();
  const { orders, splitOrder, tables } = useData();
  const { showToast } = useToast();
  
  const [method, setMethod] = useState<'Cash' | 'Card' | 'Transfer'>('Cash');
  const [view, setView] = useState<'payment' | 'discount' | 'split' | 'split-target'>('payment');
  
  // Discount State
  const [discountValue, setDiscountValue] = useState<string>(discount?.value?.toString() || '');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>(discount?.type || 'percent');
  const [appliedDiscount, setAppliedDiscount] = useState<{ amount: number, type: 'percent' | 'amount', value: number } | null>(discount || null);

  // Split State
  const [splitSelection, setSplitSelection] = useState<Record<string, number>>({});
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState(false);

  // Calculate final totals
  const discountAmt = appliedDiscount?.amount || 0;
  const finalTotal = Math.max(0, originalTotal - discountAmt);
  const remainingTotal = Math.max(0, finalTotal - paidAmount);

  // Derived order for split - FIXED: Use string comparison for safety
  const currentOrder = useMemo(() => orders.find(o => String(o.id) === String(orderId)), [orders, orderId]);
  
  const splitItemsList = useMemo(() => {
    if (!currentOrder || !currentOrder.items) return [];
    return currentOrder.items;
  }, [currentOrder]);

  const totalItemCount = useMemo(() => {
    return splitItemsList.reduce((acc, item) => acc + (item.quantity || 0), 0);
  }, [splitItemsList]);

  const splitPreviewTotal = useMemo(() => {
    let total = 0;
    splitItemsList.forEach(item => {
      const qty = splitSelection[item.id] || 0;
      if (qty > 0) {
        total += (item.price || 0) * qty;
      }
    });
    return total;
  }, [splitItemsList, splitSelection]);

  // Available empty tables for split target
  const availableTables = useMemo(() => {
    return tables.filter(t => t.id !== currentOrder?.table_id && t.status === 'Available' && t.id !== 'Takeaway');
  }, [tables, currentOrder]);

  useEffect(() => {
    if (discount) {
      setAppliedDiscount(discount);
      setDiscountType(discount.type);
      setDiscountValue(discount.value.toString());
    }
  }, [discount]);

  // Bank Config for QR
  const bankConfig = useMemo(() => {
    const saved = localStorage.getItem('bank_config');
    return saved ? JSON.parse(saved) : null;
  }, []);

  const qrUrl = useMemo(() => {
    if (!bankConfig || method !== 'Transfer') return '';
    const { bankId, accountNo, accountName, template } = bankConfig;
    
    // Default pay full remainder
    const amountToPay = remainingTotal;
    if (amountToPay <= 0) return '';

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template || 'compact2'}.png?amount=${amountToPay}&addInfo=${encodeURIComponent(orderId)}&accountName=${encodeURIComponent(accountName)}`;
  }, [bankConfig, method, remainingTotal, orderId]);

  // --- SHORTCUT LOGIC ---
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => onClose();
    window.addEventListener('pos:shortcut:closeModal', handleClose);
    return () => window.removeEventListener('pos:shortcut:closeModal', handleClose);
  }, [isOpen, onClose]);

  const alertError = (reason?: string) => {
    if (reason === 'SETTING_DISABLED') alert(t('Giảm giá đang tắt trong Cài đặt.'));
    else if (reason === 'NOT_ALLOWED') alert(t('Không có quyền thực hiện giảm giá.'));
    else if (reason === 'PIN_INVALID') alert(t('Sai PIN.'));
  };

  const handleOpenDiscount = async () => {
    if (paidAmount > 0) {
      alert(t('Cannot apply discount to partially paid order'));
      return;
    }

    // RBAC: Guard Discount Application
    const result = await guardSensitive('discount_apply', () => {
        setView('discount');
    });

    if (!result.ok) {
        alertError(result.reason);
    }
  };

  const handleApplyDiscount = async () => {
    // Re-check permission to prevent bypass
    const result = await guardSensitive('discount_apply', () => {
        const val = parseFloat(discountValue);
        if (isNaN(val) || val < 0) {
          setAppliedDiscount(null);
          setView('payment');
          return;
        }

        if (discountType === 'percent') {
          if (settings.maxDiscountPercent > 0 && val > settings.maxDiscountPercent) {
            alert(`${t('Giới hạn giảm giá tối đa là')} ${settings.maxDiscountPercent}%`);
            return;
          }
          if (val > 100) {
            alert(t('Giảm giá không thể quá 100%'));
            return;
          }
          
          // Loss Prevention Warning
          if (settings.alertHighDiscount && settings.highDiscountThreshold > 0 && val >= settings.highDiscountThreshold) {
             showToast(`⚠️ Giảm giá cao: ${val}% (>= ${settings.highDiscountThreshold}%)`, 'warning');
             if (settings.soundEffect) playBeep('warning');
          }

          const amount = Math.round((originalTotal * val) / 100);
          setAppliedDiscount({ amount, type: 'percent', value: val });
        } else {
          if (val > originalTotal) {
            alert(t('Giảm giá không thể lớn hơn tổng tiền'));
            return;
          }
          setAppliedDiscount({ amount: val, type: 'amount', value: val });
        }
        setView('payment');
    });

    if (!result.ok) {
        alertError(result.reason);
    }
  };

  const handleOpenSplit = async () => {
    if (paidAmount > 0) {
        alert(t('Cannot split a partially paid order'));
        return;
    }

    // NEW CHECK: Prevent split if total item count is 1 or less
    if (totalItemCount <= 1) {
        alert(t('Cannot split order with single item'));
        return;
    }

    const result = await guardSensitive('bill_split', () => {
        setView('split');
        setSplitSelection({});
        setSplitSuccess(false);
    });

    if (!result.ok) {
        if (result.reason === 'SETTING_DISABLED') alert(t('Tính năng tách bill đang tắt.'));
        else alert(t('Không có quyền thực hiện tách bill.'));
    }
  };

  const handleUpdateSplitQty = (itemId: string, maxQty: number, delta: number) => {
    setSplitSelection(prev => {
      const curr = prev[itemId] || 0;
      const next = Math.max(0, Math.min(maxQty, curr + delta));
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleProceedToTarget = () => {
    const itemsToMove = Object.entries(splitSelection).map(([itemId, quantity]) => ({ itemId, quantity }));
    if (itemsToMove.length === 0) return;
    setView('split-target');
    console.log('[split_bill] select table -> next step');
  };

  const handleExecuteSplit = async (targetTableId: string) => {
    const itemsToMove = Object.entries(splitSelection).map(([itemId, quantity]) => ({ itemId, quantity }));
    if (itemsToMove.length === 0) return;

    setIsSplitting(true);
    console.log(`[split_bill] start execute: target=${targetTableId}, items=${itemsToMove.length}`);
    try {
        const newOrderId = await splitOrder(orderId, itemsToMove, targetTableId);
        if (newOrderId) {
            setSplitSuccess(true);
            setTimeout(() => {
                onClose(); // Close modal to refresh parent view
            }, 1500);
        }
        console.log(`[split_bill] success, new order: ${newOrderId}`);
    } catch (e: any) {
        console.error('[split_bill] error:', e);
        alert(t('Failed to split order: ') + e.message);
    } finally {
        setIsSplitting(false);
    }
  };

  const handleConfirmPayment = () => {
    // Force autoPrint setting usage, no separate checkbox UI
    onConfirm(method, settings.autoPrint, appliedDiscount || undefined, remainingTotal);
  };

  // --- NEW: Handle Manual Print with RBAC ---
  const handlePrintBill = async () => {
    // RBAC: 'reprint_receipt' key handles Staff PIN requirement logic automatically
    await guardSensitive('reprint_receipt', () => {
        onPrint();
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className={`bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col transition-all duration-300 
        h-[85vh] sm:h-auto sm:max-h-[90vh]
        ${method === 'Transfer' && (view === 'payment') ? 'sm:max-w-xl' : 'sm:max-w-md'}`}
        style={{ borderWidth: 'var(--pos-border-strong)' }}
      >
        
        {/* VIEW: DISCOUNT */}
        {view === 'discount' && (
          <>
            <div className="p-6 border-b border-border flex items-center gap-3">
              <button onClick={() => setView('payment')} className="p-1 hover:bg-border rounded-lg text-secondary">
                <ChevronLeft size={24} />
              </button>
              <h3 className="font-bold text-text-main text-xl">{t('Apply Discount')}</h3>
            </div>
            <div className="p-6 space-y-6">
               <div className="flex gap-2 p-1 bg-background border border-border rounded-xl">
                  <button 
                    onClick={() => setDiscountType('percent')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${discountType === 'percent' ? 'bg-primary text-background shadow' : 'text-secondary hover:text-text-main'}`}
                  >
                    % Percent
                  </button>
                  <button 
                    onClick={() => setDiscountType('amount')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${discountType === 'amount' ? 'bg-primary text-background shadow' : 'text-secondary hover:text-text-main'}`}
                  >
                    $ Amount
                  </button>
               </div>
               
               <div className="space-y-2">
                  <label className="text-xs font-bold text-secondary uppercase tracking-wider">
                    {discountType === 'percent' ? t('Discount Percentage') : t('Discount Amount')}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xl font-black text-text-main outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary font-bold">
                       {discountType === 'percent' ? '%' : 'VND'}
                    </div>
                  </div>
                  {discountType === 'percent' && settings.maxDiscountPercent > 0 && (
                    <p className="text-[10px] text-secondary font-bold">
                      {t('Max allowed:')} {settings.maxDiscountPercent}%
                    </p>
                  )}
               </div>

               <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex justify-between items-center">
                  <span className="text-sm font-bold text-secondary">{t('New Total:')}</span>
                  <span className="text-xl font-black text-primary">
                    {formatPrice(Math.max(0, originalTotal - (discountType === 'percent' 
                      ? (originalTotal * (parseFloat(discountValue)||0)) / 100 
                      : (parseFloat(discountValue)||0)
                    )))}
                  </span>
               </div>

               <button 
                 onClick={handleApplyDiscount}
                 className="w-full py-3 bg-primary text-background rounded-xl font-bold text-lg hover:bg-primary-hover shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
               >
                 <Check size={20} /> {t('Confirm Discount')}
               </button>
            </div>
          </>
        )}

        {/* VIEW: SPLIT ITEMS */}
        {view === 'split' && (
            <>
                <div className="p-6 border-b border-border flex items-center gap-3">
                    <button onClick={() => setView('payment')} className="p-1 hover:bg-border rounded-lg text-secondary">
                        <ChevronLeft size={24} />
                    </button>
                    <h3 className="font-bold text-text-main text-xl">{t('Split Bill Items')}</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar max-h-[50vh]">
                    <p className="text-xs text-secondary mb-4 px-2">{t('Select items to move to a new bill.')}</p>
                    <div className="space-y-2">
                        {splitItemsList.map(item => {
                            const selectedQty = splitSelection[item.id] || 0;
                            const maxQty = item.quantity;
                            return (
                                <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${selectedQty > 0 ? 'bg-primary/5 border-primary/30' : 'bg-background border-border'}`}>
                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className="font-bold text-sm truncate">{item._display_name || item.name}</p>
                                        <p className="text-xs text-secondary">{formatPrice(item.price)}</p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-surface rounded-lg border border-border p-1">
                                        <button 
                                            onClick={() => handleUpdateSplitQty(item.id, maxQty, -1)}
                                            className={`size-7 flex items-center justify-center rounded transition-colors ${selectedQty > 0 ? 'text-text-main hover:bg-border' : 'text-secondary opacity-50'}`}
                                            disabled={selectedQty === 0}
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className={`text-sm font-black w-6 text-center ${selectedQty > 0 ? 'text-primary' : 'text-secondary'}`}>
                                            {selectedQty} <span className="text-[10px] font-normal text-secondary">/ {maxQty}</span>
                                        </span>
                                        <button 
                                            onClick={() => handleUpdateSplitQty(item.id, maxQty, 1)}
                                            className={`size-7 flex items-center justify-center rounded transition-colors ${selectedQty < maxQty ? 'text-text-main hover:bg-border' : 'text-secondary opacity-50'}`}
                                            disabled={selectedQty >= maxQty}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="p-4 border-t border-border bg-background space-y-3">
                    <div className="flex justify-between items-center px-2">
                        <span className="text-xs font-bold text-secondary uppercase">{t('New Bill Subtotal')}</span>
                        <span className="text-xl font-black text-primary">{formatPrice(splitPreviewTotal)}</span>
                    </div>
                    <button 
                        onClick={handleProceedToTarget}
                        disabled={splitPreviewTotal === 0}
                        className="w-full py-3 bg-primary text-background font-bold rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('Next: Select Table')} <ArrowRight size={18} />
                    </button>
                </div>
            </>
        )}

        {/* VIEW: SPLIT TARGET TABLE SELECTION */}
        {view === 'split-target' && (
            <>
                <div className="p-6 border-b border-border flex items-center gap-3">
                    <button onClick={() => setView('split')} className="p-1 hover:bg-border rounded-lg text-secondary">
                        <ChevronLeft size={24} />
                    </button>
                    <h3 className="font-bold text-text-main text-xl">{t('Select New Table')}</h3>
                </div>

                {splitSuccess ? (
                    <div className="p-10 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in">
                        <div className="size-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                            <Check size={32} strokeWidth={3} />
                        </div>
                        <h3 className="text-lg font-bold text-text-main">{t('Bill Split Successful!')}</h3>
                        <p className="text-sm text-secondary">{t('Items moved to new order.')}</p>
                    </div>
                ) : (
                    <div className="p-5 flex-1 overflow-y-auto custom-scrollbar bg-surface/50">
                        <div className="text-center mb-4">
                            <p className="text-xs text-secondary">{t('Choose where to move the split items:')}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleExecuteSplit('Takeaway')}
                                className="col-span-2 p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center gap-2 hover:bg-primary/20 transition-all"
                            >
                                <ShoppingBag size={20} className="text-primary"/>
                                <span className="font-black text-primary uppercase">{t('Takeaway')}</span>
                            </button>

                            {availableTables.length === 0 ? (
                                <div className="col-span-2 py-8 text-center text-secondary text-sm border-2 border-dashed border-border rounded-xl">
                                    {t('No empty tables available')}
                                </div>
                            ) : (
                                availableTables.map(table => (
                                    <button
                                        key={table.id}
                                        onClick={() => handleExecuteSplit(table.id)}
                                        className="p-4 rounded-xl border bg-background border-border hover:border-primary/50 flex flex-col items-center gap-1 transition-all"
                                    >
                                        <span className="font-bold text-text-main">{table.label}</span>
                                        <span className="text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded">{t('Empty')}</span>
                                    </button>
                                ))
                            )}
                        </div>
                        
                        {isSplitting && (
                            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-sm">
                                <Loader2 className="animate-spin text-primary" size={48} />
                            </div>
                        )}
                    </div>
                )}
            </>
        )}

        {/* VIEW: PAYMENT MAIN */}
        {(view === 'payment') && (
          <>
            {/* Header */}
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h3 className="font-bold text-text-main text-xl">{t('Confirm Payment')}</h3>
              <button onClick={onClose} disabled={isProcessing}>
                <X size={20} className="text-secondary hover:text-text-main"/>
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
              
              {/* Amounts Display */}
              <div className="text-center relative space-y-1">
                {paidAmount > 0 && (
                    <div className="mb-2 p-2 bg-emerald-500/10 rounded-lg inline-block border border-emerald-500/20">
                        <p className="text-xs font-bold text-emerald-600">{t('Paid:')} {formatPrice(paidAmount)}</p>
                    </div>
                )}

                {appliedDiscount ? (
                  <div className="space-y-1 animate-in fade-in zoom-in duration-200">
                    <p className="text-secondary text-xs line-through">{formatPrice(originalTotal)}</p>
                    <p className="text-4xl font-bold text-text-main">{formatPrice(remainingTotal)}</p>
                    <div className="inline-flex items-center gap-2 px-2 py-1 bg-red-500/10 rounded-lg">
                      <span className="text-xs font-bold text-red-500">
                        -{formatPrice(appliedDiscount.amount)} ({appliedDiscount.type === 'percent' ? `${appliedDiscount.value}%` : 'Direct'})
                      </span>
                      {paidAmount === 0 && (
                          <button onClick={() => setAppliedDiscount(null)} className="p-0.5 bg-red-500 rounded-full text-white"><X size={10}/></button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-secondary text-sm mb-1">{paidAmount > 0 ? t('Remaining to Pay') : t('Total to Pay')}</p>
                    <p className="text-4xl font-bold text-text-main">{formatPrice(remainingTotal)}</p>
                  </>
                )}
                <p className="text-sm text-secondary mt-2">{t('Order #')}{orderId}</p>
              </div>

              {/* Feature Actions (Gated) */}
              {(can('discount.apply') || can('bill.split')) && (
                <div className="flex gap-2 justify-center">
                    {/* Discount Button: Show if setting enabled */}
                    {can('discount.apply') && paidAmount === 0 && (
                        <button onClick={handleOpenDiscount} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-bold text-secondary hover:text-primary hover:border-primary transition-all">
                            <Percent size={14} /> {appliedDiscount ? t('Edit Discount') : t('Discount')}
                        </button>
                    )}
                    {/* Updated Split Bill Logic: Show if enabled in settings AND there is more than 1 item quantity */}
                    {can('bill.split') && remainingTotal > 0 && totalItemCount > 1 && (
                        <button onClick={handleOpenSplit} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-bold text-secondary hover:text-primary hover:border-primary transition-all">
                            <Divide size={14} /> {t('Split Bill')}
                        </button>
                    )}
                </div>
              )}

              {/* Payment Methods */}
              <div 
                className="grid grid-cols-3"
                style={{ gap: 'var(--pos-gap)' }}
              >
                {[
                    { key: 'Cash', icon: DollarSign },
                    { key: 'Card', icon: CreditCard },
                    { key: 'Transfer', icon: QrCode }
                ].map((m) => (
                  <button 
                    key={m.key} 
                    onClick={() => setMethod(m.key as any)} 
                    disabled={isProcessing}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${method === m.key ? 'bg-primary text-background border-primary shadow-lg shadow-primary/20' : 'bg-background border-border text-secondary hover:border-primary/50'}`}
                  >
                    <m.icon size={24}/>
                    <span className="text-xs font-bold mt-2">{t(m.key)}</span>
                  </button>
                ))}
              </div>

              {/* QR Content for Transfer */}
              {method === 'Transfer' && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  {bankConfig ? (
                      <div className="bg-background border border-border rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8 shadow-inner">
                          <div className="w-full md:w-1/2 flex flex-col items-center">
                            <div className="bg-white p-4 rounded-2xl shadow-xl mb-3">
                              <img src={qrUrl} alt="VietQR" className="w-full aspect-square object-contain" />
                            </div>
                            <div className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                                <QrCode size={16} />
                                <span className="text-xs font-black uppercase tracking-widest">{t('Scan to pay')}</span>
                            </div>
                          </div>
                          
                          <div className="w-full md:w-1/2 space-y-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">{t('Bank')}</span>
                                {/* Use bankName (ShortName) for display */}
                                <span className="text-sm font-black text-text-main">{bankConfig.bankName || bankConfig.bankId}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">{t('Account Number')}</span>
                                <span className="text-lg font-black text-primary tracking-tight">{bankConfig.accountNo}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">{t('Account Owner')}</span>
                                <span className="text-sm font-black text-text-main uppercase">{bankConfig.accountName}</span>
                            </div>
                            <div className="flex flex-col p-3 bg-surface border border-border rounded-xl">
                                <span className="text-[10px] text-secondary uppercase font-bold tracking-wider mb-1">{t('Memo')}</span>
                                <span className="text-xs font-black text-primary bg-primary/5 p-2 rounded border border-primary/10 select-all cursor-copy" title="Click to copy">{orderId}</span>
                            </div>
                          </div>
                      </div>
                  ) : (
                      <div className="p-8 bg-red-500/5 border-2 border-dashed border-red-500/20 rounded-2xl text-center flex flex-col items-center gap-4">
                        <AlertCircle size={48} className="text-red-500/50" />
                        <div className="space-y-1">
                            <p className="font-bold text-red-500">{t('Bank settings required')}</p>
                            <p className="text-xs text-secondary leading-relaxed">{t('Bank settings required')}</p>
                        </div>
                      </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="p-6 border-t border-border bg-background flex gap-3">
              <button 
                onClick={handlePrintBill}
                disabled={isProcessing}
                className="h-[var(--pos-btn-h)] px-4 bg-surface border border-border rounded-xl font-bold text-text-main hover:bg-border flex items-center justify-center gap-2 transition-all disabled:opacity-70 flex-1 sm:flex-none"
              >
                <Printer size={20} />
                <span className="hidden sm:inline">{t('Print')}</span>
                <span className="sm:hidden">{t('Print')}</span>
              </button>
              <button 
                onClick={handleConfirmPayment} 
                disabled={isProcessing}
                className="flex-1 h-[var(--pos-btn-h)] bg-primary text-background font-bold rounded-xl text-lg hover:bg-primary-hover shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Check size={20} />}
                <span className="hidden sm:inline">{t('Complete Order')}</span>
                <span className="sm:hidden">{t('Confirm')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
