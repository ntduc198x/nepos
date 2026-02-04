
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Plus, Image, 
  Minus, ArrowDownUp,
  ShoppingCart, Utensils, Check,
  Armchair, ShoppingBag, ChevronUp, WifiOff, Loader2, X, ArrowLeft,
  Clock, Printer, Receipt, StickyNote, Info, Save, Edit, Trash2, Settings, RefreshCw,
  ChevronRight, CreditCard, AlertTriangle, Upload, Delete, Link as LinkIcon
} from 'lucide-react';
import { MenuItem } from '../types';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../ThemeContext';
import { useNetwork } from '../context/NetworkContext';
import { useAuth } from '../AuthContext';
import { useData } from '../context/DataContext';
import { PaymentModal } from '../components/PaymentModal';
import { printOrderReceipt } from '../services/printService';
import { enrichOrderDetails, getTableLabel, isOrderActive, getPaidAmount } from '../utils/orderHelpers';
import { supabase } from '../supabase';
import { useSettingsContext } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { playBeep } from '../services/SoundService';
import { ConfirmModal } from '../components/ConfirmModal';
import { useOrderOperations } from '../hooks/useOrderOperations';

const BOTTOM_NAV_HEIGHT = 70;

// Helper to convert file to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// Subcomponent for Active Orders List
const ActiveOrdersContent: React.FC<{
  activeOrders: any[];
  tables: any[];
  onSelect: (order: any) => void;
  t: (k: string) => string;
  formatPrice: (p: number) => string;
  viewingOrderId: string | null;
  onRequestCancel: (order: any) => void;
}> = ({ activeOrders, tables, onSelect, t, formatPrice, viewingOrderId, onRequestCancel }) => {
  // Resize State for Switch List (Mode B)
  const [listHeight, setListHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("RESBAR_SWITCHLIST_HEIGHT");
      return saved ? parseInt(saved, 10) : 180;
    }
    return 180;
  });

  // Pointer Capture Refs
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = listHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientY - startY.current;
    // Bounds: Min 160px, Max ~600px
    const newHeight = Math.min(Math.max(160, startHeight.current + delta), 600);
    setListHeight(newHeight);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      localStorage.setItem("RESBAR_SWITCHLIST_HEIGHT", listHeight.toString());
    }
  };

  if (activeOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 opacity-30 gap-3">
        <Receipt size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest">{t('No active orders')}</p>
      </div>
    );
  }

  const renderItem = (order: any) => {
    const isSelected = String(viewingOrderId) === String(order.id);
    const isActive = isOrderActive(order.status);
    
    return (
      <div 
        key={order.id} 
        onClick={() => onSelect(order)}
        className={`bg-background border rounded-xl p-3 cursor-pointer transition-all group shadow-sm active:scale-[0.98]
          ${isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/50'}`}
        style={{ borderWidth: 'var(--pos-border-strong)' }}
      >
        <div className="flex justify-between items-start mb-1">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              {order.table_id === 'Takeaway' ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-tighter truncate max-w-[120px]">
                  {getTableLabel(order, tables)}
                </span>
              ) : (
                <h4 className="font-black text-xs uppercase truncate max-w-[120px] text-text-main">
                  {getTableLabel(order, tables)}
                </h4>
              )}
            </div>
            <div className="flex items-center gap-1 text-secondary">
              <Clock size={10} />
              <span className="text-[9px] font-bold">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isSelected && isActive && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestCancel(order);
                }}
                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all animate-in fade-in zoom-in duration-200"
                title={t('Cancel Order')}
              >
                <Trash2 size={14} />
              </button>
            )}
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase whitespace-nowrap ${
               order.status === 'Ready' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}>
              {t(order.status)}
            </span>
          </div>
        </div>
        
        <div className="flex justify-end mt-1">
          <span className="font-black text-primary text-sm">{formatPrice(order.total_amount || order.total)}</span>
        </div>
      </div>
    );
  };

  // MODE A: Standard List (No internal scroll)
  if (!viewingOrderId) {
    return (
      <div className="space-y-2">
        {activeOrders.map(renderItem)}
      </div>
    );
  }

  // MODE B: Switch View (Resizable Scroll Container)
  return (
    <div className="flex flex-col">
      <div 
        className="space-y-2 overflow-y-auto custom-scrollbar pr-1"
        style={{ height: listHeight }}
      >
        {activeOrders.map(renderItem)}
      </div>
      
      {/* Drag Handle */}
      <div 
        className="h-5 flex items-center justify-center cursor-ns-resize touch-none hover:bg-border/50 active:bg-border transition-colors rounded-b-lg -mb-1 mt-1"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to resize"
      >
         <div className="w-10 h-1 rounded-full bg-secondary/30"></div>
      </div>
    </div>
  );
};

