
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../supabase';
import { db, QueueActionType } from '../db';
import { useTheme } from '../ThemeContext';
import { mapToSupabaseOrder, mapToSupabaseOrderItem } from '../utils/orderHelpers';
import { SETTINGS_STORAGE_KEY } from '../services/SettingsService';

interface NetworkContextType {
  isOnline: boolean;
  serverReachable: boolean;
  connectionStatus: 'online' | 'offline' | 'unreachable';
  addToQueue: (type: QueueActionType, data: any) => Promise<void>;
  processQueue: (force?: boolean) => Promise<boolean>;
  syncInProgress: boolean;
  pendingCount: number;
  lastSyncError: string | null;
  lastSyncTime: Date | null;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

// --- ERROR HELPERS ---
const isAuthError = (err: any) => {
  const msg = err?.message?.toLowerCase() || "";
  const code = String(err?.code || "");
  return code === '401' || code === '403' || 
         msg.includes('refresh token') || 
         msg.includes('invalid_grant') || 
         msg.includes('unauthorized') ||
         msg.includes('jwt');
};

const isTransientError = (err: any) => {
  const msg = err?.message?.toLowerCase() || "";
  return msg.includes('failed to fetch') || 
         msg.includes('networkerror') || 
         msg.includes('timeout') ||
         msg.includes('fetch failed') ||
         msg.includes('upstream request timeout');
};

const isConflictError = (err: any) => {
  return String(err?.code) === '23505'; // Duplicate Key
};

// --- SYNC HANDLERS ---
const SYNC_HANDLERS: Record<QueueActionType, (data: any) => Promise<void>> = {
  'new_order': async (data) => {
    const orderId = data.order?.id;
    try {
      const payload = mapToSupabaseOrder(data.order);
      const { error } = await supabase.from('orders').insert([payload]);
      
      if (error) {
        if (isConflictError(error)) {
           console.log(`[SYNC_PUSH_ORDERS] orderId=${orderId} (Conflict ignored - Idempotent)`);
           return;
        }
        throw error;
      }
      console.log(`[SYNC_PUSH_ORDERS] orderId=${orderId} OK`);
    } catch (e: any) {
      throw e;
    }
  },

  'update_order': async (data) => {
    const orderId = data.id;
    try {
      const payload = {
          ...data.updates,
          updated_at: new Date().toISOString()
      };
      
      // Fix: 'total' column does not exist in Supabase 'orders' table.
      // Map 'total' -> 'total_amount' if needed, then remove 'total'.
      if ('total' in payload) {
          if (payload.total_amount === undefined) {
              payload.total_amount = payload.total;
          }
          delete payload.total;
      }
      
      const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
      if (error) throw error;
      console.log(`[SYNC_PUSH_ORDERS] update orderId=${orderId} OK`);
    } catch (e: any) {
      throw e;
    }
  },

  'update_order_items': async (data) => {
    const { order_id, items } = data;
    try {
      const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', order_id);
      if (delErr) console.warn(`[SYNC_PUSH_ITEMS] delete warning: ${delErr.message}`);
      
      if (items && items.length > 0) {
        const cleanItems = items.map((it: any) => mapToSupabaseOrderItem(it));
        const { error: insErr } = await supabase.from('order_items').insert(cleanItems);
        if (insErr) throw insErr;
      }
      
      console.log(`[SYNC_PUSH_ITEMS] orderId=${order_id} items=${items?.length || 0} OK`);
    } catch (e: any) {
      throw e;
    }
  },

  'menu_upsert': async (data) => {
  const rawPayload = data?.payload ?? data;
  const localId = data?.local_id ?? rawPayload?.id;
  if (!localId) throw new Error('[menu_upsert] Missing local_id');
  // ✅ sanitize
  const payload: any = { ...rawPayload };
  delete payload.sync_status;
  // ✅ không bao giờ gửi id lên server (server tự sinh integer id)
  delete payload.id;
  // ✅ uid bắt buộc phải là UUID hợp lệ (đã tạo từ DataContext)
  if (!payload.uid || typeof payload.uid !== 'string') {
    throw new Error('[menu_upsert] Missing uid');
  }
  console.log('[MENU_UPSERT_PAYLOAD_SENT]', payload);
  const { data: serverItem, error } = await supabase
    .from('menu_items')
    .upsert(payload, { onConflict: 'uid' })
    .select()
    .single();
  if (error) throw error;
  // ✅ Reconcile local -> server
  await db.transaction('rw', [db.menu_items, db.order_items], async () => {
    await db.menu_items.delete(localId);
    await db.menu_items.put({ ...serverItem, sync_status: 'synced' });
    await db.order_items
      .where('menu_item_id')
      .equals(localId as any)
      .modify({ menu_item_id: serverItem.id });
  });
},
  
  'menu_update': async (data) => {
    const { id, updates } = data;
    if (String(id).startsWith('LOCAL_')) return; 
    const { error } = await supabase.from('menu_items').update(updates).eq('id', id);
    if (error) throw error;
  },
  
  'menu_delete': async (data) => {
  const { id, uid } = data;
  if (typeof id === 'number') {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  // ✅ local string: delete theo uid (UUID)
  if (uid) {
    const { error } = await supabase.from('menu_items').delete().eq('uid', uid);
    if (error) throw error;
    return;
  }
  throw new Error('[menu_delete] Missing id/uid');
},

  'audit_log': async (data) => {
    const payload = data.log;
    const { error } = await supabase.from('audit_logs').insert([payload]);
    if (error) {
      if (isConflictError(error)) {
         console.log(`[SYNC_AUDIT] Action=${payload.action} ok=true (Conflict ignored)`);
      } else {
         throw error;
      }
    }
    if (payload.id) {
        await db.audit_logs.update(payload.id, { synced_at: new Date().toISOString() }).catch(() => {});
    }
    console.log(`[SYNC_AUDIT] Action=${payload.action} OK`);
  },

  'table_layout_sync': async (data) => {
    const { tables } = data;
    const payload = tables.map((t: any) => ({
      id: t.id,
      label: t.label,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      shape: t.shape,
      seats: t.seats,
      status: t.status 
    }));

    // 1. Upsert Tables (Add/Update)
    if (payload.length > 0) {
        const { error } = await supabase.from('tables').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
    }

    // 2. Prune Tables (Delete those not in the new list)
    const activeIds = payload.map((t: any) => t.id);
    let query = supabase.from('tables').delete();
    
    if (activeIds.length > 0) {
        // Fix: Pass array directly to 'in' filter. Do not format as string.
        query = query.not('id', 'in', activeIds);
    } else {
        // Careful: If array is empty, we delete ALL tables (user cleared floor plan)
        // We use a safe filter to select all rows (id is not null)
        query = query.not('id', 'is', null);
    }

    const { error: delError } = await query;
    if (delError) throw delError;

    console.log(`[SYNC_TABLES] Synced ${tables.length} tables (Upserted & Pruned).`);
  },

  'table_delete': async (data) => {
    const { id } = data;
    const { error } = await supabase.from('tables').delete().eq('id', id);
    if (error) throw error;
    console.log(`[SYNC_TABLE_DELETE] Table ${id} deleted on server.`);
  }
};

export const NetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTheme();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverReachable, setServerReachable] = useState(navigator.onLine);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  const [showToast, setShowToast] = useState<'online' | 'offline' | 'syncing' | 'success' | 'error' | null>(null);
  const syncMutex = useRef<boolean>(false);

