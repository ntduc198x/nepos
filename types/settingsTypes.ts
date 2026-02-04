
export type SettingControlType = 
  | 'toggle' 
  | 'input' 
  | 'select' 
  | 'button' 
  | 'action-danger' 
  | 'info' 
  | 'preset-grid'
  | 'custom-bank-setup'
  | 'custom-user-management'; // Added

export interface SettingOption {
  label: string;
  value: string | number;
}

export interface AppSettings {
  presetId?: string;
  
  // Store
  counterName?: string;
  counterAddress?: string;
  counterPhone?: string;
  receiptNote?: string;
  wifiName?: string;
  wifiPassword?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  serviceMode?: string;

  // Flow
  quickOrder: boolean;
  defaultOrderType: 'dine-in' | 'takeaway' | 'delivery';
  confirmCancelItem: boolean;
  allowSplitBill: boolean;
  allowMergeBill: boolean;
  enableDiscount: boolean;
  maxDiscountPercent: number;
  enableTableMap: boolean;
  enableAreas: boolean;
  tableTimeAlert: boolean;
  tableTimeLimit: number;
  autoNewOrder: boolean;
  confirmCancelOrder: boolean;
  serviceFee: number;
  roundingMode: string;

  // Print
  printerName: string;
  printMethod: string;
  paperSize: string;
  autoPrint: boolean;
  autoPrintReceipt: boolean;
  printTemp: boolean;
  reprintOnEdit: boolean;
  showQr: boolean;
  showStoreInfo: boolean;
  receiptFontSize: string;
  printItemNotes: boolean;

  // Permissions
  allowDiscount: boolean;
  allowCancelItem: boolean;
  allowCancelOrder: boolean;
  allowRefund: boolean;
  allowPriceEdit: boolean;
  requirePinSensitive: boolean;
  requireStaffSelect: boolean;
  autoLogoutShift: boolean;

  // Security - Master PIN removed in favor of User PINs
  // masterPin: string; // Deprecated
  managerRequirePinCancelOrder: boolean;
  managerRequirePinCancelItem: boolean;
  managerRequirePinDiscount: boolean;
  managerRequirePinReprint: boolean;

  // UI
  theme: string;
  themeScheduleEnabled: boolean;
  themeDayStart: string;
  themeNightStart: string;
  uiDensity: string;
  uiFontSize: string;
  highContrast: boolean;
  singleTapAdd: boolean;
  soundEffect: boolean;
  enableShortcuts: boolean;
  tabletMode: boolean;
  hapticFeedback: boolean;
  autoFocusSearch: boolean;
  disableAnimation: boolean;
  language: string;

  // System
  reportAccess: string;
  logSensitiveActions: boolean;
  logShiftChanges: boolean;
  logRetention: string;
  alertHighDiscount: boolean;
  highDiscountThreshold: number;
  alertCancel: boolean;
  requireShiftClose: boolean;
  requireCashCount: boolean;
  hideRevenue: boolean;
  allowExport: boolean;
  lockOrderCompleted: boolean;
  unlockByOwnerPin: boolean;
  editTimeLimit: string;
  alertPriceEdit: boolean;
  alertReprint: boolean;
  logHistory: boolean;
  autoSync: boolean;
  lastSyncTime: string;
  allowOfflineSale: boolean;
  autoBackup: boolean;
  backupFreq: string;
  autoLogoutIdle: boolean;
  idleTime: string;
}

export type SettingKey = keyof AppSettings;

export interface SettingItemConfig {
  id: string;
  label: string;
  subtitle?: string;
  type: SettingControlType;
  valueKey?: SettingKey | string;
  options?: SettingOption[];
  actionId?: string;
  inputType?: 'text' | 'number' | 'password' | 'email' | 'tel' | 'time';
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  danger?: boolean;
  confirmMessage?: string;
  variant?: 'primary' | 'secondary';
  tags?: string[];
  placeholder?: string;
}

export interface SettingSectionConfig {
  title: string;
  items: SettingItemConfig[];
}

export interface SettingCardConfig {
  id: string;
  title: string;
  description: string;
  icon: any;
  sections: SettingSectionConfig[];
}

export type FeatureKey = 
  | 'report.view' 
  | 'report.export' 
  | 'report.view_staff'
  | 'menu.crud' 
  | 'table.edit_layout' 
  | 'settings.all' 
  | 'settings.view_print' 
  | 'order.quick' 
  | 'order.type.dinein' 
  | 'table.map' 
  | 'table.manage' 
  | 'table.areas' 
  | 'bill.split' 
  | 'bill.merge' 
  | 'discount.apply' 
  | 'drawer.open' 
  | 'order.void_item' 
  | 'order.cancel' 
  | 'order.delete' 
  | 'print.auto' 
  | 'print.reprint';

export type SensitiveActionKey = 
  | 'cancel_order' 
  | 'delete_order' 
  | 'cancel_item' 
  | 'void_item' 
  | 'discount_apply' 
  | 'bill_split' 
  | 'refund' 
  | 'open_cash_drawer' 
  | 'reprint_receipt' 
  | 'export_data' 
  | 'factory_reset' 
  | 'modify_system_settings';

export type PrintAction = 
  | 'TEMP_ON_CREATE' 
  | 'REPRINT_ON_EDIT' 
  | 'FINAL_ON_PAYMENT' 
  | 'TEST_PRINT';

export type PrinterConnectionStatus = 'ready' | 'unknown' | 'connected' | 'disconnected';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type SystemStatus = 'active' | 'warning' | 'error';

export interface AuditLogItem {
  id: string;
  action: string;
  actor_role: string;
  actor_id?: string;
  device_id: string;
  created_at: string;
  entity_type?: string;
  meta?: any;
  result: 'success' | 'blocked' | 'failed';
  synced_at: string | null;
}

export interface ScenarioTestResult {
  id: string;
  name: string;
  status: 'success' | 'warning' | 'failed';
  message: string;
  logs?: string[];
}

export interface PrintResult {
  ok: boolean;
  executed: boolean;
  action: PrintAction;
  reason: string;
  message?: string;
  html?: string;
}

export interface SettingWarning {
  key: string;
  message: string;
}

export interface SettingsStoreState {
  settings: AppSettings;
  version: number;
  warnings: SettingWarning[];
  isOnline: boolean;
  pendingSyncCount: number;
  printer: {
    connected: boolean;
    mode: 'sandbox' | 'real';
    status: PrinterConnectionStatus;
    name?: string;
    paperSize?: string;
    lastCheckAt: string;
  };
  saveStatus: SaveStatus;
  lastSavedAt?: string;
}

export interface SettingsContextValue {
  state: SettingsStoreState;
  settings: AppSettings;
  saveStatus: SaveStatus;
  updateSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => void;
  applySettingsPatch: (patch: Partial<AppSettings>) => void;
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => void;
  bulkSet: (patch: Partial<AppSettings>) => void;
  logAuditAction: (action: string, details?: string, result?: 'success' | 'blocked' | 'failed', meta?: any) => Promise<void>;
  resetSettings: () => void;
  can: (feature: FeatureKey, ctx?: { role?: string }) => boolean;
  guardSensitive: (action: SensitiveActionKey, fn: () => Promise<any> | any, meta?: any) => Promise<{ ok: boolean; reason?: string }>;
  runScenarioTests: () => Promise<ScenarioTestResult[]>;
  migrateIfNeeded: () => void;
  saveNow: () => Promise<void>;
  verifyMasterPin: (pin: string) => Promise<boolean>; // Changed to Promise
}
