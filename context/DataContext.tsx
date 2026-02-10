
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../supabase';
import { useNetwork } from './NetworkContext';
import { useAuth } from '../AuthContext';
import { MenuItem, Order, TableData } from '../types';
import { db } from '../db';
import { useDB, DBProvider } from './DBProvider';
import { mergeOrderItems, normalizeNote } from '../utils/orderHelpers';
import { useSettingsContext } from './SettingsContext';
import { SettingsService } from '../services/SettingsService';
import { usePrintPreview } from './PrintPreviewContext';
import { PrintAction } from '../types/settingsTypes';

const REPORT_RETENTION_DAYS = 7;
const OPERATIONAL_STATUSES = ['Pending', 'Cooking', 'Ready'];

interface DataContextType {
  tables: any[];
  orders: any[];
  menuItems: any[];
  loading: boolean;
  currentStaffEmail: string;
  refreshData: () => Promise<void>;
  // Incremental Pull APIs
  refreshOrdersForDashboard: () => Promise<void>;
  refreshOrdersForReports: (fromISO: string, toISO: string) => Promise<void>;
  
  addLocalOrder: (fullOrderData: any) => Promise<string>;
  addItemToSession: (orderId: string, newItems: any[]) => Promise<void>;
  checkoutSession: (orderId: string, tableId: string, method: string, discountInfo?: { amount: number, type: 'percent' | 'amount', value: number }, paymentAmount?: number) => Promise<void>;
  updateLocalOrder: (orderId: string, updates: any) => Promise<void>;
  cancelOrder: (orderId: string | number) => Promise<void>;
  updateTableStatus: (tableId: string, status: string) => Promise<void>;
  saveTableLayout: (newTables: TableData[]) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>; 
  addMenuItem: (item: Partial<MenuItem>) => Promise<void>;
  updateMenuItem: (id: number | string, updates: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (id: number | string) => Promise<void>;
  getReportOrders: (range: { from: string, to: string }, opts?: { limit?: number }) => Promise<Order[]>;
  mergeOrders: (sourceTableId: string, targetTableId: string) => Promise<void>;
  moveTable: (sourceTableId: string, targetTableId: string) => Promise<void>;
  splitOrder: (sourceOrderId: string, itemsToMove: { itemId: string; quantity: number }[], targetTableId: string) => Promise<string | null>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const DataProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addToQueue, processQueue, isOnline } = useNetwork();
  const { user, role } = useAuth();
  const { settings } = useSettingsContext();
  const { openPreview } = usePrintPreview();

  const dbTables = useLiveQuery(() => db.pos_tables.toArray()) || [];
  const dbMenuItems = useLiveQuery(() => db.menu_items.toArray()) || [];
  const dbOrders = useLiveQuery(() => db.orders.toArray()) || [];
  const dbOrderItems = useLiveQuery(() => db.order_items.toArray()) || [];
  const queueItems = useLiveQuery(() => db.offline_queue.toArray()) || [];

  const [loading, setLoading] = useState(true);
  const [currentStaffEmail, setCurrentStaffEmail] = useState<string>(() => localStorage.getItem('active_staff_email') || 'POS');

  // Refs for Pull Control
  const isPulling = useRef(false);
  const lastRefreshTime = useRef(0);

  const menuItems = dbMenuItems;

