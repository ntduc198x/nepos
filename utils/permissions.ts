
import { UserRole } from '../AuthContext';

export const PERMISSIONS = {
  // Tax
  TAX_VIEW: 'tax.view',
  TAX_CLOSE: 'tax.close',
  TAX_EXPORT: 'tax.export',
  
  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_SENSITIVE: 'settings.sensitive', // e.g. Factory Reset, Bank Config
  
  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_EDIT: 'inventory.edit',
  
  // Orders
  ORDER_VOID: 'order.void',
  ORDER_DISCOUNT: 'order.discount',
  ORDER_REFUND: 'order.refund',
};

type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: Object.values(PERMISSIONS), // Admin has all
  manager: [
    PERMISSIONS.TAX_VIEW,
    PERMISSIONS.TAX_EXPORT,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.ORDER_VOID,
    PERMISSIONS.ORDER_DISCOUNT,
    PERMISSIONS.ORDER_REFUND,
  ],
  staff: [
    // Staff has very limited permissions
    // Usually just basic POS operations which are default allowed
  ]
};

export const can = (role: UserRole, action: Permission): boolean => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(action);
};
