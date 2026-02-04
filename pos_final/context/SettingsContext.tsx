
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { 
  AppSettings, 
  SettingKey, 
  AuditLogItem, 
  SettingsStoreState, 
  SettingWarning, 
  FeatureKey, 
  SensitiveActionKey,
  ScenarioTestResult,
  SettingsContextValue,
  SaveStatus
} from '../types/settingsTypes';
import { useTheme } from '../ThemeContext';
import { SettingsService, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SETTINGS_VERSION } from '../services/SettingsService';
import { useAuth } from '../AuthContext';
import { useToast } from './ToastContext';
import { PinModal } from '../components/PinModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { playBeep } from '../services/SoundService';
import { db } from '../db';
import { useNetwork } from './NetworkContext';

// --- PRESETS ---
export const SETTINGS_PRESETS: Record<string, { label: string; desc: string; patch: Partial<AppSettings> }> = {
  cafe_fast: {
    label: 'Cafe / Fast Food',
    desc: 'Gọi món nhanh, thanh toán trước, không quản lý bàn chi tiết.',
    patch: {
      quickOrder: true,
      defaultOrderType: 'takeaway',
      enableTableMap: false,
      enableAreas: false,
      allowSplitBill: false,
      autoPrint: true,
      requireShiftClose: true
    }
  },
  restaurant_table: {
    label: 'Nhà hàng (Full Service)',
    desc: 'Quy trình chuẩn: Xếp bàn -> Gọi món -> Ăn -> Thanh toán.',
    patch: {
      quickOrder: false,
      defaultOrderType: 'dine-in',
      enableTableMap: true,
      enableAreas: true,
      allowSplitBill: true,
      allowMergeBill: true,
      tableTimeAlert: true,
      printItemNotes: true
    }
  },
  takeaway_delivery: {
    label: 'Kiosk / Takeaway',
    desc: 'Chỉ bán mang về, tối giản quy trình, không sơ đồ bàn.',
    patch: {
      quickOrder: true,
      defaultOrderType: 'takeaway',
      enableTableMap: false,
      enableAreas: false,
      tableTimeAlert: false,
      allowSplitBill: false,
      allowMergeBill: false,
      showQr: true
    }
  }
};

// --- ACTION PERMISSION MAP ---
const ACTION_PERMISSION_MAP: Record<string, keyof AppSettings> = {
  'cancel_order': 'allowCancelOrder',
  'delete_order': 'allowCancelOrder',
  'cancel_item': 'allowCancelItem',
  'void_item': 'allowCancelItem',
  'discount_apply': 'allowDiscount',
  'bill_split': 'allowSplitBill',
  'refund': 'allowRefund',
  'open_cash_drawer': 'allowRefund',
  'reprint_receipt': 'reprintOnEdit',
  'export_data': 'allowExport',
};

// --- HELPER: RULES ENGINE ---
function computeWarningsAndAutoFix(settings: AppSettings): { fixed: Partial<AppSettings>; warnings: SettingWarning[] } {
  const fixed: Partial<AppSettings> = {};
  const warnings: SettingWarning[] = [];

  if (!settings.enableTableMap) {
    if (settings.enableAreas) fixed.enableAreas = false;
    if (settings.tableTimeAlert) fixed.tableTimeAlert = false;
  }
  
  if (!settings.enableDiscount) {
    if (settings.maxDiscountPercent !== 0) fixed.maxDiscountPercent = 0;
  } else {
    if (settings.maxDiscountPercent < 0) fixed.maxDiscountPercent = 0;
    if (settings.maxDiscountPercent > 100) fixed.maxDiscountPercent = 100;
  }

  return { fixed, warnings };
}

interface ExtendedContextValue {
  settings: AppSettings;
  saveStatus: SaveStatus;
  state: SettingsStoreState;
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
  verifyMasterPin: (pin: string) => Promise<boolean>;
}