export const Menu: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const { isOnline } = useNetwork();
  const { user } = useAuth();
  const { can, settings, guardSensitive } = useSettingsContext();
  const { showToast } = useToast();
  
  const { 
    menuItems: items = [], 
    tables = [], 
    orders = [], 
    addLocalOrder, 
    addItemToSession, 
    checkoutSession,
    updateLocalOrder,
    cancelOrder,
    currentStaffEmail, 
    loading,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem
  } = useData();
  
  const { performCancelOrder } = useOrderOperations();

  // UI State
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<'name' | 'price-asc' | 'price-desc'>('name');
  const [sidebarTab, setSidebarTab] = useState<'cart' | 'orders'>('cart');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- SHORTCUT LOGIC ---
  useEffect(() => {
    const handleFocusSearch = () => {
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    };
    window.addEventListener('pos:shortcut:focusSearch', handleFocusSearch);
    return () => window.removeEventListener('pos:shortcut:focusSearch', handleFocusSearch);
  }, []);

  // Cart State (Draft)
  const [cart, setCart] = useState<{item: MenuItem, qty: number, note?: string}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Quantity Modal State
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyValue, setQtyValue] = useState<string>('1');
  const [pendingAddItem, setPendingAddItem] = useState<MenuItem | null>(null);

  // Modal States
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  
  const [editingNoteItem, setEditingNoteItem] = useState<{idx: number, currentNote: string, source: 'cart' | 'active' | 'add_items'} | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '', price: '', category: 'Coffee', image: '', stock: '99', description: ''
  });

  // Delete Confirmation State
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Image Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // uploadPreview now effectively mirrors itemForm.image for immediate feedback
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'type-selection' | 'table-selection'>('type-selection');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  
  // Active Order Interaction State
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [modifiedItems, setModifiedItems] = useState<any[] | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [currentOrderItems, setCurrentOrderItems] = useState<any[]>([]);
  const [addItemsSearch, setAddItemsSearch] = useState('');

  // Sync effect
  useEffect(() => {
    if (!viewingOrder) return;
    const updated = orders.find(o => String(o.id) === String(viewingOrder.id));
    if (updated) {
      setViewingOrder(updated);
    } else {
      setViewingOrder(null);
    }
  }, [orders]);

  // Derived Data
  const activeOrders = useMemo(() => {
    return orders.filter(o => isOrderActive(o.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders]);

  const availableTables = useMemo(() => {
    return tables.filter(table => {
      if (table.id === 'Takeaway') return false;
      const isOccupied = orders.some(o => 
        String(o.table_id) === String(table.id) && isOrderActive(o.status)
      );
      return !isOccupied;
    });
  }, [tables, orders]);

  const cartTotals = useMemo(() => {
    const count = cart.reduce((acc, curr) => acc + curr.qty, 0);
    const amount = cart.reduce((acc, curr) => acc + (curr.item.price * curr.qty), 0);
    return { count, amount };
  }, [cart]);

  const handleSelectActiveOrder = (order: any) => {
    setViewingOrder(order);
    setModifiedItems(null);
    setSidebarTab('orders');
  };

  const handleRequestCancel = async (order: any) => {
    performCancelOrder(order, () => {
        if (viewingOrder && String(viewingOrder.id) === String(order.id)) {
            setViewingOrder(null);
            setModifiedItems(null);
        }
    });
  };

  const addItemQuantity = (item: MenuItem, qty: number) => {
    if (viewingOrder && isOrderActive(viewingOrder.status)) {
        const { items: enriched } = enrichOrderDetails(viewingOrder, items);
        const base = modifiedItems || enriched;
        const idx = base.findIndex(x => String(x.menu_item_id) === String(item.id) && !(x.note || '').trim());
        const next = [...base];

        if (idx > -1) {
            next[idx] = { ...next[idx], quantity: (next[idx].quantity || 0) + qty };
        } else {
            next.push({
                menu_item_id: item.id,
                quantity: qty,
                price: item.price,
                _display_name: item.name,
                _display_price: item.price,
                note: ''
            });
        }
        setModifiedItems(next);
        setSidebarTab('orders');
    } else {
        setCart(prev => {
            const existingIdx = prev.findIndex(i => i.item.id === item.id && !i.note);
            if (existingIdx > -1) {
                const next = [...prev];
                next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + qty };
                return next;
            }
            return [...prev, { item, qty }];
        });
        setSidebarTab('cart');
    }
    
    // Play sound if enabled
    if (settings.soundEffect) {
        playBeep('success');
    }
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (isEditMode || item.stock <= 0) return;

    // Check settings for tap behavior. 
    // If singleTapAdd is on, add immediately. Otherwise show quantity modal.
    if (settings.singleTapAdd) {
        addItemQuantity(item, 1);
        return;
    }

    setPendingAddItem(item);
    setQtyValue('1');
    setQtyModalOpen(true);
  };

  const handleConfirmQty = () => {
    if (!pendingAddItem) return;
    const qty = parseInt(qtyValue, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
        showToast(t('Số lượng phải lớn hơn 0'), 'error');
        return;
    }
    addItemQuantity(pendingAddItem, qty);
    setQtyModalOpen(false);
    setPendingAddItem(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setUploadPreview(base64);
        setItemForm(prev => ({ ...prev, image: base64 }));
      } catch (err) {
        console.error("Failed to convert image", err);
        showToast("Lỗi xử lý ảnh", "error");
      }
    }
  };

  const handleSaveItem = async () => {
    // No dedicated upload step needed anymore as we store base64/url directly in DB text column
    if (isUploading) return;
    setIsUploading(true);
    try {
      // Use image from form directly (it holds either Base64 or URL)
      const imageUrl = itemForm.image;

      const data = { 
        ...itemForm, 
        image: imageUrl, 
        price: Number(itemForm.price), 
        stock: Number(itemForm.stock) 
      };

      if(editingItem) {
          await updateMenuItem(editingItem.id, data as any);
          showToast('Đã cập nhật món thành công', 'success');
      } else {
          await addMenuItem(data as any);
          showToast('Đã thêm món mới thành công', 'success');
      }
      
      setIsItemModalOpen(false);
      setUploadPreview(null);
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi lưu món', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteMenuItem(pendingDelete.id);
      showToast('Đã xóa món', 'success');
      setPendingDelete(null);
    } catch (e) {
        showToast('Lỗi khi xóa món', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart(prev => {
        const next = [...prev];
        const nextQty = next[idx].qty + delta;
        if (nextQty <= 0) {
            // Direct remove for Draft Cart items (UX improvement)
            next.splice(idx, 1);
            return next;
        }
        next[idx] = { ...next[idx], qty: nextQty };
        return next;
    });
  };

  const handleUpdateActiveQty = async (idx: number, delta: number) => {
    const baseItems = modifiedItems || (viewingOrder ? enrichOrderDetails(viewingOrder, items).items : []);
    const next = [...baseItems];
    const newQty = (next[idx].quantity || 0) + delta;
    
    if (newQty <= 0) {
        // SECURITY GUARD: Item removal from active order
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

  const handleUpdateOrder = async () => {
    if (!viewingOrder || !modifiedItems) return;
    const payload = modifiedItems.map(it => ({
      menu_item_id: it.menu_item_id,
      quantity: Number(it.quantity || 1),
      price: Number(it.price || it._display_price || 0),
      _snapshot_name: it.snapshot_name || it._snapshot_name || it._display_name,
      note: (it.note || '').trim()
    }));

    await updateLocalOrder(viewingOrder.id, { order_items: payload });
    setViewingOrder(prev => prev ? ({ ...prev, order_items: payload, items: payload }) : prev);
    setModifiedItems(null);
  };

  const handleOpenAddItems = () => {
    if (!viewingOrder) return;
    const { items: enriched } = enrichOrderDetails(viewingOrder, items);
    setCurrentOrderItems(enriched.map((x: any) => ({ ...x, isNew: false })));
    setAddItemsSearch('');
    setIsAddItemsModalOpen(true);
  };

  const handleConfirmAddItems = async () => {
    if (!viewingOrder) return;
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
      setModifiedItems(null); 
      setIsAddItemsModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePayment = async (method: any, shouldPrint: boolean, discountInfo?: any, paymentAmount?: number) => {
    if (!viewingOrder) return;
    setIsProcessingPayment(true);
    try {
      await checkoutSession(viewingOrder.id, String(viewingOrder.table_id || 'Takeaway'), method, discountInfo, paymentAmount);
      if (shouldPrint) {
        // Must fetch fresh or compute fresh to include discount
        const { items: enriched, totalAmount } = enrichOrderDetails(viewingOrder, items);
        // Calculate discount for print
        const subtotal = totalAmount;
        const discountAmount = discountInfo?.amount || 0;
        const finalTotal = Math.max(0, subtotal - discountAmount);
        
        printOrderReceipt({ 
            ...viewingOrder, 
            status: 'Completed', 
            payment_method: method, 
            items: enriched, 
            total_amount: finalTotal, 
            discount_amount: discountAmount,
            subtotal: subtotal
        });
      }
      setShowPaymentModal(false);
      setViewingOrder(null);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCheckoutSubmit = async (tableId: string = 'Takeaway') => {
      setIsProcessing(true);
      const itemsPayload = cart.map(c => ({ 
          menu_item_id: c.item.id, quantity: c.qty, price: Number(c.item.price), 
          _snapshot_name: c.item.name, note: (c.note || '').trim()
      }));

      const activeOrder = orders.find(o => 
        String(o.table_id) === String(tableId) && isOrderActive(o.status)
      );

      if (activeOrder && tableId !== 'Takeaway') {
        await addItemToSession(activeOrder.id, itemsPayload);
      } else {
        const finalTotal = itemsPayload.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        await addLocalOrder({
            table_id: tableId || 'Takeaway', status: 'Pending', total_amount: finalTotal,
            staff_name: currentStaffEmail, user_id: user?.id, guests: tableId === 'Takeaway' ? 1 : 2,
            created_at: new Date().toISOString(), is_offline: true, order_items: itemsPayload
        });
      }
      setCart([]);
      setShowCheckoutModal(false);
      setIsCartSheetOpen(false);
      setIsProcessing(false);
      setCheckoutStep('type-selection');
      setSelectedTableId(null);
  };

  const onConfirmOrderClick = () => {
    if (cart.length > 0) {
        if (settings.quickOrder) {
            // Quick order flow: bypass modal
            // Default to 'Takeaway' or generic 'Counter' if Dine-in is default
            const targetTable = settings.defaultOrderType === 'dine-in' ? 'Counter' : 'Takeaway';
            handleCheckoutSubmit(targetTable);
        } else {
            setShowCheckoutModal(true);
        }
    }
  };

  const openNoteModal = (idx: number, source: 'cart' | 'active' | 'add_items' = 'cart') => {
    let note = "";
    if (source === 'cart') note = cart[idx].note || "";
    else if (source === 'active') {
      const list = modifiedItems || enrichOrderDetails(viewingOrder, items).items;
      note = list[idx].note || "";
    } else if (source === 'add_items') note = currentOrderItems[idx].note || "";
    
    setEditingNoteItem({ idx, currentNote: note, source });
    setNoteInput(note);
    setIsNoteModalOpen(true);
  };

  const saveNote = () => {
    if (editingNoteItem !== null) {
      if (editingNoteItem.source === 'cart') {
        setCart(prev => {
          const next = [...prev];
          next[editingNoteItem.idx] = { ...next[editingNoteItem.idx], note: noteInput };
          return next;
        });
      } else if (editingNoteItem.source === 'active') {
        const list = modifiedItems || enrichOrderDetails(viewingOrder, items).items;
        const nextItems = [...list];
        nextItems[editingNoteItem.idx] = { ...nextItems[editingNoteItem.idx], note: noteInput };
        setModifiedItems(nextItems);
      } else if (editingNoteItem.source === 'add_items') {
        setCurrentOrderItems(prev => {
          const next = [...prev];
          next[editingNoteItem.idx] = { ...next[editingNoteItem.idx], note: noteInput };
          return next;
        });
      }
    }
    setIsNoteModalOpen(false);
  };

  const processedItems = useMemo(() => {
    return (items || []).filter(item => 
      (categoryFilter === 'All' || item.category === categoryFilter) && 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => { 
      if (sortConfig === 'price-asc') return a.price - b.price; 
      if (sortConfig === 'price-desc') return b.price - a.price; 
      return a.name.localeCompare(b.name); 
    });
  }, [items, categoryFilter, searchQuery, sortConfig]);

  const CartList = ({ isSheet = false }) => (
    <div className={`flex flex-col h-full ${isSheet ? 'pb-32' : ''}`}>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-secondary opacity-30 gap-4">
            <ShoppingCart size={48} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest">{t('Cart is empty')}</p>
          </div>
        ) : (
          cart.map((c, idx) => (
            <div 
                key={idx} 
                className="bg-background rounded-xl p-3 border border-border flex gap-3 group animate-in slide-in-from-right-2 duration-200 shadow-sm"
                style={{ borderWidth: 'var(--pos-border-strong)' }}
            >
                <div className="size-12 bg-surface rounded-lg overflow-hidden shrink-0 border border-border">
                  {c.item.image ? <img src={c.item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-secondary/30 bg-border/20"><Utensils size={16}/></div>}
                </div>
                <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col min-w-0">
                          <span className="text-sm font-black text-text-main truncate leading-tight">{c.item.name}</span>
                          {c.note && <span className="text-amber-500 text-[10px] font-bold italic line-clamp-1 mt-0.5">{c.note}</span>}
                      </div>
                      <span className="text-sm font-black text-primary whitespace-nowrap">{formatPrice(c.item.price * c.qty)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center bg-surface rounded-lg border border-border h-8 shadow-inner p-0.5">
                        <button onClick={() => updateCartQty(idx, -1)} className="px-2 hover:bg-border text-secondary h-full flex items-center transition-colors"><Minus size={14}/></button>
                        <span className="text-xs font-black text-text-main px-2 min-w-[24px] text-center">{c.qty}</span>
                        <button onClick={() => updateCartQty(idx, 1)} className="px-2 hover:bg-border text-secondary h-full flex items-center transition-colors"><Plus size={14}/></button>
                      </div>
                      <button 
                        onClick={() => openNoteModal(idx, 'cart')}
                        className={`p-2 rounded-lg border transition-all ${c.note ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-surface border-border text-secondary hover:text-primary'}`}
                      >
                        <StickyNote size={14} />
                      </button>
                    </div>
                </div>
            </div>
          ))
        )}
      </div>

      <div className={`${isSheet ? 'fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(env(safe-area-inset-bottom,0px)+70px)]' : 'relative z-50 p-4'} bg-background/95 backdrop-blur-md border-t border-border shadow-2xl space-y-4`}>
        <div className="flex justify-between items-end">
          <span className="text-xs font-black text-secondary uppercase tracking-widest">{t('Total Amount')}</span>
          <span className="text-2xl font-black text-primary">{formatPrice(cartTotals.amount)}</span>
        </div>
        <div className="flex gap-3">
          <button 
            disabled={cart.length === 0}
            onClick={() => cart.length > 0 && setShowClearCartConfirm(true)}
            className="size-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center active:scale-95 transition-all border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ minHeight: 'var(--pos-btn-h)' }}
          >
            <Trash2 size={24} />
          </button>
          <button 
            disabled={cart.length === 0 || isProcessing}
            onClick={onConfirmOrderClick}
            className="flex-1 h-14 bg-primary text-background font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-95 transition-all text-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ minHeight: 'var(--pos-btn-h)' }}
          >
            <Check size={24} /> {t('Confirm Order')}
          </button>
        </div>
      </div>
    </div>
  );

  // Check RBAC for Menu CRUD
  const canEditMenu = can('menu.crud');

  return (
    <div className="flex h-full w-full bg-background overflow-hidden flex-col lg:flex-row transition-colors relative">
      {qtyModalOpen && pendingAddItem && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-text-main text-lg truncate max-w-[200px]">{pendingAddItem.name}</h3>
                    <button onClick={() => setQtyModalOpen(false)} className="p-2 bg-background border border-border rounded-lg text-secondary">
                        <X size={20} />
                    </button>
                </div>
                
                {/* Standard Numpad UI - Default Interface */}
                <div className="bg-background border border-border rounded-xl px-4 py-3 mb-4 text-right">
                    <span className="text-3xl font-black text-text-main">{qtyValue}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9].map(num => (
                        <button key={num} onClick={() => setQtyValue(prev => prev === '0' ? String(num) : prev + num)} className="h-14 bg-surface border border-border hover:bg-background rounded-xl text-xl font-bold text-text-main shadow-sm active:scale-95 transition-all">{num}</button>
                    ))}
                    <button onClick={() => setQtyValue('0')} className="h-14 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl font-bold flex items-center justify-center"><Trash2 size={24}/></button>
                    <button onClick={() => setQtyValue(prev => prev === '0' ? '0' : prev + '0')} className="h-14 bg-surface border border-border hover:bg-background rounded-xl text-xl font-bold text-text-main shadow-sm active:scale-95 transition-all">0</button>
                    <button onClick={() => setQtyValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0')} className="h-14 bg-surface border border-border hover:bg-background text-secondary rounded-xl font-bold flex items-center justify-center"><Delete size={24}/></button>
                </div>

                <button onClick={handleConfirmQty} className="w-full mt-4 h-14 bg-primary text-background rounded-xl font-bold text-lg hover:bg-primary-hover active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                    <Check size={24}/> {t('Confirm')}
                </button>
            </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-border w-full">
        {/* ... Header ... */}
        <header className="bg-background/95 backdrop-blur z-10 border-b border-border px-4 py-3 lg:px-6 lg:py-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
                <h2 className="text-lg lg:text-2xl font-black text-text-main flex items-center gap-2"><Utensils className="text-primary" /> {t('Menu')}</h2>
                {canEditMenu && (
                  <button 
                    onClick={() => setIsEditMode(!isEditMode)}
                    disabled={!isOnline}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${isEditMode ? 'bg-amber-500 text-white border-amber-600 shadow-lg' : 'bg-surface text-secondary border-border hover:border-primary'}`}
                  >
                    <Settings size={14} className={isEditMode ? 'animate-spin' : ''} />
                    {isEditMode ? t('Thoát') : t('Quản Lý')}
                    {!isOnline && <WifiOff size={12} className="text-red-500" />}
                  </button>
                )}
            </div>
            <div className="flex gap-2">
                 <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
                    <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('Search...')} className="w-full bg-surface text-text-main pl-10 pr-4 py-2 rounded-xl border border-border outline-none text-sm font-medium focus:ring-1 focus:ring-primary shadow-sm"/>
                 </div>
                 <button onClick={() => setSortConfig(prev => prev === 'name' ? 'price-asc' : prev === 'price-asc' ? 'price-desc' : 'name')} className="px-3 rounded-xl bg-surface border border-border text-secondary flex items-center gap-2 shadow-sm"><ArrowDownUp size={16} /></button>
            </div>
             <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                 {['All', 'Coffee', 'Non Coffee', 'Matcha', 'Food'].map(cat => (
                     <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase whitespace-nowrap transition-all border shadow-sm ${categoryFilter === cat ? 'bg-primary text-background border-primary' : 'bg-surface text-secondary border-border'}`}>{t(cat)}</button>
                 ))}
             </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 lg:p-6 custom-scrollbar bg-surface/50 pb-40 lg:pb-6">
            {/* ... Content ... */}
            {loading && items.length === 0 ? (
                <div className="flex h-full items-center justify-center flex-col gap-4">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
            ) : (
                <div 
                    className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                    style={{ gap: 'var(--pos-gap)' }}
                >
                    {/* ... Existing Edit Mode Add Item ... */}
                    {isEditMode && isOnline && canEditMenu && (
                      <div 
                        onClick={() => {
                          setItemForm({ name: '', price: '', category: 'Coffee', image: '', stock: '99', description: '' });
                          setEditingItem(null);
                          setUploadPreview(null);
                          setIsItemModalOpen(true);
                        }}
                        className="group bg-surface border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3 p-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all aspect-[4/3] shadow-sm animate-in fade-in"
                        style={{ borderWidth: 'var(--pos-border-strong)' }}
                      >
                        <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform"><Plus size={20} /></div>
                        <span className="font-black text-[10px] uppercase tracking-widest text-text-main">{t('Add Item')}</span>
                      </div>
                    )}

                    {processedItems.map((item) => {
                        const cartQty = cart.filter(c => c.item.id === item.id).reduce((s, c) => s + c.qty, 0);
                        const activeQty = (modifiedItems || (viewingOrder ? enrichOrderDetails(viewingOrder, items).items : []))
                          .filter(it => String(it.menu_item_id) === String(item.id))
                          .reduce((s, it) => s + (it.quantity || 0), 0);

                        return (
                            <div 
                              key={item.id} 
                              onClick={() => handleMenuItemClick(item)} 
                              className={`group bg-surface rounded-2xl overflow-hidden border border-border hover:border-primary transition-all duration-200 cursor-pointer active:scale-95 flex flex-col relative shadow-sm ${item.stock <= 0 ? 'opacity-60 grayscale cursor-not-allowed' : ''}`}
                              style={{ borderWidth: 'var(--pos-border-strong)' }}
                            >
                                <div className="aspect-[4/3] bg-background/50 relative overflow-hidden">
                                    {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-secondary/20 bg-border/10"><Utensils size={32} /></div>}
                                    {item.stock <= 0 && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-red-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest">Hết hàng</span></div>}
                                    
                                    {(cartQty > 0 || activeQty > 0) && (
                                      <div className={`absolute top-2 right-2 ${activeQty > 0 ? 'bg-amber-500' : 'bg-primary'} text-background size-7 flex items-center justify-center rounded-full font-black text-xs shadow-lg ring-2 ring-background animate-in zoom-in`}>
                                        {activeQty || cartQty}
                                      </div>
                                    )}

                                    {isEditMode && canEditMenu && (
                                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingItem(item);
                                            setItemForm({ 
                                              name: item.name, 
                                              price: item.price.toString(), 
                                              category: item.category, 
                                              image: item.image, 
                                              stock: item.stock.toString(),
                                              description: item.description || '' 
                                            });
                                            setUploadPreview(item.image);
                                            setIsItemModalOpen(true);
                                          }}
                                          className="p-2 bg-white text-black rounded-lg shadow-xl"
                                        >
                                          <Edit size={18} />
                                        </button>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingDelete(item);
                                          }}
                                          className="p-2 bg-white text-red-500 rounded-lg shadow-xl"
                                        >
                                          <Trash2 size={18} />
                                        </button>
                                      </div>
                                    )}
                                </div>
                                <div 
                                    className="p-3 flex flex-col flex-1"
                                    style={{ padding: 'var(--pos-card-pad)' }}
                                >
                                    <h3 className="font-black text-text-main text-xs line-clamp-2 leading-tight mb-2 uppercase tracking-tighter">{item.name}</h3>
                                    <div className="mt-auto flex justify-between items-center">
                                        <span className="text-primary font-black text-sm">{formatPrice(item.price)}</span>
                                        {(!isEditMode || !canEditMenu) && <div className="bg-primary/10 text-primary p-1.5 rounded-lg group-hover:bg-primary group-hover:text-background transition-all"><Plus size={16}/></div>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>

      <div className="hidden lg:flex w-80 xl:w-96 bg-surface border-l border-border flex-col shadow-2xl shrink-0 z-20 h-full overflow-hidden" style={{ borderWidth: 'var(--pos-border-strong)' }}>
          {/* ... Sidebar Tabs ... */}
          <div className="h-16 border-b border-border flex p-1 bg-background shrink-0">
              <button onClick={() => setSidebarTab('cart')} className={`flex-1 flex items-center justify-center gap-2 rounded-lg text-[10px] uppercase font-black transition-all relative ${sidebarTab === 'cart' ? 'bg-surface text-primary shadow-sm' : 'text-secondary'}`}>
                <ShoppingCart size={18} /> {t('Draft')}
                {cartTotals.count > 0 && <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full font-black border-2 border-surface shadow-lg">{cartTotals.count}</span>}
              </button>
              <button onClick={() => setSidebarTab('orders')} className={`flex-1 flex items-center justify-center gap-2 rounded-lg text-[10px] uppercase font-black transition-all relative ${sidebarTab === 'orders' ? 'bg-surface text-primary shadow-sm' : 'text-secondary'}`}>
                <Receipt size={18} /> {t('Selected')}
                {activeOrders.length > 0 && <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full font-black border-2 border-surface shadow-lg">{activeOrders.length}</span>}
              </button>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {sidebarTab === 'cart' ? (
               <CartList isSheet={false} />
            ) : (
              <div className="flex flex-col h-full">
                 {!viewingOrder ? (
                   <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-2">{t('Active Orders')}</p>
                      <ActiveOrdersContent 
                        activeOrders={activeOrders} 
                        tables={tables} 
                        onSelect={handleSelectActiveOrder}
                        t={t} 
                        formatPrice={formatPrice} 
                        viewingOrderId={null}
                        onRequestCancel={handleRequestCancel}
                      />
                   </div>
                 ) : (
                   <div className="flex flex-col h-full bg-background/30">
                      {/* ... Viewing Order Header ... */}
                      <div className="p-4 border-b border-border bg-background/50 flex flex-col gap-4">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <button onClick={() => setViewingOrder(null)} className="p-1 hover:bg-border rounded text-secondary"><ArrowLeft size={16}/></button>
                               <div>
                                  <div className="flex items-center gap-2">
                                    {viewingOrder.table_id === 'Takeaway' ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-tighter">
                                        {getTableLabel(viewingOrder, tables)}
                                      </span>
                                    ) : (
                                      <p className="font-black text-sm uppercase text-text-main">
                                        {getTableLabel(viewingOrder, tables)}
                                      </p>
                                    )}
                                  </div>
                                  <p className="text-[9px] font-bold text-secondary uppercase tracking-tighter">#{viewingOrder.id.slice(-6)}</p>
                               </div>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                               viewingOrder.status === 'Ready' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                               viewingOrder.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                               viewingOrder.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                               'bg-amber-500/10 text-amber-500 border-amber-500/10'
                            }`}>{t(viewingOrder.status)}</span>
                         </div>
                         
                         <div className="bg-surface/50 border border-border rounded-xl p-1">
                            <p className="text-[10px] font-black text-secondary uppercase px-2 py-1">{t('Switch to')}</p>
                            <ActiveOrdersContent 
                              activeOrders={activeOrders} 
                              tables={tables} 
                              onSelect={handleSelectActiveOrder}
                              t={t} 
                              formatPrice={formatPrice} 
                              viewingOrderId={viewingOrder.id}
                              onRequestCancel={handleRequestCancel}
                            />
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                         {(() => {
                           const { items: enriched } = enrichOrderDetails(viewingOrder, items);
                           const displayItems = modifiedItems || enriched;
                           const isActive = isOrderActive(viewingOrder.status);

                           return displayItems.map((it, idx) => (
                             <div 
                                key={it.id || idx} 
                                className="bg-background border border-border rounded-xl p-3 space-y-2"
                                style={{ borderWidth: 'var(--pos-border-strong)' }}
                             >
                                <div className="flex items-start justify-between gap-3">
                                   {isActive && (
                                      <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-lg shrink-0">
                                         <button onClick={() => handleUpdateActiveQty(idx, -1)} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary"><Minus size={10}/></button>
                                         <span className="font-black text-[11px] min-w-[14px] text-center">{it.quantity}</span>
                                         <button onClick={() => handleUpdateActiveQty(idx, 1)} className="size-6 flex items-center justify-center hover:bg-border rounded text-secondary"><Plus size={10}/></button>
                                      </div>
                                   )}
                                   {!isActive && <span className="font-black text-xs text-primary shrink-0">x{it.quantity}</span>}
                                   
                                   <div className="flex-1 min-w-0">
                                      <p className="font-bold text-text-main text-sm whitespace-normal break-words leading-tight">{it._display_name}</p>
                                   </div>
                                   <p className="font-black text-text-main text-[13px] shrink-0">{formatPrice(it._display_price * it.quantity)}</p>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                   {isActive && (
                                     <button 
                                        onClick={() => openNoteModal(idx, 'active')}
                                        className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-[9px] font-black uppercase transition-all ${it.note ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-surface border-border text-secondary'}`}
                                     >
                                        <StickyNote size={10} /> {it.note ? t('Note Added') : t('Add Note')}
                                     </button>
                                   )}
                                </div>
                                {it.note && <p className="text-[10px] font-bold text-amber-600 italic leading-tight p-2 bg-amber-500/5 rounded-lg border border-amber-500/10">{it.note}</p>}
                             </div>
                           ));
                         })()}
                      </div>

                      <div className="p-4 border-t border-border bg-background space-y-4">
                         {(() => {
                            const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(viewingOrder, items);
                            const displayItems = modifiedItems || enriched;
                            const currentTotal = displayItems.reduce((s, it) => s + (it._display_price * it.quantity), 0);
                            const isActive = isOrderActive(viewingOrder.status);
                            const hasChanges = modifiedItems !== null && JSON.stringify(modifiedItems) !== JSON.stringify(enriched);

                            // Calculate final total including discount for display
                            const discountAmount = viewingOrder.discount_amount || 0;
                            const finalDisplayTotal = Math.max(0, currentTotal - discountAmount);

                            return (
                               <>
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
                                 
                                 {isActive ? (
                                   <div className="grid grid-cols-1 gap-2">
                                      {hasChanges ? (
                                        <button 
                                          onClick={handleUpdateOrder}
                                          className="w-full h-12 bg-emerald-500 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                                          style={{ minHeight: 'var(--pos-btn-h)' }}
                                        >
                                          <RefreshCw size={18} /> {t('Update Order')}
                                        </button>
                                      ) : (
                                        <div className="flex gap-2">
                                          <button onClick={handleOpenAddItems} className="flex-1 h-12 bg-surface border-2 border-primary/20 text-primary rounded-xl font-black flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-95 transition-all" style={{ minHeight: 'var(--pos-btn-h)' }}>
                                            <Plus size={18}/> {t('Batch Add')}
                                          </button>
                                          <button onClick={() => setShowPaymentModal(true)} className="flex-1 h-12 bg-primary text-background rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all" style={{ minHeight: 'var(--pos-btn-h)' }}>
                                            <CreditCard size={18}/> {t('Pay')}
                                          </button>
                                        </div>
                                      )}
                                   </div>
                                 ) : viewingOrder.status === 'Completed' ? (
                                   <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                                      <p className="text-emerald-500 font-bold text-xs uppercase tracking-widest">{t('Order Completed')}</p>
                                      <button 
                                        onClick={() => guardSensitive('reprint_receipt', () => printOrderReceipt({ ...viewingOrder, items: enriched }))}
                                        className="mt-3 w-full py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-sm flex items-center justify-center gap-2"
                                        style={{ minHeight: 'var(--pos-btn-h)' }}
                                      >
                                        <Printer size={14}/> {t('Reprint Receipt')}
                                      </button>
                                   </div>
                                 ) : (
                                   <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                                      <p className="text-red-500 font-bold text-xs uppercase tracking-widest">{t('Order Cancelled')}</p>
                                   </div>
                                 )}
                               </>
                            );
                         })()}
                      </div>
                   </div>
                 )}
              </div>
            )}
          </div>
      </div>

      {/* Modals & Dialogs */}
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

      {showClearCartConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-lg">{t('Clear Cart?')}</h3>
            </div>
            <p className="text-sm text-secondary mb-6">{t('Are you sure you want to remove all items?')}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearCartConfirm(false)} className="flex-1 py-3 border border-border rounded-xl font-bold text-secondary hover:bg-border transition-colors">{t('Cancel')}</button>
              <button onClick={() => { setCart([]); setShowClearCartConfirm(false); }} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">{t('Clear All')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal (Create/Edit) */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-3xl w-full max-w-md shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-text-main text-xl">{editingItem ? t('Edit Item') : t('New Menu Item')}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="p-2 hover:bg-border rounded-full text-secondary transition-colors"><X size={24}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 pr-2">
              {/* Image Input Section */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <div className="size-32 rounded-2xl border-2 border-dashed border-border flex items-center justify-center relative overflow-hidden group hover:border-primary transition-colors cursor-pointer bg-background" onClick={() => fileInputRef.current?.click()}>
                    {uploadPreview || itemForm.image ? (
                      <img src={uploadPreview || itemForm.image} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-secondary group-hover:text-primary">
                        <Image size={32} />
                        <span className="text-[10px] font-bold uppercase">{t('Upload')}</span>
                      </div>
                    )}
                    {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                </div>
                
                {/* URL Input */}
                <div className="relative">
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"><LinkIcon size={14}/></div>
                   <input 
                      type="text" 
                      placeholder="Or paste image URL..." 
                      className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-text-main focus:ring-1 focus:ring-primary outline-none transition-all"
                      value={itemForm.image}
                      onChange={(e) => {
                          const val = e.target.value;
                          setItemForm(prev => ({...prev, image: val}));
                          setUploadPreview(val);
                      }}
                   />
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-secondary uppercase ml-1">{t('Name')}</label>
                  <input value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-3 font-bold text-text-main focus:ring-2 focus:ring-primary/50 outline-none transition-all" placeholder="E.g. Cappuccino" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-secondary uppercase ml-1">{t('Price')}</label>
                    <div className="relative">
                      <input type="number" value={itemForm.price} onChange={e => setItemForm({...itemForm, price: e.target.value})} className="w-full bg-background border border-border rounded-xl pl-4 pr-12 py-3 font-bold text-text-main focus:ring-2 focus:ring-primary/50 outline-none transition-all" placeholder="0" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary">VND</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-secondary uppercase ml-1">{t('Category')}</label>
                    <select value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-3 font-bold text-text-main focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none">
                      {['Coffee', 'Non Coffee', 'Matcha', 'Food'].map(c => <option key={c} value={c}>{t(c)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-secondary uppercase ml-1">{t('Manual Stock')}</label>
                   <input type="number" value={itemForm.stock} onChange={e => setItemForm({...itemForm, stock: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-3 font-bold text-text-main focus:ring-2 focus:ring-primary/50 outline-none transition-all" />
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-secondary uppercase ml-1">{t('Description')}</label>
                   <textarea value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-3 font-medium text-text-main focus:ring-2 focus:ring-primary/50 outline-none transition-all min-h-[100px]" placeholder={t('Optional description...')} />
                </div>
              </div>
            </div>

            <div className="pt-6 mt-2 border-t border-border flex gap-3">
              <button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-3.5 border border-border rounded-xl font-bold text-secondary hover:bg-background transition-colors">{t('Cancel')}</button>
              <button onClick={handleSaveItem} disabled={!itemForm.name || !itemForm.price || isUploading} className="flex-1 py-3.5 bg-primary text-background rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isUploading ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddItemsModalOpen && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in slide-in-from-bottom duration-300">
           {/* Add Items Modal Implementation */}
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
              {/* Similar implementation as Main Menu add items */}
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
                  {items.filter(i => i.name.toLowerCase().includes(addItemsSearch.toLowerCase())).map((item: any) => (
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
                {/* ... (Existing Right Panel for Add Items) ... */}
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
                            setEditingNoteItem({ idx, currentNote: it.note || '', source: 'add_items' });
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

      {/* Other Modals (Checkout, Item Edit, etc) same as before */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-5 border-b border-border bg-background flex justify-between items-center">
                 <h3 className="font-bold text-lg">{t('Select Order Type')}</h3>
                 <button onClick={() => setShowCheckoutModal(false)}><X size={20} className="text-secondary"/></button>
              </div>
              
              <div className="p-5 overflow-y-auto">
                 {checkoutStep === 'type-selection' ? (
                    <div className="grid grid-cols-2 gap-4">
                       <button onClick={() => setCheckoutStep('table-selection')} className="flex flex-col items-center justify-center p-6 bg-surface border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl gap-3 transition-all group">
                          <div className="p-3 bg-primary/10 rounded-full text-primary group-hover:scale-110 transition-transform"><Armchair size={32}/></div>
                          <span className="font-bold text-lg">{t('Dine-in')}</span>
                       </button>
                       <button onClick={() => handleCheckoutSubmit('Takeaway')} className="flex flex-col items-center justify-center p-6 bg-surface border-2 border-border hover:border-amber-500 hover:bg-amber-500/5 rounded-2xl gap-3 transition-all group">
                          <div className="p-3 bg-amber-500/10 rounded-full text-amber-500 group-hover:scale-110 transition-transform"><ShoppingBag size={32}/></div>
                          <span className="font-bold text-lg">{t('Takeaway')}</span>
                       </button>
                    </div>
                 ) : (
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 mb-2">
                          <button onClick={() => setCheckoutStep('type-selection')} className="p-1 hover:bg-border rounded text-secondary"><ArrowLeft size={20}/></button>
                          <span className="font-bold">{t('Select table')}</span>
                       </div>
                       <div className="grid grid-cols-3 gap-3">
                          {availableTables.map(t => (
                             <button 
                                key={t.id} 
                                onClick={() => { setSelectedTableId(t.id); handleCheckoutSubmit(t.id); }}
                                className={`p-3 border rounded-xl font-bold transition-all ${selectedTableId === t.id ? 'bg-primary text-background border-primary' : 'bg-surface border-border hover:border-primary/50'}`}
                             >
                                {t.label}
                             </button>
                          ))}
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {showPaymentModal && viewingOrder && (() => {
         const { items: enriched, totalAmount: subtotal } = enrichOrderDetails(viewingOrder, items);
         return (
           <PaymentModal 
             isOpen={showPaymentModal} 
             onClose={() => setShowPaymentModal(false)} 
             onConfirm={handlePayment} 
             onPrint={() => {
                const { items: enriched } = enrichOrderDetails(viewingOrder, items);
                printOrderReceipt({ ...viewingOrder, items: enriched });
             }} 
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

      {/* Menu Item Delete Confirmation */}
      <ConfirmModal
        isOpen={!!pendingDelete}
        title={t('Delete Item')}
        message={t('Are you sure you want to delete this item?')}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDeleteItem}
        isDanger={true}
        confirmText={t('Delete')}
      />
    </div>
  );
};