  // --- REALTIME SUBSCRIPTION FOR TABLES ---
  useEffect(() => {
    // FIX: Strict check on user.id to prevent spurious re-subscriptions
    if (!user?.id || !isOnline) return;

    const channel = supabase
      .channel('realtime-tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables' },
        async (payload) => {
          // Note: This logic only updates local DB from server changes.
          // It does NOT queue syncs back to server (preventing loops).
          try {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const newTableData = payload.new;
              if (newTableData && newTableData.id) {
                 await db.pos_tables.put(newTableData);
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old?.id;
              if (deletedId) {
                 await db.pos_tables.delete(deletedId);
              }
            }
          } catch (e) {
            console.error('[Realtime] Failed to update local table DB:', e);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
           console.log("[Realtime] subscribe once: 'tables'");
        }
      });

    // FIX: Cleanup function to unsubscribe
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isOnline]);

  // Reconcile pending queue items with visible orders
  const orders = useMemo(() => {
    const pendingQueueOrderIds = new Set(
      queueItems
        .filter(q => q.type === 'new_order' || q.type === 'update_order')
        .map(q => q.data.order?.id || q.data.id)
    );

    const mappedOrders = dbOrders.map(order => {
      const items = dbOrderItems
        .filter(item => item.order_id === order.id)
        .map(item => {
          const menuRef = dbMenuItems.find(m => String(m.id) === String(item.menu_item_id));
          return {
            ...item,
            _display_name: item.snapshot_name || menuRef?.name || 'Món không tên',
            _display_price: item.price
          };
        });
      
      return { 
        ...order, 
        items, 
        order_items: items,
        total: order.total_amount || order.total || 0
      };
    });

    const activeGroups = new Map<string, any[]>();
    const finalOrders: any[] = [];
    const duplicatesToReconcile: any[] = [];

    mappedOrders.forEach(o => {
      if (!OPERATIONAL_STATUSES.includes(o.status) || o.table_id === 'Takeaway') {
        finalOrders.push(o);
        return;
      }
      if (!activeGroups.has(o.table_id)) {
        activeGroups.set(o.table_id, []);
      }
      activeGroups.get(o.table_id)!.push(o);
    });

    activeGroups.forEach((group, tableId) => {
      if (group.length === 1) {
        finalOrders.push(group[0]);
      } else {
        const sorted = group.sort((a, b) => {
          const aInQueue = pendingQueueOrderIds.has(a.id);
          const bInQueue = pendingQueueOrderIds.has(b.id);
          if (aInQueue && !bInQueue) return -1;
          if (!aInQueue && bInQueue) return 1;
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime(); 
        });
        finalOrders.push(sorted[0]);
        duplicatesToReconcile.push(...sorted.slice(1));
      }
    });

    (window as any).__duplicatesToReconcile = duplicatesToReconcile;
    return finalOrders;
  }, [dbOrders, dbOrderItems, dbMenuItems, queueItems]);

  const tables = dbTables.map(t => {
    const activeOrder = orders.find(o => String(o.table_id) === String(t.id) && OPERATIONAL_STATUSES.includes(o.status));
    return { ...t, status: activeOrder ? 'Occupied' : 'Available', orderId: activeOrder?.id };
  });

  const ensureDb = async () => { 
    if (!db.isOpen()) {
      await db.open(); 
    }
  };

  const handlePrintRequest = async (action: PrintAction, orderData: any) => {
    const result = await SettingsService.requestPrint(action, orderData, settings);
    if (result.reason === 'SANDBOX_BLOCKED') {
        console.log(`[Print] ${action} suppressed in Sandbox/Preview Mode.`);
    }
  };

  // --- CORE RECONCILIATION LOGIC ---
  const reconcileOrders = async (serverOrders: any[], serverItems: any[]) => {
    await db.transaction('rw', [db.orders, db.order_items], async () => {
        const validOrderIds = new Set<string>();
        
        // 1. Process Orders
        for (const sOrder of serverOrders) {
            const localOrder = await db.orders.get(sOrder.id);
            let resolveServer = true; // Default: Server wins (Synced state)

            // Conflict Check: If local has unsynced changes
            if (localOrder && localOrder.sync_status !== 'synced') {
                const serverTime = new Date(sOrder.updated_at || sOrder.created_at).getTime();
                const localTime = new Date(localOrder.updated_at || localOrder.created_at).getTime();
                const serverStatus = sOrder.status;
                const localStatus = localOrder.status;

                // --- Automatic Conflict Resolution Rules ---
                const isServerFinal = ['Completed', 'Cancelled'].includes(serverStatus);
                const isServerMuchNewer = serverTime > (localTime + 5 * 60 * 1000); // 5 mins newer
                const isLocalActive = ['Pending', 'Cooking', 'Ready'].includes(localStatus);

                if (isServerFinal) {
                    // Rule 1: Server 'Completed'/'Cancelled' overrides everything.
                    resolveServer = true;
                } else if (isServerMuchNewer) {
                    // Rule 3 (Optional): Server is significantly newer, likely processed elsewhere.
                    resolveServer = true;
                } else if (isLocalActive) {
                    // Rule 2: Local is 'Pending'/'Cooking'. Keep local as source of truth to prevent disrupting user.
                    resolveServer = false;
                } else {
                    resolveServer = false;
                }

                if (!resolveServer) {
                    console.log(`[Sync] Conflict Auto-Resolved: Keeping Local Order ${sOrder.id} (Local: ${localStatus}, Server: ${serverStatus})`);
                }
            }

            if (resolveServer) {
                // Safe to Overwrite / Insert
                const cleanOrder = { 
                    ...sOrder, 
                    total: sOrder.total_amount || 0, 
                    staff: sOrder.staff_name || 'POS',
                    sync_status: 'synced'
                };
                await db.orders.put(cleanOrder);
                validOrderIds.add(sOrder.id);
            }
        }

        // 2. Process Items
        // Only replace items for orders where we accepted the server version
        if (serverItems.length > 0) {
            const idsArray = Array.from(validOrderIds);
            
            if (idsArray.length > 0) {
                // Delete old items for valid orders
                await db.order_items.where('order_id').anyOf(idsArray).delete();
                
                // Filter server items belonging to valid orders
                const itemsToInsert = serverItems
                    .filter(i => validOrderIds.has(i.order_id))
                    .map(item => ({ 
                        ...item, 
                        snapshot_name: item.snapshot_name || item.name || 'Unknown' 
                    }));
                
                if (itemsToInsert.length > 0) {
                    await db.order_items.bulkPut(itemsToInsert);
                }
            }
        }
    });
  };

  // --- INCREMENTAL PULL FUNCTION ---
  const pullOrdersRange = async ({ fromISO, toISO, statusFilter }: { fromISO?: string, toISO?: string, statusFilter?: string[] }) => {
    if (!navigator.onLine || !user) return;
    
    // Guard: Prevent undefined ranges which spam the logs
    if (!fromISO || !toISO) {
        // Silent return is better to avoid noise if logic is correct elsewhere
        return;
    }

    // Mutex: Prevent parallel syncs
    if (isPulling.current) {
        return; 
    }

    try {
        isPulling.current = true;
        console.log(`[Pull] Range: ${fromISO} to ${toISO} [${statusFilter?.join(',') || 'ALL'}]`);
        
        let query = supabase.from('orders').select('*');
        
        if (fromISO) query = query.gte('updated_at', fromISO);
        if (toISO) query = query.lte('updated_at', toISO);
        if (statusFilter && statusFilter.length > 0) query = query.in('status', statusFilter);
        
        // RBAC filtering
        if (role === 'staff' && user) {
             query = query.or(`staff_name.eq.${user.email},user_id.eq.${user.id}`);
        }

        const { data: serverOrders, error } = await query;
        if (error) throw error;
        
        if (!serverOrders || serverOrders.length === 0) return;

        const orderIds = serverOrders.map(o => o.id);
        
        // Fetch Items in Chunks
        let allServerItems: any[] = [];
        const chunkSize = 50;
        for (let i = 0; i < orderIds.length; i += chunkSize) {
            const chunk = orderIds.slice(i, i + chunkSize);
            const { data: itemsChunk, error: itemsError } = await supabase
                .from('order_items')
                .select('*')
                .in('order_id', chunk);
            
            if (itemsError) console.error("Error fetching items chunk:", itemsError);
            if (itemsChunk) allServerItems = [...allServerItems, ...itemsChunk];
        }

        await reconcileOrders(serverOrders, allServerItems);
        console.log(`[Pull] Synced ${serverOrders.length} orders.`);

    } catch (e) {
        console.error("[Pull] Error:", e);
    } finally {
        isPulling.current = false;
    }
  };

  const refreshOrdersForDashboard = async () => {
      const now = new Date();
      const nowISO = now.toISOString();
      const past30Days = new Date(now);
      past30Days.setDate(past30Days.getDate() - 30);
      const todayStart = new Date(now);
      todayStart.setHours(0,0,0,0);
      const todayISO = todayStart.toISOString();

      await pullOrdersRange({ 
          fromISO: past30Days.toISOString(), 
          toISO: nowISO, 
          statusFilter: OPERATIONAL_STATUSES 
      });
      
      await pullOrdersRange({ 
          fromISO: todayISO, 
          toISO: nowISO, 
          statusFilter: ['Completed', 'Cancelled'] 
      });
  };

  const refreshOrdersForReports = async (fromISO: string, toISO: string) => {
      await pullOrdersRange({ fromISO, toISO, statusFilter: ['Completed', 'Cancelled'] });
  };

  // Legacy refreshData (Full Reload)
  const refreshData = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshTime.current < 2000) return;
    lastRefreshTime.current = now;

    try {
      await ensureDb();
    } catch (e) {
      console.error("DB Connection Failed:", e);
      return;
    }

    if (!navigator.onLine || !user) { setLoading(false); return; }
    
    try {
      await processQueue(true);

      const [menuRes, tablesRes] = await Promise.all([
        supabase.from('menu_items').select('*').order('name'),
        supabase.from('tables').select('*')
      ]);

      await db.transaction('rw', ['menu_items', 'pos_tables'], async () => {
        if (menuRes.data) {
          const localItems = await db.menu_items.filter(i => String(i.id).startsWith('LOCAL_')).toArray();
          await db.menu_items.clear();
          await db.menu_items.bulkPut([...menuRes.data.map(i => ({...i, sync_status: 'synced'})), ...localItems]);
        }
        if (tablesRes.data) { 
            await db.pos_tables.clear(); 
            await db.pos_tables.bulkPut(tablesRes.data); 
        }
      });

      await refreshOrdersForDashboard();
      
    } catch (e: any) { 
        console.error("refreshData failed:", e); 
    } finally { 
        setLoading(false); 
    }
  }, [processQueue, user]);

  useEffect(() => { if (user) refreshData(); else setLoading(false); }, [user, refreshData]);

  // --- CRUD OPERATIONS ---

  const addLocalOrder = async (data: any) => {
    console.log(`[CONFIRM_FLOW] addLocalOrder start. Table: ${data.table_id}`);
    await ensureDb();
    const orderId = self.crypto.randomUUID();
    const now = new Date().toISOString();
    
    const rawItems = (data.order_items || []).map((i: any) => {
      const menuRef = dbMenuItems.find(m => String(m.id) === String(i.menu_item_id || i.id));
      return { 
          id: self.crypto.randomUUID(),
          order_id: orderId, 
          menu_item_id: i.menu_item_id || i.id, 
          quantity: Number(i.quantity || 1), 
          price: Number(i.price || 0), 
          snapshot_name: i.snapshot_name || i._snapshot_name || i.name || menuRef?.name || 'Món không tên', 
          note: normalizeNote(i.note) 
      };
    });
    
    const total = rawItems.reduce((s: number, i: any) => s + (i.price * i.quantity), 0);
    
    const staffDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || currentStaffEmail;
    
    const metadata = { 
        id: orderId, 
        table_id: data.table_id || 'Takeaway', 
        table: data.table || data.table_id || 'Takeaway', 
        status: 'Pending', 
        total: total, 
        total_amount: total, 
        staff: staffDisplayName, 
        staff_name: staffDisplayName, 
        user_id: user?.id, 
        guests: data.guests || 1, 
        created_at: now, 
        updated_at: now,
        version: 1,
        is_offline: true,
        sync_status: 'pending', 
        note: data.note || ''
    };

    await db.orders.put(metadata);
    await db.order_items.bulkAdd(rawItems);
    
    console.log(`[CONFIRM_FLOW] dexieUpdated ID=${orderId} Status=Pending`);
    
    await addToQueue('new_order', { order: metadata });
    await addToQueue('update_order_items', { order_id: orderId, items: rawItems });
    console.log(`[CONFIRM_FLOW] enqueue sync done`);
    
    await handlePrintRequest('TEMP_ON_CREATE', { ...metadata, items: rawItems });
    return orderId;
  };

  const addItemToSession = async (orderId: string, newItems: any[]) => {
    console.log(`[CONFIRM_FLOW] addItemToSession start orderId=${orderId}`);
    await ensureDb();
    const order = await db.orders.get(orderId);
    if (!order) throw new Error("Order not found");

    const existingItems = await db.order_items.where('order_id').equals(orderId).toArray();
    
    const incomingItems = newItems.map((i: any) => {
      const menuRef = dbMenuItems.find(m => String(m.id) === String(i.menu_item_id || i.id));
      return { 
          id: i.id || self.crypto.randomUUID(),
          order_id: orderId, 
          menu_item_id: i.menu_item_id || i.id, 
          quantity: Number(i.quantity || 1), 
          price: Number(i.price || 0), 
          snapshot_name: i.snapshot_name || i._snapshot_name || i.name || menuRef?.name || 'Món không tên', 
          note: normalizeNote(i.note) 
      };
    });

    const mergedItems = mergeOrderItems([...existingItems, ...incomingItems]);
    const itemsForLocal = mergedItems.map(item => ({ ...item, id: item.id || self.crypto.randomUUID() }));
    const newTotal = itemsForLocal.reduce((s, i) => s + (i.price * i.quantity), 0);
    
    const updatePayload = { 
        total_amount: newTotal, 
        total: newTotal, 
        updated_at: new Date().toISOString(),
        version: (order.version || 1) + 1,
        sync_status: 'pending'
    };

    await db.transaction('rw', [db.orders, db.order_items], async () => {
      await db.orders.update(orderId, updatePayload);
      await db.order_items.where('order_id').equals(orderId).delete();
      await db.order_items.bulkAdd(itemsForLocal);
    });
    
    console.log(`[CONFIRM_FLOW] dexieUpdated items=${itemsForLocal.length}`);

    await addToQueue('update_order', { id: orderId, updates: updatePayload });
    await addToQueue('update_order_items', { order_id: orderId, items: itemsForLocal });
    console.log(`[CONFIRM_FLOW] enqueue sync done`);
    
    const orderMeta = await db.orders.get(orderId);
    if (orderMeta) await handlePrintRequest('REPRINT_ON_EDIT', { ...orderMeta, items: itemsForLocal, total_amount: newTotal });
  };

  const updateLocalOrder = async (orderId: string, updates: any) => {
    await ensureDb();
    const order = await db.orders.get(orderId);
    if (!order) return;

    let localUpdates = { 
        ...updates, 
        updated_at: new Date().toISOString(),
        version: (order.version || 1) + 1,
        sync_status: 'pending'
    };
    
    let finalItems: any[] = [];

    if (updates.order_items) {
      const itemsSnapshot = updates.order_items.map((i: any) => {
        const menuRef = dbMenuItems.find(m => String(m.id) === String(i.menu_item_id || i.id));
        return { 
            id: i.id || self.crypto.randomUUID(), 
            order_id: orderId, 
            menu_item_id: i.menu_item_id || i.id, 
            price: Number(i.price || i._display_price || 0), 
            quantity: Number(i.quantity || 1), 
            snapshot_name: i.snapshot_name || i._snapshot_name || i.name || menuRef?.name || 'Món không tên', 
            note: normalizeNote(i.note) 
        };
      });
      const mergedItems = mergeOrderItems(itemsSnapshot);
      finalItems = mergedItems.map(item => ({ ...item, id: item.id || self.crypto.randomUUID() }));
      const total = finalItems.reduce((s, i) => s + (i.price * i.quantity), 0);
      
      await db.transaction('rw', [db.orders, db.order_items], async () => {
        await db.order_items.where('order_id').equals(orderId).delete();
        await db.order_items.bulkAdd(finalItems);
        await db.orders.update(orderId, { total_amount: total, total: total, ...localUpdates });
      });
      
      localUpdates.total_amount = total; 
      localUpdates.total = total;
      
      await addToQueue('update_order_items', { order_id: orderId, items: finalItems });
      delete localUpdates.order_items; 
    } else {
        await db.orders.update(orderId, localUpdates);
    }

    const { items, order_items, table, time, staff, total, sync_status, ...handoverUpdates } = localUpdates;
    
    if (Object.keys(handoverUpdates).length > 0) {
      console.log(`[updateLocalOrder] Queuing update_order for ${orderId}. Keys: ${Object.keys(handoverUpdates).join(', ')}`);
      await addToQueue('update_order', { id: orderId, updates: handoverUpdates });
    }
    
    const orderMeta = await db.orders.get(orderId);
    if (orderMeta && finalItems.length > 0) await handlePrintRequest('REPRINT_ON_EDIT', { ...orderMeta, items: finalItems });
  };

  const checkoutSession = async (orderId: string, tableId: string, method: string, discountInfo?: { amount: number, type: 'percent' | 'amount', value: number }, paymentAmount?: number) => {
    await ensureDb();
    const order = await db.orders.get(orderId);
    if (!order) {
        console.error(`[checkoutSession] Order not found: ${orderId} (type: ${typeof orderId})`);
        throw new Error("Order not found");
    }

    let finalTotal = order.total || 0;
    if (discountInfo) {
      finalTotal = Math.max(0, finalTotal - discountInfo.amount);
    } else if (paymentAmount !== undefined) {
      finalTotal = paymentAmount;
    }

    const paymentStaffName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || currentStaffEmail;

    const updates: any = {
      status: 'Completed',
      paid: true,
      payment_method: method,
      discount_amount: discountInfo?.amount || 0,
      discount_type: discountInfo?.type,
      discount_value: discountInfo?.value,
      total_amount: finalTotal,
      subtotal_amount: order.total || 0, 
      staff_name: paymentStaffName,
      staff: paymentStaffName, 
      updated_at: new Date().toISOString(),
      version: (order.version || 1) + 1,
      sync_status: 'pending'
    };

    await db.orders.update(orderId, updates);
    await addToQueue('update_order', { id: orderId, updates });
  };

  const cancelOrder = async (orderId: string | number) => {
    console.log(`[CANCEL_FLOW] Start for Order ${orderId}`);
    await ensureDb();
    const id = String(orderId);
    const updates = { 
        status: 'Cancelled', 
        updated_at: new Date().toISOString(),
        sync_status: 'pending'
    };
    await db.orders.update(id, updates);
    console.log(`[CANCEL_FLOW] Dexie updated Order ${id} to Cancelled`);
    await addToQueue('update_order', { id, updates });
    console.log(`[CANCEL_FLOW] Queued update_order for ${id}`);
  };

  const updateTableStatus = async (tableId: string, status: string) => {};

  const saveTableLayout = async (newTables: TableData[]) => {
    // FIX: Guard against empty tables causing unintentional wipe, especially during race conditions on login
    if (!newTables || newTables.length === 0) {
        console.warn("skip enqueue table_layout_sync on init (empty table list)");
        return;
    }

    await ensureDb();
    // 1. Update local IndexedDB
    await db.transaction('rw', db.pos_tables, async () => {
      // Clear old tables (optional, or just update) - clearing is safer for full layout replace
      await db.pos_tables.clear();
      await db.pos_tables.bulkAdd(newTables);
    });

    // 2. Queue for Sync to Server
    console.log("Queueing table_layout_sync");
    await addToQueue('table_layout_sync', { tables: newTables });
  };

  const deleteTable = async (tableId: string) => {
    await ensureDb();
    // 1. Local Dexie delete
    await db.pos_tables.delete(tableId);
    
    // 2. Enqueue server delete
    await addToQueue('table_delete', { id: tableId });
    console.log(`[TABLE_DELETE] Table ${tableId} deleted locally and queued for sync.`);
  };

  const addMenuItem = async (item: Partial<MenuItem>) => {
  await ensureDb();
  const localId = `LOCAL_${Date.now()}`;
  const uid = crypto.randomUUID();
  const newItem: any = {
    ...item,
    id: localId,
    uid,
    sync_status: 'pending',
  };
  await db.menu_items.add(newItem);
  await addToQueue('menu_upsert', { local_id: localId, payload: newItem });
};


  const updateMenuItem = async (id: number | string, updates: Partial<MenuItem>) => {
    await ensureDb();
    await db.menu_items.update(id, updates);
    await addToQueue('menu_update', { id, updates });
  };

 const deleteMenuItem = async (id: any) => {
  const item = await db.menu_items.get(id);
  await db.menu_items.delete(id);
  await addToQueue('menu_delete', { id, uid: item?.uid });
};


  const getReportOrders = async (range: { from: string, to: string }, opts?: { limit?: number }) => {
    const isInRange = (o: any) => {
        const ts = o.updated_at || o.created_at || '';
        return ts >= range.from && ts <= range.to;
    };

    const fetchLocalData = async () => {
        const local = await db.orders.where('status').anyOf('Completed', 'Cancelled').toArray();
        const filtered = local.filter(isInRange);
        
        const enriched = [];
        for (const o of filtered) { 
            // Local filtering for Staff
            if (role === 'staff' && user && o.staff_name !== user.email && o.user_id !== user.id) continue;
            
            const items = await db.order_items.where('order_id').equals(o.id).toArray(); 
            enriched.push({ ...o, order_items: items, items }); 
        }
        return enriched as Order[];
    };

    if (!navigator.onLine) {
      return fetchLocalData();
    }

    try {
      let query = supabase.from('orders').select('*, order_items(*)')
        .in('status', ['Completed', 'Cancelled'])
        .gte('updated_at', range.from) 
        .lte('updated_at', range.to)   
        .order('updated_at', { ascending: false }) 
        .limit(opts?.limit || 1000);

      // RBAC: Staff can ONLY fetch their own data from server
      if (role === 'staff' && user) {
         query = query.or(`staff_name.eq.${user.email},user_id.eq.${user.id}`);
      }

      const { data: serverData, error } = await query;
      if (error) throw error;
      
      const serverOrders = (serverData || []).map(o => ({ 
          ...o, 
          total: o.total_amount || 0, 
          staff: o.staff_name || 'POS', 
          items: o.order_items 
      })) as Order[];

      const localPending = await db.orders
        .where('status').anyOf('Completed', 'Cancelled')
        .filter(o => o.sync_status !== 'synced' && isInRange(o))
        .toArray();

      const mergedMap = new Map<string, Order>();
      
      serverOrders.forEach(o => mergedMap.set(o.id, o));
      
      for (const o of localPending) {
          // Local filtering for Staff
          if (role === 'staff' && user && o.staff_name !== user.email && o.user_id !== user.id) continue;
          
          const items = await db.order_items.where('order_id').equals(o.id).toArray();
          const enriched = { ...o, order_items: items, items } as Order;
          mergedMap.set(o.id, enriched);
      }

      return Array.from(mergedMap.values()).sort((a, b) => 
        new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      );

    } catch (e) { 
        console.warn("Report fetch failed (Online), falling back to local data:", e);
        return fetchLocalData(); 
    }
  };

  const mergeOrders = async (sourceTableId: string, targetTableId: string) => {
    console.log(`[mergeOrders] start: ${sourceTableId} -> ${targetTableId}`);
    await ensureDb();
    const sourceOrder = orders.find(o => String(o.table_id) === String(sourceTableId) && OPERATIONAL_STATUSES.includes(o.status));
    const targetOrder = orders.find(o => String(o.table_id) === String(targetTableId) && OPERATIONAL_STATUSES.includes(o.status));

    if (!sourceOrder || !targetOrder) throw new Error("Invalid tables for merge");

    const sourceItems = await db.order_items.where('order_id').equals(sourceOrder.id).toArray();
    const updates = sourceItems.map(item => ({ ...item, order_id: targetOrder.id }));
    
    await db.transaction('rw', [db.orders, db.order_items], async () => {
        await db.order_items.bulkPut(updates); 
        
        const allTargetItems = await db.order_items.where('order_id').equals(targetOrder.id).toArray();
        const newTotal = allTargetItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        await db.orders.update(targetOrder.id, { 
            total_amount: newTotal, 
            total: newTotal,
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        });

        await db.orders.update(sourceOrder.id, { 
            status: 'Cancelled', 
            note: `Merged to ${targetTableId}`,
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        });
    });

    const finalTargetItems = await db.order_items.where('order_id').equals(targetOrder.id).toArray();
    await addToQueue('update_order_items', { order_id: targetOrder.id, items: finalTargetItems });
    await addToQueue('update_order', { id: sourceOrder.id, updates: { status: 'Cancelled', note: `Merged to ${targetTableId}` } });
    await addToQueue('update_order', { id: targetOrder.id, updates: { total_amount: finalTargetItems.reduce((s, i) => s + (i.price * i.quantity), 0) } });
    
    console.log(`[mergeOrders] ok`);
  };

  const moveTable = async (sourceTableId: string, targetTableId: string) => {
    console.log(`[moveTable] start: ${sourceTableId} -> ${targetTableId}`);
    await ensureDb();
    const sourceOrder = orders.find(o => String(o.table_id) === String(sourceTableId) && OPERATIONAL_STATUSES.includes(o.status));
    if (!sourceOrder) throw new Error("Source table has no active order");

    const targetOrder = orders.find(o => String(o.table_id) === String(targetTableId) && OPERATIONAL_STATUSES.includes(o.status));
    if (targetOrder) throw new Error("Target table is occupied");

    const updates = {
        table_id: targetTableId,
        table: (tables.find(t => String(t.id) === String(targetTableId))?.label || targetTableId),
        updated_at: new Date().toISOString(),
        sync_status: 'pending'
    };

    await db.orders.update(sourceOrder.id, updates);
    await addToQueue('update_order', { id: sourceOrder.id, updates });
    console.log(`[moveTable] ok`);
  };

  const splitOrder = async (sourceOrderId: string, itemsToMove: { itemId: string; quantity: number }[], targetTableId: string) => {
    console.log(`[splitOrder] start from ${sourceOrderId} to ${targetTableId}`);
    await ensureDb();
    
    const sourceOrder = await db.orders.get(sourceOrderId);
    if (!sourceOrder) throw new Error("Source order not found");

    let targetOrder = null;
    if (targetTableId !== 'Takeaway') {
        targetOrder = orders.find(o => String(o.table_id) === String(targetTableId) && OPERATIONAL_STATUSES.includes(o.status));
    }
    
    let targetOrderId = targetOrder?.id;
    const now = new Date().toISOString();

    const staffName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || currentStaffEmail;
    const userId = user?.id;

    await db.transaction('rw', [db.orders, db.order_items, db.offline_queue], async () => {
        if (!targetOrder) {
            targetOrderId = self.crypto.randomUUID();
            const newOrder = {
                id: targetOrderId,
                table_id: targetTableId,
                table: (tables.find(t => String(t.id) === String(targetTableId))?.label || targetTableId),
                status: 'Pending',
                total: 0, total_amount: 0,
                staff: staffName, 
                staff_name: staffName, 
                user_id: userId, 
                created_at: now, updated_at: now,
                guests: 1,
                is_offline: true,
                version: 1,
                sync_status: 'pending',
                note: sourceOrder.note || '' 
            };
            await db.orders.add(newOrder);
            await addToQueue('new_order', { order: newOrder });
        }

        const sourceItemsMap = new Map();
        (await db.order_items.where('order_id').equals(sourceOrderId).toArray()).forEach(i => sourceItemsMap.set(i.id, i));

        const newTargetItems = [];
        const updatedSourceItems = [];

        for (const moveReq of itemsToMove) {
            const item = sourceItemsMap.get(moveReq.itemId);
            if (!item) continue;

            if (item.quantity === moveReq.quantity) {
                item.order_id = targetOrderId;
                await db.order_items.put(item); 
                newTargetItems.push(item);
            } else {
                item.quantity -= moveReq.quantity;
                await db.order_items.put(item);
                updatedSourceItems.push(item);

                const newItem = {
                    ...item,
                    id: self.crypto.randomUUID(),
                    order_id: targetOrderId,
                    quantity: moveReq.quantity
                };
                await db.order_items.add(newItem);
                newTargetItems.push(newItem);
            }
        }

        const remainingSourceItems = await db.order_items.where('order_id').equals(sourceOrderId).toArray();
        const sourceTotal = remainingSourceItems.reduce((s, i) => s + (i.price * i.quantity), 0);
        await db.orders.update(sourceOrderId, { total: sourceTotal, total_amount: sourceTotal, updated_at: now, sync_status: 'pending' });

        const allTargetItems = await db.order_items.where('order_id').equals(targetOrderId!).toArray();
        const targetTotal = allTargetItems.reduce((s, i) => s + (i.price * i.quantity), 0);
        await db.orders.update(targetOrderId!, { total: targetTotal, total_amount: targetTotal, updated_at: now, sync_status: 'pending' });
        
        await addToQueue('update_order_items', { order_id: sourceOrderId, items: remainingSourceItems });
        await addToQueue('update_order', { id: sourceOrderId, updates: { total_amount: sourceTotal } });
        
        await addToQueue('update_order_items', { order_id: targetOrderId, items: allTargetItems });
        await addToQueue('update_order', { id: targetOrderId, updates: { total_amount: targetTotal } });
    });

    console.log(`[splitOrder] ok. New Order: ${targetOrderId}`);
    return targetOrderId || null;
  };

  return (
    <DataContext.Provider value={{
      tables, orders, menuItems, loading, currentStaffEmail,
      refreshData, 
      refreshOrdersForDashboard, refreshOrdersForReports,
      addLocalOrder, addItemToSession, updateLocalOrder,
      checkoutSession, cancelOrder, updateTableStatus,
      saveTableLayout, // New export
      deleteTable, // Export deleteTable
      addMenuItem, updateMenuItem, deleteMenuItem,
      getReportOrders,
      mergeOrders, moveTable, splitOrder
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  // FIX 1: Remove DBProvider to prevent double init (App.tsx handles it)
  <DataProviderInner>{children}</DataProviderInner>
);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};