const SettingsContext = createContext<ExtendedContextValue | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setLanguage, setThemeConfig } = useTheme(); 
  const { role: userRole, user } = useAuth();
  const { showToast } = useToast();
  const { addToQueue } = useNetwork();
  
  const [pinModalState, setPinModalState] = useState<{
    isOpen: boolean;
    title: string;
    resolve: ((pin: string | null) => void) | null;
  }>({ isOpen: false, title: '', resolve: null });

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    resolve: ((confirmed: boolean) => void) | null;
  }>({ isOpen: false, title: '', message: '', resolve: null });

  const [state, setState] = useState<SettingsStoreState>(() => {
    const raw = SettingsService.loadStore();
    const { settings, version } = SettingsService.loadAndMigrate();
    const { fixed, warnings } = computeWarningsAndAutoFix(settings);
    const finalSettings = { ...settings, ...fixed };
    const printer = SettingsService.checkPrinterConnection(finalSettings);
    
    console.log(`[SETTINGS_INIT] Loaded version ${version} (Global)`);

    return {
      settings: finalSettings,
      version,
      warnings,
      isOnline: navigator.onLine,
      pendingSyncCount: 0,
      printer: printer,
      saveStatus: 'idle',
      lastSavedAt: raw?.lastSavedAt
    };
  });

  useEffect(() => {
    const { settings, version } = SettingsService.loadAndMigrate();
    const { fixed, warnings } = computeWarningsAndAutoFix(settings);
    const finalSettings = { ...settings, ...fixed };
    const printer = SettingsService.checkPrinterConnection(finalSettings);

    console.log(`[SETTINGS_REFRESH] Auth changed. Reloaded Global settings.`);

    setState(prev => ({
        ...prev,
        settings: finalSettings,
        version,
        warnings,
        printer,
        saveStatus: 'idle'
    }));
  }, [user?.id]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSettings = useCallback((currentState: SettingsStoreState) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

    setState(prev => ({ ...prev, saveStatus: 'saving' }));

    saveTimerRef.current = setTimeout(() => {
      try {
        const payload = {
          version: currentState.version,
          data: currentState.settings, 
          lastSavedAt: new Date().toISOString(),
          printer: currentState.printer 
        };
        SettingsService.saveStore(payload);
        
        setState(prev => ({ ...prev, saveStatus: 'saved', lastSavedAt: payload.lastSavedAt }));
        statusTimerRef.current = setTimeout(() => {
          setState(prev => ({ ...prev, saveStatus: 'idle' }));
        }, 1200);
      } catch (e) {
        console.error('Settings save failed:', e);
        setState(prev => ({ ...prev, saveStatus: 'error' }));
      }
    }, 500);
  }, []);

  const requestPin = useCallback((title: string) => {
    return new Promise<string | null>((resolve) => {
      setPinModalState({ isOpen: true, title, resolve });
    });
  }, []);

  const handlePinSubmit = useCallback((pin: string) => {
    if (pinModalState.resolve) pinModalState.resolve(pin);
    setPinModalState({ isOpen: false, title: '', resolve: null });
  }, [pinModalState]);

  const handlePinCancel = useCallback(() => {
    if (pinModalState.resolve) pinModalState.resolve(null);
    setPinModalState({ isOpen: false, title: '', resolve: null });
  }, [pinModalState]);

  const requestConfirm = useCallback((config: { title: string, message: string, confirmText?: string, isDanger?: boolean }) => {
    return new Promise<boolean>((resolve) => {
        setConfirmModalState({
            isOpen: true,
            title: config.title,
            message: config.message,
            confirmText: config.confirmText,
            isDanger: config.isDanger,
            resolve
        });
    });
  }, []);

  const handleConfirmSubmit = useCallback(() => {
      if (confirmModalState.resolve) confirmModalState.resolve(true);
      setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  }, [confirmModalState]);

  const handleConfirmCancel = useCallback(() => {
      if (confirmModalState.resolve) confirmModalState.resolve(false);
      setConfirmModalState(prev => ({ ...prev, isOpen: false }));
  }, [confirmModalState]);

  const can = useCallback((feature: FeatureKey, ctx?: { role?: string }): boolean => {
    const s = state.settings;
    const role = ctx?.role || userRole;

    if (role === 'admin') return true;

    if (feature === 'report.view') {
        if (role === 'manager') return ['manager', 'all'].includes(s.reportAccess);
        if (role === 'staff') return s.reportAccess === 'all';
        return false;
    }

    let mappedFeature = feature;
    if (feature === 'order.delete') mappedFeature = 'order.cancel';

    if (role === 'staff') {
        if (['menu.crud', 'table.edit_layout', 'report.view_staff', 'settings.all', 'settings.view_print', 'report.export'].includes(mappedFeature)) {
            return false; 
        }
    }
    if (role === 'manager') {
        if (['table.edit_layout', 'report.view_staff', 'settings.all', 'report.export'].includes(mappedFeature)) {
            return false;
        }
        return true; 
    }

    switch (feature) {
      case 'order.quick': return s.quickOrder;
      case 'order.type.dinein': return s.enableTableMap;
      case 'table.map': return s.enableTableMap;
      case 'table.manage': return s.enableTableMap;
      case 'table.areas': return s.enableAreas && s.enableTableMap;
      case 'bill.split': return s.allowSplitBill;
      case 'bill.merge': return s.allowMergeBill;
      case 'discount.apply': return s.enableDiscount && s.allowDiscount;
      case 'report.export': return s.allowExport;
      case 'drawer.open': return s.allowRefund;
      case 'order.void_item': return s.allowCancelItem;
      case 'order.cancel': return s.allowCancelOrder; 
      case 'order.delete': return s.allowCancelOrder;
      case 'print.auto': return s.autoPrint;
      case 'print.reprint': return s.reprintOnEdit;
      default: return true;
    }
  }, [state.settings, userRole]);

  const logAuditAction = useCallback(async (
    action: string, 
    details?: string, 
    result: 'success' | 'blocked' | 'failed' = 'success',
    meta: any = {}
  ) => {
    if (userRole === 'admin') return;

    const entry: AuditLogItem = {
      id: self.crypto.randomUUID(),
      action,
      actor_role: userRole || 'system',
      actor_id: user?.id,
      device_id: SettingsService.getDeviceId(),
      created_at: new Date().toISOString(),
      entity_type: meta?.entity_type,
      meta: { details, ...meta },
      result,
      synced_at: null
    };
    
    try {
      await db.audit_logs.add(entry);
      if (state.settings.logSensitiveActions) {
          await addToQueue('audit_log', { log: entry });
      }
    } catch (e) {
      console.error("Failed to write/queue audit log:", e);
    }
  }, [userRole, user, state.settings.logSensitiveActions, addToQueue]);

  // --- REFACTORED GUARD SENSITIVE (Role & Server-Validated PIN) ---
  const guardSensitive = useCallback(async (
    action: SensitiveActionKey, 
    fn: () => Promise<any> | any, 
    meta?: { 
        confirm?: { title: string, message: string, confirmText?: string, isDanger?: boolean },
        [key: string]: any 
    }
  ): Promise<{ ok: boolean; reason?: string }> => {
    const s = state.settings;
    const actionStr = String(action);
    
    console.groupCollapsed(`[GUARD] Action: ${actionStr} | Role: ${userRole}`);
    
    // --- 1. ADMIN BYPASS ---
    if (userRole === 'admin') {
        console.log(`[GUARD_DECISION] Admin Bypass.`);
    } 
    else {
        // --- 2. PERMISSION MAPPING ---
        let isPermissionGranted = true;
        let blockedReason = 'NOT_ALLOWED';
        
        const permKey = ACTION_PERMISSION_MAP[actionStr];
        let settingValue = true; 

        if (permKey) {
            settingValue = !!s[permKey]; 
            if (actionStr === 'discount_apply' && !s.enableDiscount) {
                settingValue = false;
            }
            isPermissionGranted = settingValue;
        }

        if (userRole === 'manager') {
            if (['cancel_order', 'delete_order', 'cancel_item', 'void_item'].includes(actionStr)) {
                isPermissionGranted = true;
            }
        }

        if (userRole === 'staff' && ['factory_reset', 'modify_system_settings', 'export_data'].includes(actionStr)) {
            isPermissionGranted = false;
        }

        if (!isPermissionGranted) {
            const msg = `Bạn không có quyền thực hiện thao tác này.`;
            console.warn(`[GUARD_DECISION] Blocked. Reason: ${blockedReason}`);
            showToast(msg, 'error');
            if (s.soundEffect) playBeep('error');
            logAuditAction(actionStr, `Blocked: ${msg}`, 'blocked', meta);
            console.groupEnd();
            return { ok: false, reason: blockedReason };
        }

        // --- 3. PIN REQUIREMENT CHECK ---
        let pinRequired = false;
        
        const isCancelOrder = ['cancel_order', 'delete_order'].includes(actionStr);
        const isVoidItem = ['cancel_item', 'void_item'].includes(actionStr);
        const isDiscount = actionStr === 'discount_apply';
        const isReprint = actionStr === 'reprint_receipt';
        
        if (userRole === 'staff') {
            if (isCancelOrder || isVoidItem || isDiscount || isReprint) {
                pinRequired = true;
            }
        } 
        else if (userRole === 'manager') {
            if (isCancelOrder && s.managerRequirePinCancelOrder) pinRequired = true;
            else if (isVoidItem && s.managerRequirePinCancelItem) pinRequired = true;
            else if (isDiscount && s.managerRequirePinDiscount) pinRequired = true;
            else if (isReprint && s.managerRequirePinReprint) pinRequired = true;
        }

        console.log(`[GUARD_DECISION] Permission OK. Pin Required: ${pinRequired}`);

        // --- 4. EXECUTE PIN CHALLENGE ---
        if (pinRequired) {
            console.log(`[PIN_MODAL] Opening for action=${actionStr}`);
            
            const promptTitle = userRole === 'staff' 
                ? "YÊU CẦU MÃ PIN" 
                : "XÁC NHẬN MÃ PIN";

            const input = await requestPin(promptTitle);
            
            if (input === null) {
                console.log(`[PIN_MODAL] User cancelled.`);
                logAuditAction(actionStr, 'User cancelled PIN entry', 'blocked', meta);
                console.groupEnd();
                return { ok: false, reason: 'CANCELLED' };
            }

            // Verify using Server Check (DB)
            const isValid = await SettingsService.verifyPin(input, user);
            
            if (!isValid) {
                console.log(`[PIN_MODAL] Wrong PIN (Server Check Failed).`);
                logAuditAction(actionStr, 'Invalid PIN entered', 'blocked', meta);
                showToast("Sai mã PIN!", 'error');
                if (s.soundEffect) playBeep('error');
                console.groupEnd();
                return { ok: false, reason: 'PIN_INVALID' };
            }
            console.log(`[PIN_MODAL] Success.`);
        }
    }

    // --- 5. CONFIRMATION CHECK (Global) ---
    if (meta && meta.confirm) {
        console.log(`[CONFIRM_MODAL] Opening for action=${actionStr}`);
        const confirmed = await requestConfirm({
            title: meta.confirm.title,
            message: meta.confirm.message,
            confirmText: meta.confirm.confirmText || 'Xác nhận',
            isDanger: meta.confirm.isDanger
        });

        if (!confirmed) {
            console.log(`[CONFIRM_MODAL] User cancelled.`);
            console.groupEnd();
            return { ok: false, reason: 'USER_CANCELLED_CONFIRM' };
        }
    }

    // --- 6. EXECUTION ---
    try {
      console.log(`[GUARD] Executing action...`);
      const result = await fn();
      logAuditAction(actionStr, 'Executed successfully', 'success', meta);
      console.groupEnd();
      return { ok: true, ...result };
    } catch (e: any) {
      console.error(`[GUARD] Execution exception:`, e);
      if (s.soundEffect) playBeep('error');
      logAuditAction(actionStr, `Failed: ${e.message}`, 'failed', meta);
      console.groupEnd();
      return { ok: false, reason: 'EXECUTION_FAILED' };
    }
  }, [state.settings, logAuditAction, userRole, can, showToast, requestPin, requestConfirm, user]);

  const updateStore = useCallback((partialSettings: Partial<AppSettings>, source: 'ui' | 'rule' | 'migration' = 'ui') => {
    setState(prev => {
      const rawNextSettings = { ...prev.settings, ...partialSettings };
      const { fixed, warnings } = computeWarningsAndAutoFix(rawNextSettings);
      const finalSettings = { ...rawNextSettings, ...fixed };
      const nextPrinter = (partialSettings.printerName || partialSettings.printMethod || source === 'ui') 
        ? SettingsService.checkPrinterConnection(finalSettings) 
        : prev.printer;

      const nextState = { ...prev, settings: finalSettings, warnings, printer: nextPrinter };
      setTimeout(() => persistSettings(nextState), 0);
      return nextState;
    });
  }, [persistSettings]);

  useEffect(() => {
    const cleanupAudit = async () => {
        try {
            const retentionDays = parseInt(state.settings.logRetention || '30');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffIso = cutoffDate.toISOString();
            await db.audit_logs.where('created_at').below(cutoffIso).delete();
        } catch (e) {
            console.error("Audit log cleanup failed:", e);
        }
    };
    cleanupAudit();
  }, [state.settings.logRetention]);

  const setSetting = useCallback(<K extends SettingKey>(key: K, value: AppSettings[K]) => updateStore({ [key]: value }), [updateStore]);
  const bulkSet = useCallback((partial: Partial<AppSettings>) => updateStore(partial), [updateStore]);
  const resetSettings = useCallback(() => updateStore(DEFAULT_SETTINGS), [updateStore]);
  // Updated verifyMasterPin to verifyUserPin async logic wrapper
  const verifyMasterPin = useCallback(async (pin: string) => SettingsService.verifyPin(pin, user), [user]);
  const runScenarioTests = useCallback(async () => SettingsService.runScenarioTestsServices(state), [state]);
  const saveNow = useCallback(async () => persistSettings(state), [state, persistSettings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('pos-font-small', 'pos-font-medium', 'pos-font-large');
    root.classList.add(`pos-font-${state.settings.uiFontSize}`);
    root.classList.remove('pos-density-compact', 'pos-density-medium', 'pos-density-spacious');
    root.classList.add(`pos-density-${state.settings.uiDensity}`);
    root.classList.toggle('pos-contrast', !!state.settings.highContrast);
  }, [state.settings.uiFontSize, state.settings.uiDensity, state.settings.highContrast]);

  useEffect(() => {
    setThemeConfig({
      mode: state.settings.theme as 'light' | 'dark' | 'system',
      scheduleEnabled: state.settings.themeScheduleEnabled,
      dayStart: state.settings.themeDayStart,
      nightStart: state.settings.themeNightStart
    });
  }, [state.settings.theme, state.settings.themeScheduleEnabled, state.settings.themeDayStart, state.settings.themeNightStart, setThemeConfig]);

  useEffect(() => { setLanguage(state.settings.language as 'en' | 'vi'); }, [state.settings.language, setLanguage]);

  return (
    <SettingsContext.Provider value={{ state, settings: state.settings, saveStatus: state.saveStatus, updateSetting: setSetting, applySettingsPatch: bulkSet, logAuditAction, setSetting, bulkSet, resetSettings, can, guardSensitive, runScenarioTests, migrateIfNeeded: () => {}, saveNow, verifyMasterPin }}>
      {children}
      {pinModalState.isOpen && (
        <PinModal 
          title={pinModalState.title} 
          onSubmit={handlePinSubmit} 
          onCancel={handlePinCancel} 
        />
      )}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
        isDanger={confirmModalState.isDanger}
        onConfirm={handleConfirmSubmit}
        onClose={handleConfirmCancel}
      />
    </SettingsContext.Provider>
  );
};

export const useSettingsContext = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettingsContext must be used within SettingsProvider');
  return context;
};
export const useSettings = useSettingsContext;
