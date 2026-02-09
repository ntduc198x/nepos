
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { Order, OrderItem, MenuItem } from './types';
import { AuditLogItem } from './types/settingsTypes';

export type QueueActionType = 
  | 'new_order' 
  | 'update_order' 
  | 'update_order_items' 
  | 'menu_upsert' 
  | 'menu_update' 
  | 'menu_delete'
  | 'audit_log'
  | 'table_layout_sync'
  | 'table_delete';

export interface OfflineQueueItem {
  id?: number;
  type: QueueActionType;
  data: any;
  timestamp: number;
  retries: number;
  retryCount?: number;
  lastError?: string;
}

interface SettingItem {
  key: string;
  value: any;
}

// Use functional instantiation with intersection type to ensure Dexie methods are recognized
const db = new Dexie('ResBarDB') as Dexie & {
  orders: Table<any, string>; // Use any to allow canonical fields
  order_items: Table<OrderItem, string>;
  pos_tables: Table<any, string>;
  menu_items: Table<MenuItem, number | string>;
  offline_queue: Table<OfflineQueueItem, number>;
  settings: Table<SettingItem, string>;
  audit_logs: Table<AuditLogItem, string>;
};

// Version 13: Added audit_logs
db.version(13).stores({
  orders: 'id, status, created_at, updated_at, table_id, sync_status',
  order_items: 'id, order_id, menu_item_id',
  pos_tables: 'id, label, status',
  menu_items: 'id, category, name, sync_status',
  offline_queue: '++id, type, timestamp',
  settings: 'key',
  audit_logs: 'id, action, actor_role, created_at, synced_at'
});

export { db };