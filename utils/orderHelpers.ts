
import { MenuItem, TableData, Order, OrderItem } from '../types';

/**
 * Check if an order is in an active state where items can be added or payment processed.
 */
export const isOrderActive = (status?: string) => {
  return ['Pending', 'Cooking', 'Ready'].includes(status || '');
};

/**
 * Helper to get a human-readable table label from an order and the tables list
 */
export const getTableLabel = (order: any, tables: TableData[]) => {
  if (!order) return '';
  if (order.table_id === 'Takeaway') return 'Takeaway';
  
  const table = tables.find(t => String(t.id) === String(order.table_id));
  return table?.label || order.table || order.table_id || 'Unknown';
};

/**
 * Calculate total amount paid so far from payment parts
 */
export const getPaidAmount = (order: Order): number => {
  if (!order.payment_parts || !Array.isArray(order.payment_parts)) return 0;
  return order.payment_parts.reduce((sum, part) => sum + (part.amount || 0), 0);
};

/**
 * Standardize note string for comparison
 */
export const normalizeNote = (note?: string): string => {
  return (note || "").trim();
};

/**
 * Core Logic: Merges a list of items based on menu_item_id and normalized note.
 * - STRICT RULE: Does NOT generate 'id'. Keeps existing ID if available.
 * - Sums quantities.
 */
export const mergeOrderItems = (items: any[]): any[] => {
  if (!items || !Array.isArray(items)) return [];

  const map = new Map<string, any>();

  // Helper to generate a unique key for grouping
  const getKey = (item: any) => `${item.menu_item_id}_${normalizeNote(item.note)}`;

  items.forEach(item => {
    // Require menu_item_id
    if (!item.menu_item_id) return;

    const key = getKey(item);
    const qty = Number(item.quantity || item.qty || 0);
    const price = Number(item.price || 0);

    if (map.has(key)) {
      const existing = map.get(key);
      existing.quantity += qty;
    } else {
      // Clone to avoid mutation side-effects
      // STRICT: Do NOT generate randomUUID here. 
      // If item comes from DB, it has id. If from UI (new), it has no id.
      map.set(key, {
        ...item,
        quantity: qty,
        price: price,
        note: normalizeNote(item.note)
      });
    }
  });

  return Array.from(map.values());
};

/**
 * Helper: Normalization (Legacy wrapper)
 */
export const getNormalizedItems = (order: any) => {
  if (!order) return [];
  const rawItems = order.order_items || order.items || [];
  return Array.isArray(rawItems) ? rawItems : [];
};

/**
 * Helper: Enrichment for UI Display
 * - Generates _client_id for React keys
 * - Does NOT mutate persistence 'id'
 */
export const enrichOrderDetails = (order: any, menuItems: MenuItem[]) => {
  if (!order) return { items: [], totalAmount: 0 };
  
  // Use merge logic to ensure display is clean even if DB has duplicates
  const rawItems = mergeOrderItems(getNormalizedItems(order));
  let totalAmount = 0;

  const enrichedItems = rawItems.map((item: any) => {
    const menuId = item.menu_item_id;
    // Fallback logic for display name only
    const menuRef = (menuItems || []).find(m => String(m.id) === String(menuId));

    const price = Number(item.price ?? menuRef?.price ?? 0);
    const quantity = Number(item.quantity || item.qty || 1);
    const lineTotal = price * quantity;
    
    totalAmount += lineTotal;

    const displayName = item.snapshot_name || item._snapshot_name || item.name || menuRef?.name || `Món #${menuId}`;

    return {
      ...item,
      // Maintain existing ID if present (from DB), else undefined.
      // Generate ephemeral client ID for UI rendering.
      _client_id: item.id || self.crypto.randomUUID(),
      menu_item_id: menuId,
      quantity,
      price: price,
      _display_name: displayName,
      _display_price: price,
      _total_line: lineTotal
    };
  });

  return {
    items: enrichedItems,
    totalAmount: totalAmount
  };
};

// --- Canonical Mappers (Moved from SettingsContext to break circular dependency) ---

export type DiscountType = 'percent' | 'amount';

export interface CanonicalOrder {
  id: string;
  table_id: string;
  table?: string;
  status: 'Pending' | 'Cooking' | 'Ready' | 'Completed' | 'Cancelled';
  created_at: string;
  updated_at: string;
  version: number;
  total_amount: number;
  subtotal_amount: number;
  discount_amount: number;
  discount_type?: DiscountType;
  discount_value?: number;
  paid: boolean;
  payment_method?: 'Cash' | 'Card' | 'Transfer';
  staff_name: string;
  user_id?: string;
  guests: number;
  note?: string;
  is_offline?: boolean;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface CanonicalOrderItem {
  id: string;
  order_id: string;
  menu_item_id: number | string;
  snapshot_name: string;
  price: number;
  quantity: number;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export const mapToSupabaseOrder = (local: Partial<CanonicalOrder>) => {
  return {
    id: local.id,
    table_id: local.table_id,
    status: local.status,
    created_at: local.created_at,
    updated_at: new Date().toISOString(),
    version: (local.version || 0) + 1,
    total_amount: local.total_amount,
    subtotal_amount: local.subtotal_amount || local.total_amount,
    discount_amount: local.discount_amount || 0,
    discount_type: local.discount_type,
    discount_value: local.discount_value,
    paid: local.paid,
    payment_method: local.payment_method,
    staff_name: local.staff_name,
    user_id: local.user_id,
    guests: local.guests,
    note: local.note
  };
};

export const mapToSupabaseOrderItem = (local: Partial<CanonicalOrderItem>) => {
  return {
    id: local.id,
    order_id: local.order_id,
    menu_item_id: local.menu_item_id,
    snapshot_name: local.snapshot_name,
    price: local.price,
    quantity: local.quantity,
    note: local.note,
    updated_at: new Date().toISOString()
  };
};
