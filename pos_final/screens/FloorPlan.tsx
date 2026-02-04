
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Loader2, Ban, Save, Layout, Type, Trash2, Square, Circle, RectangleHorizontal, 
  Users, Minus, Plus, Maximize2, Armchair, X, ArrowRight, ArrowRightLeft, Search, 
  Utensils, ShoppingBag, StickyNote, ChevronRight, Check, RefreshCw, CreditCard, ArrowLeft 
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTheme } from '../ThemeContext';
import { useSettingsContext } from '../context/SettingsContext';
import { TableData, MenuItem, OrderItem } from '../types';
import { useOrderOperations } from '../hooks/useOrderOperations';
import { TransferModal } from '../components/TransferModal';
import { PaymentModal } from '../components/PaymentModal';
import { enrichOrderDetails, getPaidAmount } from '../utils/orderHelpers';
import { printOrderReceipt } from '../services/printService';
import { useCurrency } from '../CurrencyContext';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext'; // Import Toast

export const FloorPlan: React.FC = () => {
  const { tables, orders, menuItems, refreshData, addLocalOrder, addItemToSession, checkoutSession, updateLocalOrder, cancelOrder, loading, moveTable, mergeOrders } = useData();
  const { performCancelOrder } = useOrderOperations();
  const { t } = useTheme();
  const { settings, can } = useSettingsContext();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [addItemsSearch, setAddItemsSearch] = useState('');
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteItem, setEditingNoteItem] = useState<{idx: number, currentNote: string, source: 'cart' | 'active' | 'add_items'} | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [modifiedItems, setModifiedItems] = useState<OrderItem[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [localTables, setLocalTables] = useState<TableData[]>([]);
  
  const startInteractionSelectedRef = useRef<boolean>(false);

  useEffect(() => { if (!isEditMode && tables) setLocalTables(tables as TableData[]); }, [tables, isEditMode]);

  // --- CRUD Functions for Local Layout Editing ---
  const updateTable = (id: string, updates: Partial<TableData>) => {
    setLocalTables(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setHasUnsavedChanges(true);
  };

  const deleteTable = (id: string) => {
    if (confirm(t('Are you sure you want to delete this table?'))) {
      setLocalTables(prev => prev.filter(t => t.id !== id));
      setHasUnsavedChanges(true);
      setEditingTableId(null);
    }
  };

  const handleSaveLayout = async () => {
    setIsSaving(true);
    setTimeout(() => {
        setIsSaving(false);
        setIsEditMode(false);
        setHasUnsavedChanges(false);
    }, 500);
  };

  // --- Handlers for Dragging (Simplified for example) ---
  const handleMouseDownDrag = (e: React.MouseEvent, table: TableData) => {
    if (!isEditMode) {
        if (selectedTableId !== table.id) setSelectedTableId(table.id);
        return;
    }
    setEditingTableId(table.id);
  };

  const handleResizeStart = (e: React.MouseEvent, table: TableData) => {
      e.stopPropagation();
  };

  const handleTableClick = (e: React.MouseEvent, table: TableData) => {
      e.stopPropagation();
      if (!isEditMode) {
          setSelectedTableId(table.id);
      }
  };

  // --- Item Management Handlers ---
  const filteredItemsForAdd = useMemo(() => {
      return menuItems.filter(i => i.name.toLowerCase().includes(addItemsSearch.toLowerCase()));
  }, [menuItems, addItemsSearch]);

  const handleSelectItemToAdd = (item: MenuItem) => {
      const existingIdx = currentOrderItems.findIndex(i => String(i.menu_item_id) === String(item.id) && (i as any).isNew);
      if (existingIdx > -1) {
          const next = [...currentOrderItems];
          next[existingIdx].quantity += 1;
          setCurrentOrderItems(next);
      } else {
          setCurrentOrderItems([...currentOrderItems, {
              id: crypto.randomUUID(), // Temp ID
              order_id: '', // Temp
              menu_item_id: item.id,
              quantity: 1,
              price: item.price,
              snapshot_name: item.name,
              note: '',
              _display_name: item.name,
              _display_price: item.price,
              ...({ isNew: true } as any)
          }]);
      }
  };

  const handleConfirmAddItems = async () => {
      console.log(`[CONFIRM_FLOW] start tableId=${selectedTableId}`);
      
      const newItemsPayload = currentOrderItems.filter((i: any) => i.isNew).map(i => ({
          menu_item_id: i.menu_item_id,
          quantity: i.quantity,
          price: i.price,
          _snapshot_name: i.snapshot_name,
          note: (i.note || '').trim()
      }));

      if (newItemsPayload.length === 0) {
          console.warn(`[CONFIRM_FLOW] No new items to add. Closing.`);
          setIsAddItemsModalOpen(false);
          return;
      }

      // Check if there is an active order for this table
      const activeOrder = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));

      try {
          if (activeOrder) {
              console.log(`[CONFIRM_FLOW] Adding items to Existing Order ${activeOrder.id}`);
              await addItemToSession(String(activeOrder.id), newItemsPayload);
              showToast(t('Đã thêm món vào đơn'), 'success');
          } else {
              // Create NEW ORDER
              console.log(`[CONFIRM_FLOW] Creating NEW Order for Table ${selectedTableId}`);
              if (!selectedTableId) {
                  console.error(`[CONFIRM_FLOW] Error: No table selected`);
                  return;
              }

              const fullOrderData = {
                  table_id: selectedTableId,
                  guests: 1, // Default
                  order_items: newItemsPayload
              };
              
              const newId = await addLocalOrder(fullOrderData);
              console.log(`[CONFIRM_FLOW] New Order Created: ${newId}`);
              showToast(t('Đã mở bàn mới thành công'), 'success');
          }
          
          setIsAddItemsModalOpen(false);
          setCurrentOrderItems([]); // Reset local state
      } catch (e: any) {
          console.error(`[CONFIRM_FLOW] Error:`, e);
          showToast(t('Lỗi khi lưu đơn hàng'), 'error');
      }
  };

  const handleUpdateItemQty = (idx: number, delta: number, currentList: OrderItem[]) => {
      const next = [...currentList];
      const newQty = (next[idx].quantity || 0) + delta;
      if (newQty <= 0) {
          next.splice(idx, 1);
      } else {
          next[idx] = { ...next[idx], quantity: newQty };
      }
      setModifiedItems(next);
  };

  const openNoteModal = (idx: number, source: 'active' | 'add_items') => {
      let note = "";
      if (source === 'active') {
          const activeOrder = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
          const list = modifiedItems || (activeOrder ? enrichOrderDetails(activeOrder, menuItems).items : []);
          note = list[idx]?.note || "";
      } else {
          note = currentOrderItems[idx]?.note || "";
      }
      setEditingNoteItem({ idx, currentNote: note, source });
      setNoteInput(note);
      setIsNoteModalOpen(true);
  };

  const saveNote = () => {
      if (editingNoteItem) {
          if (editingNoteItem.source === 'active') {
             const activeOrder = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
             const list = modifiedItems || (activeOrder ? enrichOrderDetails(activeOrder, menuItems).items : []);
             const next = [...list];
             if (next[editingNoteItem.idx]) {
                 next[editingNoteItem.idx] = { ...next[editingNoteItem.idx], note: noteInput };
                 setModifiedItems(next);
             }
          } else {
             const next = [...currentOrderItems];
             if (next[editingNoteItem.idx]) {
                 next[editingNoteItem.idx] = { ...next[editingNoteItem.idx], note: noteInput };
                 setCurrentOrderItems(next);
             }
          }
      }
      setIsNoteModalOpen(false);
  };

  const handleUpdateOrder = async (order: any) => {
      if (!modifiedItems) return;
      const payload = modifiedItems.map(it => ({
          menu_item_id: it.menu_item_id,
          quantity: Number(it.quantity || 1),
          price: Number(it.price || 0),
          _snapshot_name: it.snapshot_name,
          note: (it.note || '').trim()
      }));
      await updateLocalOrder(String(order.id), { order_items: payload });
      setModifiedItems(null);
  };

  const handleTransferConfirm = async (targetId: string, mode: 'move' | 'merge') => {
      setIsSubmitting(true);
      try {
          if (mode === 'move') {
              await moveTable(selectedTableId!, targetId);
          } else {
              await mergeOrders(selectedTableId!, targetId);
          }
          setShowTransferModal(false);
          setSelectedTableId(null);
      } catch (e) {
          console.error(e);
          alert('Failed to transfer table');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDeleteClick = (order: any) => {
      performCancelOrder(order, () => {
          setSelectedTableId(null);
          setModifiedItems(null);
      });
  };

  if (loading) return <div className="flex-1 flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" size={48} /></div>;

  if (!settings.enableTableMap) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-background p-8 text-center animate-in fade-in">
        <div className="p-6 bg-surface border border-border rounded-3xl shadow-sm max-w-md">
          <Ban size={48} className="text-secondary mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-text-main mb-2">{t('Table Management Disabled')}</h2>
          <p className="text-secondary text-sm mb-6">
            Chế độ quản lý bàn đang tắt trong Cài đặt. Vui lòng chuyển sang tab Menu hoặc Dashboard để bán hàng.
          </p>
          {settings.quickOrder && (
             <div className="p-3 bg-primary/10 rounded-xl text-primary text-xs font-bold uppercase tracking-wider">
               Quick Order Mode is Active
             </div>
          )}
        </div>
      </div>
    );
  }

  const activeTable = (tables || []).find(t => t.id === selectedTableId) as TableData | undefined;
  const canEditLayout = can('table.edit_layout');

  return (
    <div className="flex-1 flex flex-col h-full bg-background transition-colors overflow-hidden">
      <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background shrink-0 z-40">
        <div className="flex items-center gap-4"><h2 className="text-text-main text-xl font-bold">{t('Main Hall')}</h2>{isEditMode ? (<div className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20"><span className="text-xs font-bold uppercase">{t('Editor Mode')}</span></div>) : (<div className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20"><span className="size-2 rounded-full bg-primary animate-pulse"></span><span className="text-xs font-bold uppercase">{t('Live')}</span></div>)}</div>
        {canEditLayout && (
          <button onClick={isEditMode ? handleSaveLayout : () => setIsEditMode(true)} disabled={isSaving} className={`h-10 px-4 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isEditMode ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'bg-surface border border-border text-text-main hover:border-primary'}`}>{isEditMode ? (isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>) : <Layout size={16}/>}{isEditMode ? (hasUnsavedChanges ? t('Save Changes') : t('Done')) : t('Edit Layout')}</button>
        )}
      </header>
      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={containerRef} 
          onClick={() => { 
            setEditingTableId(null); 
            setSelectedTableId(null); 
          }} 
          className="absolute inset-0 overflow-auto select-none" 
          style={{ 
            backgroundImage: 'linear-gradient(var(--color-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-grid) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            backgroundColor: 'var(--color-floor-bg)',
            minHeight: '1000px',
            minWidth: '1000px'
          }}
        >
          {(localTables || []).map(table => {
            const activeOrder = (orders || []).find(o => String(o.table_id) === String(table.id) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
            const isOccupied = !!activeOrder; 
            const isSelected = selectedTableId === table.id && !isEditMode; 
            const isEditing = isEditMode && editingTableId === table.id;
            let isOverTime = false;
            if (isOccupied && settings.tableTimeAlert && activeOrder.created_at) {
                const duration = (Date.now() - new Date(activeOrder.created_at).getTime()) / 60000;
                if (duration > settings.tableTimeLimit) isOverTime = true;
            }
            let tableClasses = `absolute flex flex-col items-center justify-center transition-all duration-300 select-none border-2 rounded-2xl `;
            if (!isOccupied) {
              tableClasses += "bg-[#f8fafc] border-3 border-dashed border-[#cbd5e1] text-[#64748b] shadow-sm hover:border-[#10B981] hover:shadow-md hover:bg-white ";
              tableClasses += "dark:bg-[#1a2c26]/40 dark:border-[#19e6a2]/30 dark:text-[#93c8b6] dark:shadow-sm dark:hover:border-[#19e6a2] dark:hover:bg-[#19e6a2]/2 dark:hover:text-white dark:hover:bg-surface dark:hover:shadow-[0_0_15px_rgba(25,230,162,0.4)] ";
            } else {
              if (isOverTime) {
                 tableClasses += "bg-red-500/10 border-red-500 text-red-500 animate-pulse shadow-lg shadow-red-500/20 ";
              } else {
                 tableClasses += "bg-gray-100 border-2 border-primary border-gray-350 text-gray-800 shadow-sm hover:border-[#10B981] hover:shadow-md hover:bg-gray-100 ";
                 tableClasses += "dark:bg-[#052e16] dark:border-[#19e6a2] dark:text-white dark:shadow-[0_0_20px_rgba(25,230,162,0.25)] "; 
              }
              if (!isEditMode) tableClasses += "hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(25,230,162,0.4)] ";
            }
            if (isEditMode) {
                tableClasses += "cursor-move border-dashed ";
                if (isEditing) {
                    tableClasses = `absolute flex flex-col items-center justify-center rounded-2xl bg-surface border-2 border-primary shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.3)] z-[100] cursor-move text-primary select-none`;
                }
            } else {
                tableClasses += "cursor-pointer active:scale-95 ";
                if (isSelected) {
                    tableClasses += "ring-2 ring-offset-2 ring-emerald-400 dark:ring-emerald-500 ring-offset-background z-30 scale-105 ";
                } else {
                    tableClasses += "z-10 ";
                }
            }
            return (
              <div 
                key={table.id}
                id={`table-node-${table.id}`}
                onMouseDown={(e) => {
                  startInteractionSelectedRef.current = (selectedTableId === table.id);
                  handleMouseDownDrag(e, table);
                }} 
                onClick={(e) => handleTableClick(e, table)} 
                onDoubleClick={(e) => { 
                  e.stopPropagation(); 
                  if (table && startInteractionSelectedRef.current) { 
                    if (canEditLayout) {
                        setIsEditMode(true); 
                        setEditingTableId(table.id); 
                    }
                  }
                }} 
                style={{ 
                  left: `${table.x}%`, 
                  top: `${table.y}%`, 
                  width: `${table.width}px`, 
                  height: `${table.height}px`, 
                  borderRadius: table.shape === 'round' ? '9999px' : '16px' 
                }} 
                className={tableClasses}
              >
                <span className="text-lg font-black tracking-tight">{table.label}</span>
                {isEditing && (
                  <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="absolute z-[110] top-full mt-2 left-1/2 -translate-x-1/2 w-[220px] bg-surface border border-border rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 mb-3"><div className="relative flex-1 group"><Type size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary" /><input type="text" value={table.label} onChange={(e) => updateTable(table.id, { label: e.target.value })} className="w-full bg-background border border-border rounded-lg py-1.5 pl-7 pr-2 text-text-main text-xs font-bold outline-none" placeholder="Label" /></div><button onClick={() => deleteTable(table.id)} className="p-1.5 text-secondary hover:text-red-500 rounded-lg transition-colors"><Trash2 size={16} /></button></div>
                    <div className="mb-3"><span className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1 block">SHAPE</span><div className="grid grid-cols-3 gap-1 bg-background p-1 rounded-lg border border-border"><button onClick={() => updateTable(table.id, { shape: 'square' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'square' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><Square size={14} /></button><button onClick={() => updateTable(table.id, { shape: 'round' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'round' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><Circle size={14} /></button><button onClick={() => updateTable(table.id, { shape: 'rect' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'rect' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><RectangleHorizontal size={14} /></button></div></div>
                    <div><span className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1 block">SEATS</span><div className="flex items-center justify-between bg-background p-1.5 rounded-lg border border-border"><Users size={14} className="text-secondary ml-1" /><div className="flex items-center gap-3"><button onClick={() => updateTable(table.id, { seats: Math.max(1, (table.seats || 2) - 1) })} className="w-6 h-6 flex items-center justify-center bg-surface border border-border rounded hover:bg-border text-text-main"><Minus size={12} /></button><span className="text-xs font-bold text-text-main min-w-[12px] text-center">{table.seats || 2}</span><button onClick={() => updateTable(table.id, { seats: (table.seats || 2) + 1 })} className="w-6 h-6 flex items-center justify-center bg-surface border border-border rounded hover:bg-border text-text-main"><Plus size={12} /></button></div></div></div>
                  </div>
                )}
                {isOccupied && !isEditMode && (<div className="mt-1 text-[9px] font-bold bg-white/25 text-primary dark:text-white px-2 py-0.5 rounded-full uppercase tracking-wider">{t('Occupied')}</div>)}
                {isEditMode && editingTableId === table.id && (<div onMouseDown={(e) => handleResizeStart(e, table)} className="absolute bottom-1 right-1 cursor-nwse-resize p-1 text-primary"><Maximize2 size={16} /></div>)}
              </div>
            );
          })}
        </div>
        {!isEditMode && selectedTableId && activeTable && (
          <div onClick={(e) => e.stopPropagation()} className="fixed lg:absolute bottom-0 lg:bottom-auto left-0 lg:left-auto w-full lg:w-[320px] z-50 animate-in slide-in-from-bottom duration-300" style={window.innerWidth >= 1024 ? { top: `${activeTable.y}%`, left: (activeTable.x || 0) < 50 ? `calc(${activeTable.x}% + ${activeTable.width}px + 12px)` : `calc(${activeTable.x}% - 332px)` } : {}}>
            {(() => {
                const active = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
                if (!active) return (
                  <div 
                    className="bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden p-4 transition-all duration-300"
                    style={{ borderWidth: 'var(--pos-border-strong)' }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="size-10 shrink-0 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                          <Armchair size={20} />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="text-base font-black text-text-main truncate leading-none mb-1.5">{activeTable.label}</h3>
                          <div className="flex items-center gap-1.5">
                             <div className="size-1.5 rounded-full bg-green-500"></div>
                             <p className="text-[10px] text-secondary font-bold uppercase tracking-wider">{t('Available')}</p>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setSelectedTableId(null)} className="p-2 hover:bg-border/50 rounded-lg text-secondary transition-all">
                        <X size={20}/>
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setCurrentOrderItems([]); 
                        setIsAddItemsModalOpen(true);   
                      }} 
                      className="w-full h-12 bg-primary text-background rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm"
                      style={{ minHeight: 'var(--pos-btn-h)' }}
                    >
                      <Plus size={18} /> {t('Mở bàn mới')}
                    </button>
                  </div>
                );
                // ... (Existing Active Table Render Logic) ...
                const { items: enriched } = enrichOrderDetails(active, menuItems); 
                const itemsToDisplay = modifiedItems || enriched; 
                const currentTotal = itemsToDisplay.reduce((acc: number, it: OrderItem) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0); 
                const hasChanges = modifiedItems !== null && JSON.stringify(modifiedItems) !== JSON.stringify(enriched);
                const discountAmount = active.discount_amount || 0;
                const finalDisplayTotal = Math.max(0, currentTotal - discountAmount);
                return (
                  <div 
                    className="bg-surface/90 dark:bg-surface/80 dark:bg-[#1a2c26]/95 backdrop-blur-md border border-border shadow-2xl rounded-[20px] overflow-hidden p-5 transition-all duration-300 w-full"
                    style={{ borderWidth: 'var(--pos-border-strong)' }}
                  >
                    <div className="flex justify-between items-start pb-4 border-b border-border/50 mb-4">
                      <div className="flex items-center gap-3">
                          <div className="size-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shadow-sm"><Armchair size={20} /></div>
                          <div>
                              <div className="flex items-center gap-2">
                                {active.table_id === 'Takeaway' ? (
                                    <span className="px-2 py-0.5 rounded-lg text-sm font-black bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-tighter">
                                        {activeTable?.label || 'Takeaway'}
                                    </span>
                                ) : (
                                    <h3 className="text-lg font-black leading-tight text-text-main">
                                        {activeTable?.label}
                                    </h3>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                 <div className="size-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                 <p className="text-[9px] text-secondary uppercase font-bold tracking-[0.1em]">{t('In Use')}</p>
                              </div>
                          </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setShowTransferModal(true)} className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all" title={t('Split / Merge Table')}><ArrowRightLeft size={18}/></button>
                        
                        <button 
                            onClick={() => handleDeleteClick(active)} 
                            className="p-2 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                            <Trash2 size={18}/>
                        </button>

                        <button onClick={() => setSelectedTableId(null)} className="p-2 hover:bg-border/50 rounded-xl text-secondary transition-all"><X size={18}/></button>
                      </div>
                    </div>
                    {/* ... (Existing Items List & Footer Logic) ... */}
                    <div 
                        className="max-h-[220px] overflow-y-auto space-y-2.5 mb-5 custom-scrollbar pr-1.5 -mx-1 px-1"
                        style={{ gap: 'var(--pos-gap)' }}
                    >
                      {/* ... (Existing List Logic) ... */}
                      {itemsToDisplay.length === 0 ? (
                        <div className="text-center py-4 text-secondary text-xs opacity-50 font-bold uppercase">{t('Cart is empty')}</div>
                      ) : (
                        itemsToDisplay.map((it: any, idx: number) => (
                          <div key={idx} className="flex flex-col p-3 bg-background/40 hover:bg-background/80 border border-border/40 rounded-xl group transition-all duration-200 relative">
                            {/* ... (Existing Item Row Logic) ... */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                  <div className="flex items-center gap-1.5 bg-surface border border-border p-0.5 rounded-lg">
                                    <button 
                                      onClick={() => handleUpdateItemQty(idx, -1, itemsToDisplay)}
                                      className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-red-500"
                                    >
                                      <Minus size={10}/>
                                    </button>
                                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-[11px] min-w-[14px] text-center">{it.quantity}</span>
                                    <button 
                                      onClick={() => handleUpdateItemQty(idx, 1, itemsToDisplay)}
                                      className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-primary"
                                    >
                                      <Plus size={10}/>
                                    </button>
                                  </div>
                                <p className="min-w-0 text-[13px] font-bold text-text-main truncate leading-tight tracking-tight">
                                  {it._display_name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="shrink-0 text-xs font-black text-text-main">
                                      {formatPrice(it._display_price * it.quantity)}
                                  </span>
                                  <button
                                      onClick={(e) => { e.stopPropagation(); openNoteModal(idx, 'active'); }}
                                      className={`shrink-0 p-1.5 rounded-lg border transition-all
                                          ${it.note
                                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/15'
                                          : 'bg-background/50 border-border text-secondary hover:text-primary hover:bg-background/70'
                                          }`}
                                      title={it.note ? t('Sửa ghi chú') : t('Thêm ghi chú')}
                                  >
                                      <StickyNote size={11} />
                                  </button>
                              </div>
                            </div>
                            {it.note && (
                              <div className="flex items-start gap-1.5 mt-2 ml-10 p-1.5 bg-amber-500/5 rounded-lg border border-amber-500/10">
                                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 italic leading-snug line-clamp-2">{it.note}</p>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    {/* ... (Existing Footer Logic) ... */}
                    <div className="flex justify-between items-end border-t border-border/60 pt-4 mb-4">
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black text-secondary uppercase tracking-widest">{t('Total Balance')}</span>
                           <div className="flex items-center gap-1.5 text-secondary mt-1">
                              <span className="text-[10px] font-bold">{new Date(active.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                           </div>
                        </div>
                        <div className="text-right">
                           {discountAmount > 0 && <span className="block text-xs font-bold text-red-500 mb-1">-{formatPrice(discountAmount)}</span>}
                           <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm">{formatPrice(finalDisplayTotal)}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {hasChanges ? (
                          <button 
                              onClick={() => handleUpdateOrder(active)} 
                              className="w-full h-11 bg-emerald-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:brightness-105 transition-all animate-in zoom-in-95 duration-200 uppercase tracking-wider"
                              style={{ minHeight: 'var(--pos-btn-h)' }}
                          >
                              <RefreshCw size={16} /> {t('Update Order')}
                          </button>
                      ) : (
                          <div className="flex gap-2.5">
                              <button 
                                  onClick={() => { 
                                      setCurrentOrderItems(enriched.map((x: any) => ({ ...x, isNew: false })));
                                      setIsAddItemsModalOpen(true); 
                                  }} 
                                  className="flex-1 h-11 bg-surface border border-border rounded-xl font-black text-xs flex items-center justify-center gap-2 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-text-main shadow-sm"
                                  style={{ minHeight: 'var(--pos-btn-h)' }}
                              >
                                  <Plus size={16} className="text-emerald-500" /> {t('Add Items')}
                              </button>
                              <button 
                                  onClick={() => setShowPaymentModal(true)} 
                                  className="flex-1 h-11 bg-primary text-background rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:brightness-105 transition-all"
                                  style={{ minHeight: 'var(--pos-btn-h)' }}
                              >
                                  <CreditCard size={16} /> {t('Pay')}
                              </button>
                          </div>
                      )}
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>
      
      {/* ... (Existing Modals) ... */}
      
      {/* ... Add Items Modal ... */}
      {isAddItemsModalOpen && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in slide-in-from-bottom duration-300">
           <div className="h-16 flex items-center justify-between px-6 border-b border-border bg-surface shrink-0 shadow-sm">
             <div className="flex items-center gap-4">
                <button onClick={() => setIsAddItemsModalOpen(false)} className="p-2 hover:bg-border rounded-xl transition-all">
                  <ArrowLeft size={24} />
                </button>
                <div>
                   <h2 className="text-xl font-black flex items-center gap-2">
                     <Plus className="text-primary" /> {t('Add to Order')}
                   </h2>
                   <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{activeTable?.label}</p>
                </div>
             </div>
             <button onClick={() => setIsAddItemsModalOpen(false)} className="p-2 rounded-xl bg-border/20 flex items-center justify-center"><X size={24}/></button>
           </div>
           
           <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 bg-surface/30 custom-scrollbar">
                <div className="relative mb-6 max-w-md">
                   <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                   <input 
                      type="text" 
                      placeholder={t('Search Menu...')} 
                      value={addItemsSearch} 
                      onChange={e => setAddItemsSearch(e.target.value)} 
                      className="w-full bg-surface border border-border rounded-xl px-10 py-3 outline-none focus:ring-1 focus:ring-primary shadow-sm" 
                   />
                </div>
                <div 
                    className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4"
                    style={{ gap: 'var(--pos-gap)' }}
                >
                  {filteredItemsForAdd.map((item: MenuItem) => (
                    <button 
                      key={item.id} 
                      onClick={() => handleSelectItemToAdd(item)} 
                      className="bg-surface border border-border rounded-2xl p-3 text-left hover:border-primary transition-all group flex flex-col h-full shadow-sm relative active:scale-95"
                      style={{ borderWidth: 'var(--pos-border-strong)' }}
                    >
                      <div className="aspect-video bg-background rounded-lg mb-2 overflow-hidden shrink-0">
                         {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-secondary/30"><Utensils size={24}/></div>}
                      </div>
                      <h4 className="font-bold text-xs line-clamp-2 flex-1 mb-2 tracking-tight group-hover:text-primary transition-colors">{item.name}</h4>
                      <p className="text-primary font-bold text-sm">{formatPrice(item.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-[380px] border-l border-border bg-surface flex flex-col shadow-2xl shrink-0" style={{ borderWidth: 'var(--pos-border-strong)' }}>
                <div className="p-5 border-b border-border bg-background/50 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-widest text-primary">{t('Items to Add')}</span>
                  <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">{currentOrderItems.filter((i: any) => i.isNew).length} Món</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {currentOrderItems.filter((i: any) => i.isNew).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-secondary opacity-30 gap-3">
                       <ShoppingBag size={48} strokeWidth={1}/>
                       <p className="text-xs font-bold">{t('Chọn món để thêm')}</p>
                    </div>
                  ) : (
                    currentOrderItems.filter((i: any) => i.isNew).map((it, idx) => (
                      <div key={idx} className={`bg-background p-3 rounded-xl border transition-all ${(it as any).isNew ? 'border-primary/40 shadow-sm shadow-primary/5' : 'border-border opacity-80'}`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[13px] text-text-main truncate leading-tight">{it._display_name || it.snapshot_name}</p>
                            {it.note && <p className="text-amber-600 text-[11px] font-bold italic leading-tight mt-1 line-clamp-2">{it.note}</p>}
                            <p className="text-primary font-black text-xs mt-1">{formatPrice(it._display_price || it.price || 0)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg">
                            <button onClick={() => {
                               const next = [...currentOrderItems];
                               const realIdx = currentOrderItems.indexOf(it);
                               if (realIdx > -1) {
                                   if (next[realIdx].quantity > 1) {
                                       next[realIdx].quantity -= 1;
                                       setCurrentOrderItems(next);
                                   } else if ((next[realIdx] as any).isNew) {
                                       next.splice(realIdx, 1);
                                       setCurrentOrderItems(next);
                                   }
                               }
                            }} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-red-500"><Minus size={12}/></button>
                            <span className="font-black text-xs min-w-[20px] text-center">{it.quantity}</span>
                            <button onClick={() => {
                               const next = [...currentOrderItems];
                               const realIdx = currentOrderItems.indexOf(it);
                               if (realIdx > -1) {
                                   next[realIdx].quantity += 1;
                                   setCurrentOrderItems(next);
                               }
                            }} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-primary"><Plus size={12}/></button>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setNoteInput(it.note || '');
                            const realIdx = currentOrderItems.indexOf(it);
                            setEditingNoteItem({ idx: realIdx, currentNote: it.note || '', source: 'add_items' });
                            setIsNoteModalOpen(true);
                          }}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all border ${it.note ? 'bg-amber-500/5 border-amber-500/20 shadow-sm' : 'bg-surface border-transparent hover:border-border'}`}
                        >
                          <div className={`p-1.5 rounded-md ${it.note ? 'bg-amber-500 text-white shadow-sm' : 'bg-secondary/10 text-secondary'}`}>
                            <StickyNote size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            {it.note ? (
                              <p className="text-amber-700 text-[10px] font-black uppercase tracking-tighter truncate">{it.note}</p>
                            ) : (
                              <span className="text-text-main text-xs font-bold">{t('Ghi chú')}</span>
                            )}
                          </div>
                          <ChevronRight size={14} className="text-secondary/30" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-6 border-t border-border bg-background/50 space-y-4">
                  <div className="flex justify-between items-end">
                     <span className="text-xs font-bold text-secondary uppercase">{t('Total')}</span>
                     <span className="text-3xl font-black text-primary">
                       {formatPrice(currentOrderItems.reduce((s, it) => s + ((it._display_price || it.price || 0) * it.quantity), 0))}
                     </span>
                  </div>
                  <button 
                    disabled={currentOrderItems.filter((i: any) => i.isNew).length === 0}
                    onClick={handleConfirmAddItems} 
                    className="w-full py-4 bg-primary text-background font-bold text-lg rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                    style={{ minHeight: 'var(--pos-btn-h)' }}
                  >
                    <Check size={20} /> {t('Confirm Add')}
                  </button>
                </div>
              </div>
           </div>
        </div>
      )}
      {isNoteModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><StickyNote size={20} /></div>
                      <h3 className="font-bold text-text-main text-lg">{t('Ghi chú món ăn')}</h3>
                  </div>
                  <textarea 
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all min-h-[120px]"
                    placeholder="VD: Không đường, nhiều đá, ít sữa..."
                    autoFocus
                  />
                  <div className="flex gap-3 mt-6">
                      <button onClick={() => setIsNoteModalOpen(false)} className="flex-1 py-3 border border-border rounded-xl font-bold text-secondary text-sm hover:bg-background transition-colors">{t('Hủy bỏ')}</button>
                      <button onClick={saveNote} className="flex-1 py-3 bg-primary text-background rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">{t('Lưu ghi chú')}</button>
                  </div>
              </div>
          </div>
      )}
      {showTransferModal && activeTable && (
        <TransferModal 
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onConfirm={handleTransferConfirm}
          currentTable={activeTable}
          allTables={tables}
          isProcessing={isSubmitting}
        />
      )}
      {showPaymentModal && selectedTableId && (() => {
          const active = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
          if (!active) return null;
          const { totalAmount: subtotal } = enrichOrderDetails(active, menuItems);
          return (
            <PaymentModal 
              isOpen={showPaymentModal} 
              onClose={() => setShowPaymentModal(false)} 
              onConfirm={async (method, shouldPrint, discountInfo, paymentAmount) => { 
                setIsProcessingPayment(true); 
                try {
                  await checkoutSession(String(active.id), String(selectedTableId), method, discountInfo, paymentAmount); 
                  if (shouldPrint) {
                    const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(active, menuItems);
                    const discountAmount = discountInfo?.amount || 0;
                    const finalTotal = Math.max(0, subtotal - discountAmount);
                    printOrderReceipt({ 
                        ...active, 
                        table: (tables || []).find(t => t.id === selectedTableId)?.label, 
                        status: 'Completed', 
                        items: enriched, 
                        payment_method: method, 
                        total_amount: finalTotal, 
                        discount_amount: discountAmount,
                        subtotal: subtotal,
                        staff: user?.user_metadata?.full_name || 'POS' 
                    }); 
                  }
                  setShowPaymentModal(false); 
                  setSelectedTableId(null); 
                } finally {
                  setIsProcessingPayment(false); 
                }
              }} 
              onPrint={() => printOrderReceipt({ ...active, table: (tables || []).find(t => t.id === selectedTableId)?.label })} 
              totalAmount={subtotal} 
              paidAmount={getPaidAmount(active)}
              orderId={String(active.id)} 
              isProcessing={isProcessingPayment} 
              discount={active.discount_amount ? { 
                amount: active.discount_amount, 
                type: active.discount_type || 'amount', 
                value: active.discount_value || active.discount_amount 
              } : undefined}
            />
          );
      })()}
    </div>
  );
};
