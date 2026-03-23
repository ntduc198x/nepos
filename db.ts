
import Dexie from 'dexie';
import type { Table } from 'dexie';
import { Order, OrderItem, MenuItem } from './types';
import { AuditLogItem } from './types/settingsTypes';
import { TaxConfig, TaxPeriodClosing, TaxExport, TaxLedgerEntry, ExpenseEntry } from './types/taxTypes';

export type QueueActionType = 
  | 'new_order' 
  | 'update_order' 
  | 'update_order_items' 
  | 'menu_upsert' 
  | 'menu_update' 
  | 'menu_delete'
  | 'audit_log'
  | 'table_layout_sync'
  | 'table_delete'
  | 'tax_config_sync'
  | 'tax_closing_sync'
  | 'tax_ledger_sync'
  | 'expense_sync';

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
  tax_configs: Table<TaxConfig, string>;
  tax_period_closings: Table<TaxPeriodClosing, string>;
  tax_exports: Table<TaxExport, string>;
  tax_ledger_entries: Table<TaxLedgerEntry, number>;
  expense_entries: Table<ExpenseEntry, number>;
};

// Version 16: Added tax_ledger_entries and expense_entries
db.version(16).stores({
  orders: 'id, status, created_at, updated_at, table_id, sync_status, store_id',
  order_items: 'id, order_id, menu_item_id',
  pos_tables: 'id, label, status',
  menu_items: 'id, category, name, sync_status',
  offline_queue: '++id, type, timestamp',
  settings: 'key',
  audit_logs: 'id, action, actor_role, created_at, synced_at',
  tax_configs: 'store_id',
  tax_period_closings: 'id, store_id, period_key, period_start',
  tax_exports: 'id, store_id, created_at',
  tax_ledger_entries: '++id, store_id, business_date, order_id, type, [business_date+store_id]',
  expense_entries: '++id, store_id, expense_date, category, [expense_date+store_id]'
});

export { db };
