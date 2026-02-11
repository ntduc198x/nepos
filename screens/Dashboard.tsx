
import React, { useState, useMemo, useEffect } from 'react';
import { 
  DollarSign, Receipt, ShoppingBag, Loader2, Wallet, 
  Search, Clock, ChefHat, X, List, Edit, Trash2, Minus, Plus, 
  RefreshCw, CreditCard, Utensils, Check, ShoppingCart, ArrowLeft,
  StickyNote, ChevronRight, Filter, Calendar, Printer, ArrowRightLeft,
  User, Users, Eye
} from 'lucide-react';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../ThemeContext';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../AuthContext';
import { useData } from '../context/DataContext';
import { PaymentModal } from '../components/PaymentModal';
import { TransferModal } from '../components/TransferModal';
import { printOrderReceipt, generateReceiptHTML, isSandboxed } from '../services/printService';
import { enrichOrderDetails, getTableLabel, isOrderActive, getPaidAmount } from '../utils/orderHelpers';
import { useSettingsContext } from '../context/SettingsContext';
import { useOrderOperations } from '../hooks/useOrderOperations'; 
import { supabase } from '../supabase';
import { usePrintPreview } from '../context/PrintPreviewContext';

type Tab = 'Pending' | 'Completed' | 'Cancelled';

const OPERATIONAL_STATUSES = ['Pending', 'Cooking', 'Ready'];
const HISTORY_STATUSES = ['Completed', 'Cancelled'];

