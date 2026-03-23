
export interface MenuItem {
  id: number | string;
  name: string;
  price: number;
  category: string;
  image?: string;
  stock: number;
  description?: string;
  uid?: string;
  sync_status?: string;
}

export interface TableData {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rect' | 'round' | 'square';
  seats: number;
  status: 'Available' | 'Occupied' | 'Reserved';
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: number | string;
  quantity: number;
  price: number;
  note?: string;
  status?: 'pending' | 'cooking' | 'served';
  snapshot_name?: string; 
  // UI & Legacy Properties
  name?: string;
  _display_name?: string;
  _display_price?: number;
}

export interface Order {
  id: string;
  table_id: string;
  table?: string; // Legacy support
  store_id?: string; // Added for Multi-tenancy
  status: 'Pending' | 'Cooking' | 'Ready' | 'Completed' | 'Cancelled';
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  staff_name?: string;
  payment_method?: 'Cash' | 'Card' | 'Transfer';
  user_id?: string;
  note?: string;
  guests?: number;
  subtotal?: number;
  subtotal_amount?: number;
  discount_amount?: number;
  discount_type?: 'percent' | 'amount';
  discount_value?: number;
  updated_at?: string;
  payment_parts?: { amount: number; method?: string; created_at?: string }[];
  // Legacy Properties
  total?: number;
  staff?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  price: number;
  threshold: number;
  status: 'Good' | 'Low' | 'Critical';
  max_stock?: number;
  store_id?: string;
}

// Added 'tax' to View type
export type View = 'dashboard' | 'menu' | 'floorplan' | 'inventory' | 'settings' | 'login' | 'reports' | 'tax';
