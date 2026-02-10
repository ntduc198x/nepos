
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Loader2, Ban, Save, Layout, Type, Trash2, Square, Circle, RectangleHorizontal, 
  Users, Minus, Plus, Maximize2, Armchair, X, ArrowRight, ArrowRightLeft, Search, 
  Utensils, ShoppingBag, StickyNote, ChevronRight, Check, RefreshCw, CreditCard, ArrowLeft,
  ZoomIn, ZoomOut, Move, Focus, GripHorizontal, MapPin
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTheme } from '../ThemeContext';
import { useSettingsContext } from '../context/SettingsContext';
import { TableData, MenuItem, OrderItem } from '../types';
import { useOrderOperations } from '../hooks/useOrderOperations';
import { TransferModal } from '../components/TransferModal';
import { PaymentModal } from '../components/PaymentModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { enrichOrderDetails, getPaidAmount } from '../utils/orderHelpers';
import { printOrderReceipt, generateReceiptHTML, isSandboxed } from '../services/printService';
import { useCurrency } from '../CurrencyContext';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext'; 
import { usePrintPreview } from '../context/PrintPreviewContext';

// --- CONSTANTS ---
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3.0;
const DEFAULT_ZOOM = 0.8; 

export const FloorPlan: React.FC = () => {
  const { tables, orders, menuItems, addLocalOrder, addItemToSession, checkoutSession, updateLocalOrder, loading, moveTable, mergeOrders, saveTableLayout, deleteTable: deleteTableContext } = useData();
  const { performCancelOrder } = useOrderOperations();
  const { t } = useTheme();
  const { settings, can, guardSensitive } = useSettingsContext();
  const { formatPrice } = useCurrency();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { openPreview } = usePrintPreview();

  // --- STATE ---
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

  const [pendingDeleteTableId, setPendingDeleteTableId] = useState<string | null>(null);

  const [localTables, setLocalTables] = useState<TableData[]>([]);
  
  // --- PAN/ZOOM STATE ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: DEFAULT_ZOOM });
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- POINTER EVENT STATE ---
  const [pointers, setPointers] = useState<Map<number, { x: number, y: number }>>(new Map());
  const initialPinchDistance = useRef<number | null>(null);
  const initialScale = useRef<number>(1);
  const isDragging = useRef(false);

  // Sync tables
  useEffect(() => { if (!isEditMode && tables) setLocalTables(tables as TableData[]); }, [tables, isEditMode]);

  // Filter out Takeaway tables for display
  const displayTables = useMemo(() => {
    return localTables.filter(t => t.id !== 'Takeaway' && t.label !== 'Takeaway');
  }, [localTables]);

  const filteredTables = useMemo(() => {
    if(!searchQuery) return [];
    return displayTables.filter(t => t.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, displayTables]);

  // --- PAN/ZOOM LOGIC ---
  const getDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isEditMode) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    
    setPointers(prev => {
        const next = new Map(prev);
        next.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (next.size === 2) {
            const points = Array.from(next.values());
            initialPinchDistance.current = getDistance(points[0], points[1]);
            initialScale.current = transform.scale;
        }
        return next;
    });
    isDragging.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isEditMode) return;
    if (!pointers.has(e.pointerId)) return;

    // NOTE: Panning (dragging) is disabled on desktop as requested.
    // We only track dragging for multi-touch Zoom (Pinch).
    
    setPointers(prev => {
        const next = new Map(prev);
        const prevPoint = next.get(e.pointerId);
        if (!prevPoint) return prev;

        next.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (next.size === 1) {
            // PAN DISABLED: Do NOT update x/y and do NOT set isDragging to true.
            // This ensures clicks are registered correctly even if mouse moves slightly.
        } else if (next.size === 2 && initialPinchDistance.current) {
            // ZOOM ENABLED
            isDragging.current = true;
            const points = Array.from(next.values());
            const currentDist = getDistance(points[0], points[1]);
            const scaleFactor = currentDist / initialPinchDistance.current;
            const nextScale = Math.min(Math.max(MIN_ZOOM, initialScale.current * scaleFactor), MAX_ZOOM);
            setTransform(t => ({ ...t, scale: nextScale }));
        }
        return next;
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isEditMode) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    setPointers(prev => {
        const next = new Map(prev);
        next.delete(e.pointerId);
        if (next.size < 2) initialPinchDistance.current = null;
        return next;
    });
    setTimeout(() => { isDragging.current = false; }, 50);
  };

  // --- BACKGROUND CLICK HANDLER ---
  const handleBackgroundClick = () => {
    // Only deselect if we are NOT in edit mode and NOT currently dragging/zooming
    if (!isEditMode && !isDragging.current) {
        setSelectedTableId(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isEditMode) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newScale = Math.min(Math.max(MIN_ZOOM, transform.scale + delta), MAX_ZOOM);
      setTransform(prev => ({ ...prev, scale: newScale }));
    } 
    // Pan via Wheel Disabled
  };

  const resetView = () => setTransform({ x: 0, y: 0, scale: DEFAULT_ZOOM });
  const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale + 0.2, MAX_ZOOM) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale - 0.2, MIN_ZOOM) }));

  const focusTable = (t: TableData) => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    
    const targetScale = 1.2;
    const newX = (containerW / 2) - ((t.x / 100) * containerW * targetScale);
    const newY = (containerH / 2) - ((t.y / 100) * containerH * targetScale);

    setTransform({ x: newX, y: newY, scale: targetScale });
    setSelectedTableId(t.id);
    setShowSearch(false);
    setSearchQuery('');
  };

  // --- DESKTOP FLOATING POSITION LOGIC ---
  const getFloatingPanelStyle = () => {
    if (!selectedTableId || !containerRef.current) return {};
    const activeTable = localTables.find(t => t.id === selectedTableId);
    if (!activeTable) return {};

    // Base position on Percentage
    const isRightSide = activeTable.x > 50;
    const isBottomSide = activeTable.y > 60;

    // Calculate Screen Coordinates based on Transform + Percentage
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    
    // Position of Table Top-Left relative to Container
    const tableScreenX = transform.x + (activeTable.x / 100) * containerW * transform.scale;
    const tableScreenY = transform.y + (activeTable.y / 100) * containerH * transform.scale;
    
    // Scaled dimensions of the table
    const tableWidthPx = (activeTable.width || 100) * transform.scale;
    const tableHeightPx = (activeTable.height || 100) * transform.scale;

    return {
        position: 'absolute' as 'absolute',
        // Flip logic to keep it next to table
        left: isRightSide ? 'auto' : `${tableScreenX + tableWidthPx + 10}px`,
        right: isRightSide ? `${containerW - tableScreenX + 10}px` : 'auto',
        top: isBottomSide ? 'auto' : `${tableScreenY}px`,
        bottom: isBottomSide ? `${containerH - tableScreenY - tableHeightPx}px` : 'auto',
        // Reduced maxHeight to ensure bottom margin availability
        maxHeight: '50vh',
        zIndex: 50
    };
  };

  // --- CRUD Functions ---
  const updateTable = (id: string, updates: Partial<TableData>) => {
    setLocalTables(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setHasUnsavedChanges(true);
  };

  const handleTableClick = (e: React.MouseEvent | React.TouchEvent, table: TableData) => {
      e.stopPropagation(); // Stop propagation to prevent background click
      // Only block if actually dragging (which is disabled for pan now)
      if (isDragging.current) return;
      if (!isEditMode) setSelectedTableId(table.id);
  };

  const handleSaveLayout = async () => {
    setIsSaving(true);
    try {
        await saveTableLayout(localTables);
        setIsEditMode(false);
        setHasUnsavedChanges(false);
        showToast(t('Saved'), 'success');
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleAddTable = () => {
    const newId = crypto.randomUUID();
    const newTable: TableData = {
      id: newId, label: `T-${localTables.length + 1}`,
      x: 45, y: 45, width: 120, height: 120, shape: 'round', seats: 4, status: 'Available'
    };
    setLocalTables([...localTables, newTable]);
    setHasUnsavedChanges(true);
    setEditingTableId(newId);
  };

  // --- DRAG HANDLERS (Edit Mode) ---
  const handleMouseDownDrag = (e: React.MouseEvent, table: TableData) => {
    if (!isEditMode) {
        // Nếu không edit mode, chỉ select bàn
        if (selectedTableId !== table.id) setSelectedTableId(table.id);
        return;
    }

    e.preventDefault();
    e.stopPropagation();
    setEditingTableId(table.id);

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = table.x || 0;
    const initialY = table.y || 0;

    const onMouseMove = (ev: MouseEvent) => {
        const deltaX = ev.clientX - startX;
        const deltaY = ev.clientY - startY;

        // Convert pixels to percentage (không cần scale)
        const deltaXPercent = (deltaX / containerRect.width) * 100;
        const deltaYPercent = (deltaY / containerRect.height) * 100;

        const newX = Math.max(0, Math.min(100, initialX + deltaXPercent));
        const newY = Math.max(0, Math.min(100, initialY + deltaYPercent));

        setLocalTables(prev => prev.map(t => 
            t.id === table.id ? { ...t, x: newX, y: newY } : t
        ));
        setHasUnsavedChanges(true);
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleMouseDownResize = (e: React.MouseEvent, table: TableData, corner: 'se' | 'sw' | 'ne' | 'nw') => {
      if (!isEditMode) return;
      e.stopPropagation();
      e.preventDefault();
      
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWidth = table.width || 100;
      const initialHeight = table.height || 100;
      const initialX = table.x || 0;
      const initialY = table.y || 0;

      const onMouseMove = (ev: MouseEvent) => {
          const deltaX = ev.clientX - startX;
          const deltaY = ev.clientY - startY;

          let newWidth = initialWidth;
          let newHeight = initialHeight;
          let newX = initialX;
          let newY = initialY;

          // Tính toán dựa trên góc resize
          if (corner === 'se') {
              // Southeast: tăng width/height, giữ nguyên position
              newWidth = Math.max(60, initialWidth + deltaX);
              newHeight = Math.max(60, initialHeight + deltaY);
          } else if (corner === 'sw') {
              // Southwest: tăng height, thay đổi x và width
              const widthDelta = -deltaX;
              newWidth = Math.max(60, initialWidth + widthDelta);
              const deltaXPercent = (-deltaX / containerRect.width) * 100;
              newX = Math.max(0, Math.min(100, initialX + deltaXPercent));
              newHeight = Math.max(60, initialHeight + deltaY);
          } else if (corner === 'ne') {
              // Northeast: tăng width, thay đổi y và height
              newWidth = Math.max(60, initialWidth + deltaX);
              const heightDelta = -deltaY;
              newHeight = Math.max(60, initialHeight + heightDelta);
              const deltaYPercent = (-deltaY / containerRect.height) * 100;
              newY = Math.max(0, Math.min(100, initialY + deltaYPercent));
          } else if (corner === 'nw') {
              // Northwest: thay đổi cả x, y, width, height
              const widthDelta = -deltaX;
              const heightDelta = -deltaY;
              newWidth = Math.max(60, initialWidth + widthDelta);
              newHeight = Math.max(60, initialHeight + heightDelta);
              const deltaXPercent = (-deltaX / containerRect.width) * 100;
              const deltaYPercent = (-deltaY / containerRect.height) * 100;
              newX = Math.max(0, Math.min(100, initialX + deltaXPercent));
              newY = Math.max(0, Math.min(100, initialY + deltaYPercent));
          }

          setLocalTables(prev => prev.map(t => 
              t.id === table.id 
                  ? { ...t, width: newWidth, height: newHeight, x: newX, y: newY } 
                  : t
          ));
          setHasUnsavedChanges(true);
      };

      const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
  };

  const activeTable = (tables || []).find(t => t.id === selectedTableId) as TableData | undefined;
  
  // --- ORDER LOGIC WRAPPERS ---
  const handleUpdateItemQty = async (idx: number, delta: number, currentList: OrderItem[]) => {
      const next = [...currentList];
      const newQty = (next[idx].quantity || 0) + delta;
      
      if (newQty <= 0) {
          // SECURITY GUARD: Item removal from active order (giống Menu)
          const guardRes = await guardSensitive('cancel_item', () => {
              next.splice(idx, 1);
              setModifiedItems(next);
          }, {
              tableId: selectedTableId,
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
  
  const openNoteModal = (idx: number, source: 'cart' | 'active' | 'add_items') => {
      const activeOrder = orders.find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
      if (source === 'active' && activeOrder) {
          const { items: enriched } = enrichOrderDetails(activeOrder, menuItems);
          const baseList = modifiedItems || enriched;
          const currentNote = baseList[idx]?.note || '';
          setNoteInput(currentNote);
          setEditingNoteItem({ idx, currentNote, source });
          setIsNoteModalOpen(true);
      }
  };
  const handleUpdateOrder = async (order: any) => {
      if (!modifiedItems) return;
      const payload = modifiedItems.map(it => ({
          menu_item_id: it.menu_item_id, quantity: Number(it.quantity || 1), price: Number(it.price || 0),
          _snapshot_name: it.snapshot_name, note: (it.note || '').trim()
      }));
      await updateLocalOrder(String(order.id), { order_items: payload });
      setModifiedItems(null);
  };
  const filteredItemsForAdd = useMemo(() => menuItems.filter(i => i.name.toLowerCase().includes(addItemsSearch.toLowerCase())), [menuItems, addItemsSearch]);

  const handleSelectItemToAdd = (item: MenuItem) => {
    const existingIdx = currentOrderItems.findIndex((i: any) => String(i.menu_item_id) === String(item.id) && i.isNew);
    if (existingIdx > -1) {
       const next = [...currentOrderItems];
       next[existingIdx] = { ...next[existingIdx], quantity: (next[existingIdx].quantity || 0) + 1 };
       setCurrentOrderItems(next);
    } else {
       setCurrentOrderItems([...currentOrderItems, {
          menu_item_id: item.id,
          quantity: 1,
          price: item.price,
          _display_name: item.name,
          snapshot_name: item.name,
          isNew: true
       } as any]);
    }
  };

  const handleConfirmAddItems = async () => {
    if (!selectedTableId) return;
    const newItemsOnly = currentOrderItems.filter((i: any) => i.isNew).map((i: any) => ({
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      price: i.price,
      _snapshot_name: i.snapshot_name || i._display_name,
      note: (i.note || '').trim()
    }));

    if (newItemsOnly.length === 0) {
      setIsAddItemsModalOpen(false);
      return;
    }

    const activeOrder = orders.find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));

    try {
      if (activeOrder) {
        await addItemToSession(activeOrder.id, newItemsOnly);
      } else {
        const total = newItemsOnly.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        await addLocalOrder({
            table_id: selectedTableId,
            status: 'Pending',
            total_amount: total,
            guests: activeTable?.seats || 2,
            order_items: newItemsOnly
        });
        showToast(t('Table Opened Successfully'), 'success');
      }
      setIsAddItemsModalOpen(false);
      setCurrentOrderItems([]);
    } catch (e) {
      console.error(e);
      showToast(t('Failed to Save Order'), 'error');
    }
  };

  const saveNote = () => {
    if (!editingNoteItem) return;
    
    if (editingNoteItem.source === 'add_items') {
        setCurrentOrderItems(prev => {
            const next = [...prev];
            if (next[editingNoteItem!.idx]) {
                next[editingNoteItem!.idx] = { ...next[editingNoteItem!.idx], note: noteInput };
            }
            return next;
        });
    } else if (editingNoteItem.source === 'active') {
        const activeOrder = orders.find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
        if (activeOrder) {
             const { items: enriched } = enrichOrderDetails(activeOrder, menuItems); 
             const baseList = modifiedItems || enriched;
             const next = [...baseList];
             if (next[editingNoteItem.idx]) {
                 next[editingNoteItem.idx] = { ...next[editingNoteItem.idx], note: noteInput };
                 setModifiedItems(next);
             }
        }
    }
    setIsNoteModalOpen(false);
  };

  const handleTransferConfirm = async (targetId: string, mode: 'move' | 'merge') => {
      if (!selectedTableId) return;
      setIsSubmitting(true);
      try {
          if (mode === 'move') {
              await moveTable(selectedTableId, targetId);
          } else {
              await mergeOrders(selectedTableId, targetId);
          }
          setShowTransferModal(false);
          setSelectedTableId(null);
      } catch (e) {
          console.error(e);
          showToast(t('Error'), 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleConfirmDelete = async () => {
      if (!pendingDeleteTableId) return;
      
      // Kiểm tra xem bàn có order đang active không
      const activeOrder = (orders || []).find(
          o => String(o.table_id) === String(pendingDeleteTableId) && 
          ['Pending', 'Cooking', 'Ready'].includes(o.status)
      );
      
      if (activeOrder) {
          alert(t('Cannot delete table with active order'));
          setPendingDeleteTableId(null);
          return;
      }
      
      try {
          // Xóa từ localTables ngay lập tức để UI cập nhật
          setLocalTables(prev => prev.filter(t => t.id !== pendingDeleteTableId));
          
          // Sau đó xóa từ database
          await deleteTableContext(pendingDeleteTableId);
          
          setPendingDeleteTableId(null);
          setEditingTableId(null);
          setHasUnsavedChanges(true); // Đánh dấu có thay đổi cần lưu
          showToast(t('Table deleted'), 'success');
      } catch (e) {
          console.error('Error deleting table:', e);
          showToast(t('Error deleting table'), 'error');
      }
  };
  
  // --- RENDER CONTENT ---
  const renderTableDetailContent = () => {
    const active = (orders || []).find(o => String(o.table_id) === String(selectedTableId) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
    
    // EMPTY STATE
    if (!active) {
        return (
            <div className="flex flex-col h-full p-3">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="size-10 shrink-0 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <Armchair size={20} />
                        </div>
                        <div className="overflow-hidden">
                            <h3 className="text-lg font-black text-text-main truncate leading-none mb-1">{activeTable?.label}</h3>
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
                    onClick={() => { setCurrentOrderItems([]); setIsAddItemsModalOpen(true); }} 
                    className="w-full h-11 bg-primary text-background rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-xs mt-auto"
                >
                    <Plus size={16} /> {t('Open Table')}
                </button>
            </div>
        );
    }

    // ACTIVE ORDER STATE
    const { items: enriched } = enrichOrderDetails(active, menuItems); 
    const itemsToDisplay = modifiedItems || enriched; 
    const currentTotal = itemsToDisplay.reduce((acc: number, it: OrderItem) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0); 
    const hasChanges = modifiedItems !== null && JSON.stringify(modifiedItems) !== JSON.stringify(enriched);
    const discountAmount = active.discount_amount || 0;
    const finalDisplayTotal = Math.max(0, currentTotal - discountAmount);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header: Compact Padding */}
            <div className="p-3 border-b border-border bg-background/50 backdrop-blur shrink-0 flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <div className="size-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shadow-sm"><Armchair size={18} /></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black leading-tight text-text-main">{activeTable?.label}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            <p className="text-[9px] text-secondary uppercase font-bold tracking-[0.1em]">{t('In Use')}</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => setShowTransferModal(true)} className="p-1.5 text-secondary hover:text-primary bg-surface border border-border rounded-lg transition-all"><ArrowRightLeft size={16}/></button>
                    <button onClick={() => performCancelOrder(active, () => setSelectedTableId(null))} className="p-1.5 text-secondary hover:text-red-500 bg-surface border border-border rounded-lg transition-all"><Trash2 size={16}/></button>
                    <button onClick={() => setSelectedTableId(null)} className="p-1.5 hover:bg-border/50 rounded-lg text-secondary transition-all"><X size={16}/></button>
                </div>
            </div>

            {/* List: Reduced Padding & Gap */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-1.5">
                {itemsToDisplay.map((it: any, idx: number) => (
                    <div key={idx} className="flex flex-col p-2.5 bg-surface border border-border rounded-xl group transition-all">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="flex items-center gap-1 bg-background border border-border p-0.5 rounded-lg">
                                    <button onClick={() => handleUpdateItemQty(idx, -1, itemsToDisplay)} className="size-5 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-red-500"><Minus size={10}/></button>
                                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-[10px] min-w-[12px] text-center">{it.quantity}</span>
                                    <button onClick={() => handleUpdateItemQty(idx, 1, itemsToDisplay)} className="size-5 flex items-center justify-center hover:bg-border rounded text-secondary hover:text-primary"><Plus size={10}/></button>
                                </div>
                                <p className="min-w-0 text-[12px] font-bold text-text-main truncate leading-tight tracking-tight">{it._display_name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 text-[11px] font-black text-text-main">{formatPrice(it._display_price * it.quantity)}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openNoteModal(idx, 'active'); }}
                                    className={`shrink-0 p-1 rounded-lg border transition-all
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
                            <div className="flex items-start gap-1.5 mt-2 p-1.5 bg-amber-500/5 rounded-lg border border-amber-500/10">
                                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 italic leading-snug line-clamp-2">{it.note}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer: Compact, always visible */}
            <div className="p-3 border-t border-border bg-background/95 backdrop-blur shrink-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-3">
                <div className="flex justify-between items-end border-t border-dashed border-border/60 pt-2 mb-2">
                    <span className="text-[10px] font-black text-secondary uppercase tracking-widest">{t('Total Balance')}</span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-sm">{formatPrice(finalDisplayTotal)}</span>
                </div>
                <div className="flex flex-col gap-2">
                    {hasChanges ? (
                        <button onClick={() => handleUpdateOrder(active)} className="w-full h-10 bg-emerald-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"><RefreshCw size={14} /> {t('Update Order')}</button>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => { setCurrentOrderItems(enriched.map((x: any) => ({ ...x, isNew: false }))); setIsAddItemsModalOpen(true); }} className="flex-1 h-10 bg-surface border border-border rounded-xl font-black text-[10px] flex items-center justify-center gap-1.5 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-text-main shadow-sm"><Plus size={14} className="text-emerald-500" /> {t('Add Items')}</button>
                            <button onClick={() => setShowPaymentModal(true)} className="flex-1 h-10 bg-primary text-background rounded-xl font-black text-[10px] flex items-center justify-center gap-1.5 shadow-lg shadow-primary/20 hover:brightness-105 transition-all"><CreditCard size={14} /> {t('Pay')}</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background transition-colors overflow-hidden relative">
      
      {/* --- HEADER --- */}
      <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-background/95 backdrop-blur shrink-0 z-40 gap-3">
        <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-text-main text-lg lg:text-xl font-bold truncate">{t('Main Hall')}</h2>
            {isEditMode ? 
                <div className="hidden lg:flex items-center gap-2 text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20"><span className="text-xs font-bold uppercase">{t('Editor Mode')}</span></div> : 
                <div className="hidden lg:flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20"><span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="text-xs font-bold uppercase">{t('Live')}</span></div>
            }
        </div>

        {/* Mobile/Tablet Search Toggle */}
        <div className="flex lg:hidden flex-1 justify-end gap-2">
            {showSearch ? (
                <div className="flex-1 flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                    <input 
                        autoFocus
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Tìm bàn..."
                        className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
                        onBlur={() => !searchQuery && setShowSearch(false)}
                    />
                    <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}><X size={20} className="text-secondary" /></button>
                </div>
            ) : (
                <>
                    <button onClick={() => setShowSearch(true)} className="p-2 rounded-xl bg-surface border border-border text-secondary hover:text-primary"><Search size={18} /></button>
                    <button onClick={resetView} className="p-2 rounded-xl bg-surface border border-border text-secondary hover:text-primary"><RefreshCw size={18} /></button>
                </>
            )}
        </div>

        {/* Desktop Toolbar */}
        <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center bg-surface border border-border rounded-xl p-1 gap-1">
                <button onClick={zoomOut} className="p-2 hover:bg-background rounded-lg text-secondary hover:text-text-main transition-colors"><ZoomOut size={16}/></button>
                <button onClick={resetView} className="p-2 hover:bg-background rounded-lg text-secondary hover:text-text-main transition-colors font-bold text-xs w-12">{Math.round(transform.scale * 100)}%</button>
                <button onClick={zoomIn} className="p-2 hover:bg-background rounded-lg text-secondary hover:text-text-main transition-colors"><ZoomIn size={16}/></button>
            </div>
            
            {can('table.edit_layout') && (
                <div className="flex gap-2 ml-2">
                    {isEditMode && <button onClick={handleAddTable} className="h-10 px-4 rounded-xl text-sm font-bold bg-surface border border-border text-text-main hover:border-primary flex items-center gap-2 transition-all shadow-sm"><Plus size={16} /> {t('Add Table')}</button>}
                    <button onClick={isEditMode ? handleSaveLayout : () => setIsEditMode(true)} disabled={isSaving} className={`h-10 px-4 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isEditMode ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'bg-surface border border-border text-text-main hover:border-primary'}`}>{isEditMode ? (isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>) : <Layout size={16}/>}{isEditMode ? (hasUnsavedChanges ? t('Save Changes') : t('Done')) : t('Edit Layout')}</button>
                </div>
            )}
        </div>
      </header>

      {/* --- SEARCH DROPDOWN (Mobile/Tablet) --- */}
      {showSearch && searchQuery && (
          <div className="absolute top-14 left-4 right-4 z-[60] bg-surface border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto">
              {filteredTables.length > 0 ? (
                  filteredTables.map(t => (
                      <button 
                        key={t.id} 
                        onClick={() => { setSelectedTableId(t.id); setShowSearch(false); }}
                        className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-background flex justify-between items-center"
                      >
                          <span className="font-bold text-text-main">{t.label}</span>
                          {t.status === 'Occupied' && <div className="size-2 rounded-full bg-emerald-500" />}
                      </button>
                  ))
              ) : <div className="p-4 text-center text-secondary text-sm">Không tìm thấy bàn</div>}
          </div>
      )}

      <div className="flex-1 relative overflow-hidden bg-background">
        
        {/* --- MOBILE/TABLET GRID VIEW (No Pan/Zoom) --- */}
        {/* Visible below lg breakpoint */}
        <div className="lg:hidden h-full overflow-y-auto p-4 custom-scrollbar pb-24">
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {displayTables.filter(t => !searchQuery || t.label.toLowerCase().includes(searchQuery.toLowerCase())).map(table => {
                  const activeOrder = (orders || []).find(o => String(o.table_id) === String(table.id) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
                  const isOccupied = !!activeOrder; 
                  return (
                    <div 
                      key={table.id}
                      onClick={() => setSelectedTableId(table.id)}
                      className={`relative aspect-[4/3] rounded-2xl flex flex-col items-center justify-center border-2 transition-all active:scale-95 shadow-sm
                        ${isOccupied ? 'bg-background border-primary text-primary shadow-md' : 'bg-surface border-dashed border-border text-secondary'}
                        ${selectedTableId === table.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                      `}
                    >
                       <span className="text-lg font-black tracking-tight">{table.label}</span>
                       <div className="flex items-center gap-1 mt-1 text-[10px] font-bold opacity-70">
                          <Users size={12}/> {table.seats}
                       </div>
                       {isOccupied && <div className="absolute top-2 right-2 size-2 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>
                  );
              })}
           </div>
        </div>

        {/* --- DESKTOP MAP VIEW (Pan Disabled, Zoom Enabled) --- */}
        {/* Visible only on lg and above */}
        <div 
          ref={containerRef} 
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={handleBackgroundClick}
          className="hidden lg:block absolute inset-0 touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ 
            backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            backgroundColor: 'var(--color-floor-bg)',
          }}
        >
          <div 
            className="absolute origin-top-left transition-transform duration-75 will-change-transform"
            style={{ 
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              width: '100%',
              height: '100%'
            }}
          >
            {displayTables.map(table => {
              const activeOrder = (orders || []).find(o => String(o.table_id) === String(table.id) && ['Pending', 'Cooking', 'Ready'].includes(o.status));
              const isOccupied = !!activeOrder; 
              const isSelected = selectedTableId === table.id && !isEditMode; 
              const isEditing = isEditMode && editingTableId === table.id;
              let isOverTime = false;
              if (isOccupied && settings.tableTimeAlert && activeOrder?.created_at) {
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
                  onMouseDown={(e) => isEditMode && handleMouseDownDrag(e, table)}
                  onClick={(e) => handleTableClick(e, table)} 
                  onPointerUp={(e) => !isEditMode && handleTableClick(e, table)}
                  style={{ 
                    left: `${table.x}%`, top: `${table.y}%`, 
                    width: `${table.width}px`, height: `${table.height}px`, 
                    borderRadius: table.shape === 'round' ? '9999px' : '16px' 
                  }} 
                  className={tableClasses}
                >
                  <span className="text-lg font-black tracking-tight">{table.label}</span>
                  
                  {/* Resize Handles - chỉ hiện khi đang edit bàn này */}
                  {isEditMode && editingTableId === table.id && (
                    <>
                      {/* Southeast handle */}
                      <div 
                        onMouseDown={(e) => handleMouseDownResize(e, table, 'se')}
                        className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary rounded-full border-2 border-background cursor-se-resize hover:scale-125 transition-transform z-10 shadow-lg"
                      />
                      {/* Southwest handle */}
                      <div 
                        onMouseDown={(e) => handleMouseDownResize(e, table, 'sw')}
                        className="absolute -bottom-1 -left-1 w-4 h-4 bg-primary rounded-full border-2 border-background cursor-sw-resize hover:scale-125 transition-transform z-10 shadow-lg"
                      />
                      {/* Northeast handle */}
                      <div 
                        onMouseDown={(e) => handleMouseDownResize(e, table, 'ne')}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full border-2 border-background cursor-ne-resize hover:scale-125 transition-transform z-10 shadow-lg"
                      />
                      {/* Northwest handle */}
                      <div 
                        onMouseDown={(e) => handleMouseDownResize(e, table, 'nw')}
                        className="absolute -top-1 -left-1 w-4 h-4 bg-primary rounded-full border-2 border-background cursor-nw-resize hover:scale-125 transition-transform z-10 shadow-lg"
                      />
                    </>
                  )}
                  
                  {/* Editing Controls */}
                  {isEditing && (
                    <div className="absolute z-[110] top-full mt-2 left-1/2 -translate-x-1/2 w-[220px] bg-surface border border-border rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-200" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative flex-1 group">
                          <Type size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary" />
                          <input type="text" value={table.label} onChange={(e) => updateTable(table.id, { label: e.target.value })} className="w-full bg-background border border-border rounded-lg py-1.5 pl-7 pr-2 text-text-main text-xs font-bold outline-none" placeholder="Label" />
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setPendingDeleteTableId(table.id); }} className="p-1.5 text-secondary hover:text-red-500 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mb-3">
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1 block">SHAPE</span>
                        <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded-lg border border-border">
                          <button onClick={() => updateTable(table.id, { shape: 'square' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'square' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><Square size={14} /></button>
                          <button onClick={() => updateTable(table.id, { shape: 'round' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'round' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><Circle size={14} /></button>
                          <button onClick={() => updateTable(table.id, { shape: 'rect' })} className={`flex items-center justify-center p-1.5 rounded-md transition-all ${table.shape === 'rect' ? 'bg-primary text-background' : 'text-secondary hover:text-text-main'}`}><RectangleHorizontal size={14} /></button>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1 block">SEATS</span>
                        <div className="flex items-center justify-between bg-background p-1.5 rounded-lg border border-border">
                          <Users size={14} className="text-secondary ml-1" />
                          <div className="flex items-center gap-3">
                            <button onClick={() => updateTable(table.id, { seats: Math.max(1, (table.seats || 2) - 1) })} className="w-6 h-6 flex items-center justify-center bg-surface border border-border rounded hover:bg-border text-text-main"><Minus size={12} /></button>
                            <span className="text-xs font-bold text-text-main min-w-[12px] text-center">{table.seats || 2}</span>
                            <button onClick={() => updateTable(table.id, { seats: (table.seats || 2) + 1 })} className="w-6 h-6 flex items-center justify-center bg-surface border border-border rounded hover:bg-border text-text-main"><Plus size={12} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!isEditMode && isOccupied && <div className="mt-1 text-[9px] font-bold bg-white/25 text-primary dark:text-white px-2 py-0.5 rounded-full uppercase tracking-wider">{t('Occupied')}</div>}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* --- DESKTOP FLOATING CARD --- */}
        {!isEditMode && selectedTableId && activeTable && (
            <div 
              className="hidden lg:flex flex-col shadow-2xl rounded-2xl overflow-hidden w-[300px] bg-background/95 backdrop-blur border border-border animate-in fade-in zoom-in-95 duration-200"
              style={getFloatingPanelStyle()}
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag pass-through
            >
               {renderTableDetailContent()}
            </div>
        )}
      </div>

      {/* --- MOBILE/TABLET: BOTTOM SHEET --- */}
      {selectedTableId && activeTable && (
        <div 
            className="fixed inset-0 bg-black/60 z-[60] lg:hidden animate-in fade-in duration-300 backdrop-blur-sm"
            onClick={() => setSelectedTableId(null)}
        />
      )}
      
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-background rounded-t-3xl shadow-2xl z-[70] lg:hidden transition-transform duration-300 ease-out flex flex-col max-h-[85vh]
            ${selectedTableId && activeTable ? 'translate-y-0' : 'translate-y-full'}`}
      >
         <div className="w-12 h-1.5 bg-border rounded-full mx-auto my-3 shrink-0" />
         {selectedTableId && renderTableDetailContent()}
      </div>

      {/* --- MODALS --- */}
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
           
           <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
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
              
              {/* Add Items Sidebar (Desktop) / Bottom Panel (Mobile) */}
              <div className="w-full lg:w-[380px] h-auto max-h-[40vh] lg:max-h-full border-t lg:border-l lg:border-t-0 border-border bg-surface flex flex-col shadow-2xl shrink-0" style={{ borderWidth: 'var(--pos-border-strong)' }}>
                <div className="p-5 border-b border-border bg-background/50 flex items-center justify-between sticky top-0 bg-surface z-10">
                  <span className="font-bold text-xs uppercase tracking-widest text-primary">{t('Items to Add')}</span>
                  <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">{currentOrderItems.filter((i: any) => i.isNew).length} Món</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {currentOrderItems.filter((i: any) => i.isNew).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-secondary opacity-30 gap-3 py-8">
                       <ShoppingBag size={48} strokeWidth={1}/>
                       <p className="text-xs font-bold">{t('Select Item to Add')}</p>
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
                <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-border bg-background/50 space-y-4">
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
      
      {/* Existing Modals ... */}
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
                    const completedOrder = { 
                        ...active, 
                        table: (tables || []).find(t => t.id === selectedTableId)?.label, 
                        status: 'Completed', 
                        items: enriched, 
                        payment_method: method, 
                        total_amount: finalTotal, 
                        discount_amount: discountAmount,
                        subtotal: subtotal,
                        staff: user?.user_metadata?.full_name || 'POS' 
                    };
                    if (isSandboxed() && settings.printMethod !== 'rawbt') {
                        const html = await generateReceiptHTML(completedOrder, settings);
                        openPreview({ html, title: 'In hóa đơn', meta: { action: 'FINAL_ON_PAYMENT' } });
                    } else {
                        await printOrderReceipt(completedOrder, settings);
                    }
                  }
                  setShowPaymentModal(false); 
                  setSelectedTableId(null); 
                } finally {
                  setIsProcessingPayment(false); 
                }
              }} 
              onPrint={() => {
                  if (isSandboxed() && settings.printMethod !== 'rawbt') {
                      generateReceiptHTML({ ...active, table: (tables || []).find(t => t.id === selectedTableId)?.label }, settings).then(html => {
                          openPreview({ html, title: 'In hóa đơn', meta: { action: 'REPRINT_ON_EDIT' } });
                      });
                  } else {
                      printOrderReceipt({ ...active, table: (tables || []).find(t => t.id === selectedTableId)?.label }, settings);
                  }
              }} 
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

      <ConfirmModal 
        isOpen={!!pendingDeleteTableId}
        title={t('Xác nhận hành động')}
        message={`${t('Xác nhận xóa bàn')} ${localTables.find(t => t.id === pendingDeleteTableId)?.label}? \n\n${t('Thao tác này không thể hoàn tác.')}`}
        onClose={() => setPendingDeleteTableId(null)}
        onConfirm={handleConfirmDelete}
        confirmText={t('Xoá')}
        cancelText={t('Huỷ')}
        isDanger={true}
      />
    </div>
  );
};