  useEffect(() => {
      const interval = setInterval(async () => {
          const count = await db.offline_queue.count();
          setPendingCount(count);
      }, 2000);
      return () => clearInterval(interval);
  }, []);

  const checkHealth = useCallback(async () => {
    if (!navigator.onLine) {
        setServerReachable(false);
        return;
    }
    try {
        const { error } = await supabase.from('menu_items').select('id').limit(1).maybeSingle();
        if (error && isTransientError(error)) {
             setServerReachable(false);
        } else {
             setServerReachable(true);
        }
    } catch (e) {
        setServerReachable(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline) checkHealth();
    const interval = setInterval(() => {
        if (navigator.onLine) checkHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, checkHealth]);

  const processQueue = useCallback(async (force = false): Promise<boolean> => {
    if (!navigator.onLine && !force) return false;
    if (syncMutex.current) return false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const queueCount = await db.offline_queue.count();
    if (queueCount === 0) {
        setLastSyncTime(new Date());
        return true;
    }

    syncMutex.current = true;
    setSyncInProgress(true);
    setShowToast('syncing');
    setLastSyncError(null);

    let hardErrorOccurred = false;

    try {
      const queue = await db.offline_queue.orderBy('timestamp').limit(50).toArray();

      for (const item of queue) {
        if (!navigator.onLine) break;

        try {
          const handler = SYNC_HANDLERS[item.type];
          if (handler) {
              await handler(item.data);
              await db.offline_queue.delete(item.id!);
          } else {
              await db.offline_queue.delete(item.id!);
          }
        } catch (err: any) {
          console.error(`[SYNC_ERROR] Item ${item.id} (${item.type}): ${err.message}`);
          
          if (isAuthError(err)) {
             setLastSyncError("Authentication failed. Please login again.");
             hardErrorOccurred = true;
             break; 
          }
          
          if (isTransientError(err)) {
             setLastSyncError("Network unstable. Retrying later.");
             hardErrorOccurred = true;
             break;
          }

          const newRetries = (item.retries || 0) + 1;
          if (newRetries > 5) {
             console.error(`[SYNC_DROP] Dropping item ${item.id} after 5 failures.`);
             await db.offline_queue.delete(item.id!);
          } else {
             await db.offline_queue.update(item.id!, { 
                 retries: newRetries,
                 lastError: err.message 
             });
          }
        }
      }
      
      const remaining = await db.offline_queue.count();
      setPendingCount(remaining);

      if (remaining === 0 && !hardErrorOccurred) {
        setShowToast('success');
        setLastSyncTime(new Date());
      } else if (hardErrorOccurred) {
        setShowToast('error');
      } else {
        setShowToast(null);
      }

    } catch (globalErr: any) {
      console.error("Critical Sync Failure:", globalErr);
      setLastSyncError(globalErr.message);
      setShowToast('error');
    } finally {
      syncMutex.current = false;
      setSyncInProgress(false);
      setTimeout(() => {
          if (showToast !== 'error') setShowToast(null);
      }, 3000);
    }
    return true;
  }, []);

  useEffect(() => {
    const hOnline = () => { 
        setIsOnline(true); 
        setShowToast('online'); 
        checkHealth();
        
        const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (rawSettings) {
            const parsed = JSON.parse(rawSettings);
            if (parsed.data?.autoSync) {
                processQueue(true);
            }
        }
    };
    const hOffline = () => { 
        setIsOnline(false); 
        setServerReachable(false);
        setShowToast('offline'); 
    };
    
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    
    if (navigator.onLine) {
        checkHealth();
        const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (rawSettings) {
            const parsed = JSON.parse(rawSettings);
            if (parsed.data?.autoSync) {
                processQueue();
            }
        }
    }

    const interval = setInterval(() => {
        if (navigator.onLine) {
            const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (rawSettings) {
                const parsed = JSON.parse(rawSettings);
                if (parsed.data?.autoSync) {
                    processQueue();
                }
            }
        }
    }, 15000);

    return () => { 
      window.removeEventListener('online', hOnline); 
      window.removeEventListener('offline', hOffline); 
      clearInterval(interval);
    };
  }, [processQueue, checkHealth]);

  const addToQueue = async (type: QueueActionType, data: any) => {
    await db.offline_queue.add({ 
      type, 
      data, 
      timestamp: Date.now(),
      retries: 0,
      retryCount: 0
    });
    setPendingCount(prev => prev + 1);
    if (navigator.onLine) {
        const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (rawSettings && JSON.parse(rawSettings).data?.autoSync) {
            setTimeout(() => processQueue().catch(console.error), 500);
        }
    }
  };

  const getToastStyles = () => {
    switch(showToast) {
      case 'offline': case 'error': return 'bg-red-500 text-white border-red-600';
      case 'online': case 'success': return 'bg-green-500 text-white border-green-600';
      default: return 'bg-primary text-background border-primary/20';
    }
  };

  const getToastIcon = () => {
    switch(showToast) {
      case 'offline': return <WifiOff size={18} />;
      case 'syncing': return <RefreshCw className="animate-spin" size={18} />;
      case 'error': return <AlertCircle size={18} />;
      case 'success': case 'online': return <CheckCircle2 size={18} />;
      default: return <Wifi size={18} />;
    }
  };

  return (
    <NetworkContext.Provider value={{ 
        isOnline, 
        serverReachable,
        connectionStatus: !isOnline ? 'offline' : (!serverReachable ? 'unreachable' : 'online'),
        addToQueue, 
        processQueue, 
        syncInProgress, 
        pendingCount, 
        lastSyncError, 
        lastSyncTime 
    }}>
      {children}
      {showToast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border transition-all duration-300 ${getToastStyles()}`}>
          {getToastIcon()}
          <div className="flex flex-col">
             <span className="font-bold text-sm uppercase tracking-wider">{t(showToast)}</span>
             {showToast === 'error' && lastSyncError && <span className="text-[10px] opacity-80 max-w-[200px] truncate">{lastSyncError}</span>}
          </div>
        </div>
      )}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork error');
  return context;
};