export const Dashboard: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const { isOnline } = useNetwork();
  const { user, role: userRole } = useAuth();
  const { settings, guardSensitive, can } = useSettingsContext();
  const { 
    orders, menuItems, tables, checkoutSession, refreshOrdersForDashboard,
    updateLocalOrder, addItemToSession, moveTable, mergeOrders, loading: dataLoading 
  } = useData();
  
  const { performCancelOrder } = useOrderOperations();
  const { openPreview } = usePrintPreview();

  const [activeTab, setActiveTab] = useState<Tab>('Pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [modifiedItems, setModifiedItems] = useState<any[] | null>(null);
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [addItemsSearch, setAddItemsSearch] = useState('');
  const [currentOrderItems, setCurrentOrderItems] = useState<any[]>([]);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{ idx: number, source: 'active' | 'add_items' } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // State to store Admin IDs for filtering Manager view
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  // Flag to prevent rendering stats before RBAC rules are fully loaded (Prevent Flicker)
  const [isRbacReady, setIsRbacReady] = useState(userRole !== 'manager');

  // Trigger Dashboard specific refresh on mount
  useEffect(() => {
      refreshOrdersForDashboard();
  }, []);

  // Fetch Admin IDs if current user is Manager
  useEffect(() => {
    if (userRole === 'manager') {
      setIsRbacReady(false); // Lock render to prevent flickering Admin data
      supabase.from('users').select('id').eq('role', 'admin')
        .then(({ data }) => {
          if (data) {
            setAdminIds(new Set(data.map(u => u.id)));
          }
          setIsRbacReady(true); // Unlock render once Admin IDs are known
        });
    } else {
      setIsRbacReady(true);
    }
  }, [userRole]);
  
  // 1. Date Boundary Helper (Local Time: 00:00 -> 23:59:59)
  // Used for Financial Stream (Completed/Cancelled) to show only today's revenue/history
  const { dayStart, dayEnd } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1); // End of day (Start of next day)
    return { dayStart: start.getTime(), dayEnd: end.getTime() };
  }, []); 

  // 2. Operational Stream (From ALL orders)
  // Rule: Show Active/Pending orders.
  // Requirement: Operational orders must be visible to ALL roles (Staff, Manager, Admin).
  const operationalOrders = useMemo(() => {
    return orders.filter(o => isOrderActive(o.status));
  }, [orders]);

  // 3. Financial Stream (From orders updated TODAY)
  // Rule: Show Completed/Cancelled orders only if updated today (Local Time)
  const financialOrders = useMemo(() => {
    // Step A: Filter by Status & Date (updated_at)
    const dailyHistory = orders.filter(o => {
        if (!HISTORY_STATUSES.includes(o.status)) return false;
        
        // Strict: Use updated_at. Fallback to created_at only if updated_at is missing.
        const timeStr = o.updated_at || o.created_at;
        if (!timeStr) return false;

        const t = new Date(timeStr).getTime();
        return t >= dayStart && t < dayEnd;
    });

    // Step B: Apply RBAC (Permissions)
    
    // Admin: View All
    if (userRole === 'admin') {
      return dailyHistory;
    }

    // Manager: View All EXCEPT Admin orders
    if (userRole === 'manager') {
        // Critical: If RBAC is not ready, return empty to avoid flash of Admin data
        if (!isRbacReady) return [];

        return dailyHistory.filter(o => {
            // If created by an Admin (based on user_id), exclude it
            if (o.user_id && adminIds.has(o.user_id)) return false;
            return true;
        });
    }
    
    // Staff: View Own Orders (Created OR Paid)
    // ✅ LOGIC: Staff thấy đơn mình TẠO hoặc mình THANH TOÁN
    if (!user) return [];

    const userEmail = (user.email || '').toLowerCase();
    const userId = String(user.id);

    return dailyHistory.filter(o => {
      // Check 1: user_id (người tạo đơn)
      if (o.user_id && String(o.user_id) === userId) return true;
      
      // Check 2: staff_name (người thanh toán sau cùng - từ update mới)
      const staffName = (o.staff_name || '').toLowerCase();
      if (staffName === userEmail) return true;
      
      // Check 3: staff field (fallback cho legacy orders)
      const staffEmail = (o.staff || '').toLowerCase();
      if (staffEmail === userEmail) return true;
      
      return false;
    });
  }, [orders, userRole, user, dayStart, dayEnd, adminIds, isRbacReady]);

  // 4. Combined Source for Detail View lookup
  const allAccessibleOrders = useMemo(() => {
    return [...operationalOrders, ...financialOrders];
  }, [operationalOrders, financialOrders]);

  // 5. Stats Calculation
  // Rule: Revenue derived ONLY from the filtered 'financialOrders' list (Completed + Today + RBAC)
  const stats = useMemo(() => {
    const activeCount = operationalOrders.length;
    
    // Filter out 'Cancelled' for revenue calculation
    const shiftCompleted = financialOrders.filter(o => o.status === 'Completed');
    
    // Revenue sum
    const revenue = shiftCompleted.reduce((acc, o) => acc + (o.total_amount || 0), 0);
    const completedCount = shiftCompleted.length;
    const avgBill = completedCount ? revenue / completedCount : 0;
    
    const labelRevenue = userRole === 'staff' ? 'Doanh thu (Của bạn)' : 'Doanh thu hôm nay';
    const labelCompleted = userRole === 'staff' ? 'Đã xong (Của bạn)' : 'Đã hoàn thành';

    return [
      { 
        label: labelRevenue, 
        val: formatPrice(revenue), 
        icon: DollarSign, 
        color: 'text-emerald-500', 
        bg: 'bg-emerald-500/10' 
      },
      { 
        label: 'Đang phục vụ', 
        val: activeCount, 
        icon: Receipt, 
        color: 'text-blue-500', 
        bg: 'bg-blue-500/10' 
      },
      { 
        label: labelCompleted, 
        val: completedCount, 
        icon: Check, 
        color: 'text-purple-500', 
        bg: 'bg-purple-500/10' 
      },
      { 
        label: 'TB Đơn', 
        val: formatPrice(avgBill), 
        icon: ShoppingBag, 
        color: 'text-orange-500', 
        bg: 'bg-orange-500/10' 
      },
    ];
  }, [operationalOrders, financialOrders, formatPrice, userRole]);

  // 6. Filter List for UI
  const filteredOrders = useMemo(() => {
    let source = [];
    if (activeTab === 'Pending') {
      source = operationalOrders;
    } else {
      source = financialOrders.filter(o => o.status === activeTab);
    }
    return source.filter(o => {
      const label = getTableLabel(o, tables);
      const matchesSearch = o.id.toString().toLowerCase().includes(searchQuery.toLowerCase()) || 
                          label.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeTab, operationalOrders, financialOrders, searchQuery, tables]);

  const viewingOrder = useMemo(() => 
    allAccessibleOrders.find(o => String(o.id) === String(selectedOrderId)), 
  [allAccessibleOrders, selectedOrderId]);

  // --- HANDLERS ---

  const handleSelectOrder = (order: any) => {
    setSelectedOrderId(String(order.id));
    setModifiedItems(null);
  };

  const handleUpdateQty = async (idx: number, delta: number) => {
    if (!viewingOrder || !isOrderActive(viewingOrder.status)) return;
    const baseItems = modifiedItems || (viewingOrder ? enrichOrderDetails(viewingOrder, menuItems).items : []);
    const next = [...baseItems];
    const newQty = (next[idx].quantity || 0) + delta;

    if (newQty <= 0) {
        // RESET FLOW: If this is the last item, remove => reset table
        if (next.length <= 1) {
            performCancelOrder(viewingOrder, () => {
                setSelectedOrderId(null);
                setModifiedItems(null);
            }, {
                confirm: {
                    title: t('Confirm Reset Order'),
                    message: t('Last item removal warning'),
                    confirmText: t('Confirm'),
                    isDanger: true
                },
                successMessage: t('Table Reset Success'),
                details: 'Auto-reset via last item removal'
            });
            return;
        }

        const guardRes = await guardSensitive('cancel_item', () => {
            next.splice(idx, 1);
            setModifiedItems(next);
        }, { 
            tableId: viewingOrder.table_id,
            confirm: settings.confirmCancelItem ? {
                title: t('Xóa món?'),
                message: t('Bạn có chắc chắn muốn xóa món này khỏi đơn?'),
                confirmText: t('Xóa'),
                isDanger: true
            } : undefined
        });
        if (!guardRes.ok) return;
    } else {
        next[idx] = { ...next[idx], quantity: newQty };
        setModifiedItems(next);
    }
  };

  const handleDeleteClick = () => {
      if (!viewingOrder) return;
      performCancelOrder(viewingOrder, () => {
          setSelectedOrderId(null);
          setModifiedItems(null);
      });
  };

  const openNote = (idx: number, source: 'active' | 'add_items') => {
    if (source === 'active' && viewingOrder && !isOrderActive(viewingOrder.status)) return;
    let currentNote = '';
    if (source === 'active') {
      const items = modifiedItems || (viewingOrder ? enrichOrderDetails(viewingOrder, menuItems).items : []);
      currentNote = items[idx]?.note || '';
    } else {
      currentNote = currentOrderItems[idx]?.note || '';
    }
    setNoteInput(currentNote);
    setEditingNote({ idx, source });
    setIsNoteModalOpen(true);
  };

  const saveNote = () => {
    if (!editingNote) return;
    if (editingNote.source === 'active') {
      const baseItems = modifiedItems || (viewingOrder ? enrichOrderDetails(viewingOrder, menuItems).items : []);
      const next = [...baseItems];
      next[editingNote.idx] = { ...next[editingNote.idx], note: noteInput };
      setModifiedItems(next);
    } else {
      const next = [...currentOrderItems];
      next[editingNote.idx] = { ...next[editingNote.idx], note: noteInput };
      setCurrentOrderItems(next);
    }
    setIsNoteModalOpen(false);
  };

  const handleOpenAddItems = () => {
    if (!viewingOrder || !isOrderActive(viewingOrder.status)) return;
    const { items: enriched } = enrichOrderDetails(viewingOrder, menuItems);
    setCurrentOrderItems(enriched.map((x: any) => ({ ...x, isNew: false })));
    setAddItemsSearch('');
    setIsAddItemsModalOpen(true);
  };

  const handleConfirmAddItems = async () => {
    if (!viewingOrder || !isOrderActive(viewingOrder.status)) return;
    const newItemsOnly = currentOrderItems.filter(i => i.isNew).map(i => ({
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      price: i.price ?? i._display_price,
      _snapshot_name: i._snapshot_name ?? i._display_name,
      note: (i.note || '').trim()
    }));

    if (newItemsOnly.length === 0) {
      setIsAddItemsModalOpen(false);
      return;
    }

    try {
      await addItemToSession(viewingOrder.id, newItemsOnly);
      const mergedForDisplay = currentOrderItems.map(it => ({ ...it, isNew: false }));
      setModifiedItems(mergedForDisplay);
      setIsAddItemsModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const performPrint = async (order: any) => {
    if (!order) return;
    const { items: enriched } = enrichOrderDetails(order, menuItems);
    const orderToPrint = { ...order, items: enriched };
    
    if (isSandboxed() && settings.printMethod !== 'rawbt') {
        const html = await generateReceiptHTML(orderToPrint, settings);
        openPreview({ html, title: 'In hóa đơn', meta: { action: 'REPRINT_ON_EDIT' } });
    } else {
        await printOrderReceipt(orderToPrint, settings);
    }
  };

  const handlePrintClick = async (order: any) => {
    if (!order) return;
    await guardSensitive('reprint_receipt', () => performPrint(order));
  };

  const handlePaymentConfirm = async (method: any, shouldPrint: boolean, discountInfo?: any, paymentAmount?: number) => {
    if (!viewingOrder || !isOrderActive(viewingOrder.status)) return;
    setIsProcessingPayment(true);
    try {
      await checkoutSession(viewingOrder.id, String(viewingOrder.table_id || 'Takeaway'), method, discountInfo, paymentAmount);
      if (shouldPrint) {
         const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(viewingOrder, menuItems);
         const discountAmount = discountInfo?.amount || 0;
         const finalTotal = Math.max(0, subtotal - discountAmount);
         
         const completedOrder = { 
             ...viewingOrder, 
             status: 'Completed', 
             payment_method: method, 
             items: enriched,
             total_amount: finalTotal,
             discount_amount: discountAmount,
             subtotal: subtotal
         };
         await performPrint(completedOrder);
      }
      setShowPaymentModal(false);
      setSelectedOrderId(null);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleTransferConfirm = async (targetId: string, mode: 'move' | 'merge') => {
    if (!viewingOrder) return;
    setIsProcessingPayment(true);
    try {
      if (mode === 'move') {
        await moveTable(viewingOrder.table_id, targetId);
      } else {
        await mergeOrders(viewingOrder.table_id, targetId);
      }
      setShowTransferModal(false);
      setSelectedOrderId(null);
    } catch (e) {
      console.error(e);
      alert('Action failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (dataLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-primary" size={48} /></div>;

  return (
    <div className="flex flex-col h-full bg-background lg:flex-row overflow-hidden transition-colors">
      
      {/* LEFT COLUMN: ORDERS LIST */}
      <div className={`flex-1 flex flex-col min-w-0 border-r border-border h-full ${selectedOrderId ? 'hidden lg:flex' : 'flex'}`}>
        <header className="p-4 lg:p-6 border-b border-border bg-background/95 backdrop-blur shrink-0 z-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-text-main flex items-center gap-2">
               <Receipt className="text-primary" /> {t('Dashboard')}
            </h2>
            <div className="flex items-center gap-3">
              {userRole === 'staff' && (
                <div className="text-[10px] font-bold bg-secondary/10 text-secondary px-2 py-1 rounded-full uppercase flex items-center gap-1 border border-secondary/20">
                  <User size={12} /> {t('Personal View')}
                </div>
              )}
              {userRole !== 'staff' && (
                <div className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full uppercase flex items-center gap-1 border border-primary/20">
                  <Users size={12} /> {t('Global View')}
                </div>
              )}
              <div className="text-[10px] font-black bg-surface text-secondary border border-border px-2 py-1 rounded-full uppercase tracking-tighter">
                {isOnline ? t('Online') : t('Offline')}
              </div>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
            {stats.map((s, i) => (
              <div key={i} className="flex-shrink-0 w-36 lg:w-auto bg-surface border border-border p-3 rounded-xl flex items-center gap-3">
                 <div className={`p-2 rounded-lg ${s.bg} ${s.color}`}><s.icon size={16}/></div>
                 <div className="min-w-0">
                    <p className="text-[10px] font-bold text-secondary truncate">{t(s.label)}</p>
                    <p className="text-sm font-black text-text-main truncate">{s.val}</p>
                 </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16}/>
              <input 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('Search ID or Table...')}
                className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>
            <div className="bg-surface p-1 rounded-xl border border-border flex shrink-0">
               {(['Pending', 'Completed', 'Cancelled'] as Tab[]).map(tab => (
                 <button 
                   key={tab}
                   onClick={() => setActiveTab(tab)}
                   className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === tab ? 'bg-primary text-background shadow-md' : 'text-secondary hover:text-text-main'}`}
                 >
                   {t(tab)}
                 </button>
               ))}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar space-y-4 bg-surface/30">
          {filteredOrders.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-secondary opacity-30 gap-4">
               <List size={48} strokeWidth={1}/>
               <p className="text-sm font-bold uppercase tracking-widest">{t('No orders found')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-20 lg:pb-6">
              {filteredOrders.map(order => (
                <div 
                  key={order.id} 
                  onClick={() => handleSelectOrder(order)}
                  className={`bg-surface border rounded-2xl p-4 cursor-pointer transition-all hover:border-primary group relative overflow-hidden shadow-sm
                    ${String(selectedOrderId) === String(order.id) ? 'ring-2 ring-primary border-primary' : 'border-border'}
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                     <div>
                        <div className="flex items-center gap-2">
                          {order.table_id === 'Takeaway' ? (
                             <span className="px-2 py-0.5 rounded text-xs font-black bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-tighter">
                                {getTableLabel(order, tables)}
                             </span>
                          ) : (
                             <h4 className="font-black text-sm truncate max-w-[120px] text-text-main">
                                {getTableLabel(order, tables)}
                             </h4>
                          )}
                        </div>
                        <p className="text-[10px] text-secondary font-mono tracking-tighter">#{order.id.toString().slice(-6).toUpperCase()}</p>
                     </div>
                     <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                       order.status === 'Ready' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                       order.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                       order.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                       'bg-amber-500/10 text-amber-500 border-amber-500/20'
                     }`}>
                       {t(order.status)}
                     </span>
                  </div>
                  
                  <div className="flex justify-between items-end mt-4 pt-3 border-t border-border/50">
                     <div className="flex items-center gap-1 text-secondary">
                        <Clock size={12}/>
                        <span className="text-[10px] font-bold">{new Date(order.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                     </div>
                     <span className="font-black text-primary text-base">{formatPrice(order.total_amount || order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: ORDER DETAIL */}
      <div className={`w-full lg:w-80 xl:w-96 flex flex-col bg-surface border-l border-border h-full shrink-0 z-20 ${!selectedOrderId ? 'hidden lg:flex' : 'flex fixed inset-0 lg:relative'}`}>
        {!viewingOrder ? (
          <div className="flex-1 flex flex-col items-center justify-center text-secondary opacity-30 gap-4 p-8 text-center">
             <Utensils size={64} strokeWidth={1}/>
             <div>
                <p className="text-lg font-black uppercase tracking-widest">{t('Select an Order')}</p>
                <p className="text-xs mt-1">Tap an order from the list to view details and manage items.</p>
             </div>
          </div>
        ) : (
          <>
            <header className="h-16 lg:h-20 border-b border-border flex items-center justify-between px-6 bg-background/50 shrink-0">
               <div className="flex items-center gap-4">
                  <button onClick={() => setSelectedOrderId(null)} className="lg:hidden p-2 hover:bg-border rounded-xl transition-all">
                    <ArrowLeft size={24}/>
                  </button>
                  <div className="overflow-hidden">
                     <div className="flex items-center gap-2">
                       {viewingOrder.table_id === 'Takeaway' ? (
                           <span className="px-2 py-1 rounded-lg text-lg font-black bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-tighter">
                              {getTableLabel(viewingOrder, tables)}
                           </span>
                       ) : (
                           <h3 className="text-lg font-black truncate text-text-main">
                              {getTableLabel(viewingOrder, tables)}
                           </h3>
                       )}
                     </div>
                     <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">#{viewingOrder.id.toString().slice(-6).toUpperCase()}</p>
                  </div>
               </div>
               <div className="flex items-center gap-2">
                  {isOrderActive(viewingOrder.status) && tables.some(t => t.id === viewingOrder.table_id) && (
                    <button 
                      onClick={() => setShowTransferModal(true)} 
                      className="p-2 text-secondary hover:text-primary transition-colors"
                      title={t('Split / Merge Table')}
                    >
                      <ArrowRightLeft size={20}/>
                    </button>
                  )}
                  
                  {isOrderActive(viewingOrder.status) && (
                    <button 
                        onClick={handleDeleteClick} 
                        className="p-2 text-secondary hover:text-red-500 transition-colors" 
                        title={t('Cancel Order')}
                    >
                        <Trash2 size={20}/>
                    </button>
                  )}
                  <button onClick={() => setSelectedOrderId(null)} className="hidden lg:block p-2 text-secondary hover:text-text-main"><X size={24}/></button>
               </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-surface/30 
              pb-[calc(240px+env(safe-area-inset-bottom,0px)+72px)] lg:pb-8">
               {(() => {
                  const { items: enriched } = enrichOrderDetails(viewingOrder, menuItems);
                  const displayItems = modifiedItems || enriched;
                  const isActive = isOrderActive(viewingOrder.status);

                  return (
                    <div className="space-y-3">
                      {displayItems.map((it: any, idx: number) => (
                        <div key={idx} className="bg-background border border-border rounded-2xl p-4 flex flex-col gap-3 group transition-all hover:border-primary/30">
                          <div className="flex items-start justify-between gap-3">
                            <div className="shrink-0 pt-1">
                              {isActive ? (
                                <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg">
                                  <button onClick={() => handleUpdateQty(idx, -1)} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-red-500">
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-xs font-black text-primary min-w-[18px] text-center">
                                    {it.quantity}
                                  </span>
                                  <button onClick={() => handleUpdateQty(idx, 1)} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-primary">
                                    <Plus size={12} />
                                  </button>
                                </div>
                              ) : (
                                <span className="font-black text-primary px-3 py-1 bg-surface border border-border rounded-lg text-xs">x{it.quantity}</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 pt-1">
                              <p className="font-bold text-text-main text-sm whitespace-normal break-words leading-snug">
                                {it._display_name}
                              </p>
                            </div>

                            <div className="shrink-0 pt-1 text-right font-black text-text-main text-sm tabular-nums whitespace-nowrap">
                              {formatPrice(it._display_price * it.quantity)}
                            </div>
                          </div>

                           <div className="flex items-center justify-between">
                              {isActive && (
                                <button 
                                  onClick={() => openNote(idx, 'active')}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase transition-all ${
                                    it.note ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-surface border-border text-secondary hover:text-primary'
                                  }`}
                                >
                                  <StickyNote size={12} />
                                  {it.note ? t('Note Added') : t('Add Note')}
                                </button>
                              )}
                           </div>
                           {it.note && <p className="text-[11px] font-bold text-amber-600 italic px-3 py-2 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/20">{it.note}</p>}
                        </div>
                      ))}
                    </div>
                  );
               })()}
            </div>

            <div 
              className="sticky z-50 bg-background/95 backdrop-blur-md border-t border-border p-4 lg:p-6 space-y-4 shadow-[0_-8px_30px_rgb(0,0,0,0.12)]
                bottom-[calc(env(safe-area-inset-bottom,0px)+70px)] lg:bottom-0"
            >
               {(() => {
                  const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(viewingOrder, menuItems);
                  const displayItems = modifiedItems || enriched;
                  const currentTotal = displayItems.reduce((s, it) => s + (it._display_price * it.quantity), 0);
                  const hasChanges = modifiedItems !== null && JSON.stringify(modifiedItems) !== JSON.stringify(enriched);
                  const isActive = isOrderActive(viewingOrder.status);

                  const discountAmount = viewingOrder.discount_amount || 0;
                  const finalDisplayTotal = Math.max(0, currentTotal - discountAmount);

                  return (
                    <>
                      <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                        <div className="space-y-1">
                            <div className="flex justify-between items-end">
                              <span className="text-xs font-black text-secondary uppercase tracking-widest">{t('Subtotal')}</span>
                              <span className="text-sm font-bold text-text-main">{formatPrice(currentTotal)}</span>
                            </div>
                            {discountAmount > 0 && (
                              <div className="flex justify-between items-end text-red-500">
                                <span className="text-xs font-black uppercase tracking-widest">{t('Discount')}</span>
                                <span className="text-sm font-bold">-{formatPrice(discountAmount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-end pt-2 border-t border-border border-dashed">
                                <span className="text-xs font-black text-secondary uppercase tracking-widest">{t('Total Amount')}</span>
                                <span className={`text-2xl font-black ${hasChanges ? 'text-amber-500' : 'text-primary'}`}>{formatPrice(finalDisplayTotal)}</span>
                            </div>
                        </div>
                        <div className="flex justify-end mt-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                              viewingOrder.status === 'Ready' ? 'text-blue-500 border-blue-500 bg-blue-500/10' : 
                              viewingOrder.status === 'Completed' ? 'text-emerald-500 border-emerald-500 bg-emerald-500/10' :
                              viewingOrder.status === 'Cancelled' ? 'text-red-500 border-red-500 bg-red-500/10' :
                              'text-amber-500 border-amber-500 bg-amber-500/10'
                            }`}>{t(viewingOrder.status)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {isActive ? (
                          hasChanges ? (
                            <button 
                              onClick={async () => {
                                const payload = displayItems.map(it => ({
                                  menu_item_id: it.menu_item_id,
                                  quantity: Number(it.quantity || 1),
                                  price: Number(it.price || it._display_price || 0),
                                  _snapshot_name: it.snapshot_name || it._snapshot_name || it._display_name,
                                  note: (it.note || '').trim()
                                }));
                                await updateLocalOrder(viewingOrder.id, { order_items: payload });
                                setModifiedItems(null);
                              }}
                              className="w-full h-14 bg-emerald-500 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                            >
                               <RefreshCw size={20} className="animate-in spin-in-180" /> {t('Update Order')}
                            </button>
                          ) : (
                            <div className="flex gap-3">
                              <button 
                                onClick={handleOpenAddItems}
                                className="flex-1 h-14 bg-surface border-2 border-primary/20 text-primary rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-95 transition-all"
                              >
                                <Plus size={20}/> {t('Add Items')}
                              </button>
                              <button 
                                onClick={() => setShowPaymentModal(true)}
                                className="flex-1 h-14 bg-primary text-background rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                              >
                                <CreditCard size={20}/> {t('Pay')}
                              </button>
                            </div>
                          )
                        ) : viewingOrder.status === 'Completed' ? (
                          <div className="space-y-3">
                            <button 
                              onClick={() => handlePrintClick(viewingOrder)}
                              className="w-full h-14 bg-surface border border-border text-text-main rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-border transition-all"
                            >
                               <Printer size={20} /> {t('Print Receipt')}
                            </button>
                          </div>
                        ) : (
                          <div className="p-4 bg-secondary/5 rounded-2xl border border-border text-center">
                            <span className="text-xs font-black text-secondary uppercase tracking-widest">{t('Order is')} {t(viewingOrder.status)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  );
               })()}
            </div>
          </>
        )}
      </div>

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
                   <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{getTableLabel(viewingOrder, tables)}</p>
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
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {menuItems.filter(i => i.name.toLowerCase().includes(addItemsSearch.toLowerCase())).map((item: any) => (
                    <button 
                      key={item.id} 
                      onClick={() => {
                        const existingIdx = currentOrderItems.findIndex(i => String(i.menu_item_id) === String(item.id) && i.isNew);
                        if (existingIdx > -1) {
                           const next = [...currentOrderItems];
                           next[existingIdx].quantity += 1;
                           setCurrentOrderItems(next);
                        } else {
                           setCurrentOrderItems([...currentOrderItems, {
                              menu_item_id: item.id,
                              quantity: 1,
                              price: item.price,
                              _display_name: item.name,
                              _display_price: item.price,
                              isNew: true
                           }]);
                        }
                      }} 
                      className="bg-surface border border-border rounded-2xl p-3 text-left hover:border-primary transition-all group flex flex-col h-full shadow-sm relative active:scale-95"
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

              <div className="w-[380px] border-l border-border bg-surface flex flex-col shadow-2xl shrink-0">
                <div className="p-5 border-b border-border bg-background/50 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-widest text-primary">{t('Items to Add')}</span>
                  <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">{currentOrderItems.length} Món</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {currentOrderItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-secondary opacity-30 gap-3">
                       <ShoppingBag size={48} strokeWidth={1}/>
                       <p className="text-xs font-bold">{t('Chọn món để thêm')}</p>
                    </div>
                  ) : (
                    currentOrderItems.map((it, idx) => (
                      <div key={idx} className={`bg-background p-3 rounded-xl border transition-all ${it.isNew ? 'border-primary/40 shadow-sm shadow-primary/5' : 'border-border opacity-80'}`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[13px] text-text-main truncate leading-tight">{it._display_name || it.snapshot_name}</p>
                            {it.note && <p className="text-amber-600 text-[11px] font-bold italic leading-tight mt-1 line-clamp-2">{it.note}</p>}
                            <p className="text-primary font-black text-xs mt-1">{formatPrice(it._display_price || it.price || 0)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg">
                            <button onClick={() => {
                               const next = [...currentOrderItems];
                               if (next[idx].quantity > 1) {
                                 next[idx].quantity -= 1;
                                 setCurrentOrderItems(next);
                               } else if (next[idx].isNew) {
                                 next.splice(idx, 1);
                                 setCurrentOrderItems(next);
                               }
                            }} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-red-500"><Minus size={12}/></button>
                            <span className="font-black text-xs min-w-[20px] text-center">{it.quantity}</span>
                            <button onClick={() => {
                               const next = [...currentOrderItems];
                               next[idx].quantity += 1;
                               setCurrentOrderItems(next);
                            }} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-primary"><Plus size={12}/></button>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => {
                            setNoteInput(it.note || '');
                            setEditingNote({ idx, source: 'add_items' });
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
                    disabled={currentOrderItems.filter(i => i.isNew).length === 0}
                    onClick={handleConfirmAddItems} 
                    className="w-full py-4 bg-primary text-background font-bold text-lg rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
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

      {showTransferModal && viewingOrder && tables.find(t => t.id === viewingOrder.table_id) && (
        <TransferModal 
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onConfirm={handleTransferConfirm}
          currentTable={tables.find(t => t.id === viewingOrder.table_id)!}
          allTables={tables}
          isProcessing={isProcessingPayment}
        />
      )}

      {showPaymentModal && viewingOrder && (() => {
         const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(viewingOrder, menuItems);
         return (
           <PaymentModal 
             isOpen={showPaymentModal} 
             onClose={() => setShowPaymentModal(false)} 
             onConfirm={handlePaymentConfirm} 
             onPrint={() => performPrint(viewingOrder)} 
             totalAmount={subtotal} 
             paidAmount={getPaidAmount(viewingOrder)}
             orderId={viewingOrder.id} 
             isProcessing={isProcessingPayment} 
             discount={viewingOrder.discount_amount ? { 
                amount: viewingOrder.discount_amount, 
                type: viewingOrder.discount_type || 'amount', 
                value: viewingOrder.discount_value || viewingOrder.discount_amount 
             } : undefined}
           />
         );
      })()}
    </div>
  );
};
