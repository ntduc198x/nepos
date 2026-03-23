
import { AppSettings, AuditLogItem, SettingsStoreState, ScenarioTestResult, PrintResult, PrintAction, PrinterConnectionStatus } from '../types/settingsTypes';
import { printOrderReceipt, isSandboxed, generateReceiptHTML, printTestTicket, printViaIframe } from './printRuntime';
import { supabase } from '../supabase';

export const SETTINGS_VERSION = 3; 
export const SETTINGS_STORAGE_KEY = 'RESBAR_SETTINGS_STORE';
export const POS_PIN_REGISTRY_KEY = 'POS_PIN_REGISTRY_V2';

export const DEFAULT_SETTINGS: AppSettings = {
  presetId: '', 
  
  // -- Counter Info --
  counterName: '',
  counterAddress: '',
  counterPhone: '',
  receiptNote: '',
  wifiName: '',
  wifiPassword: '',

  quickOrder: false, defaultOrderType: 'dine-in', confirmCancelItem: true,
  allowSplitBill: false, allowMergeBill: true, enableDiscount: true, maxDiscountPercent: 100,
  enableTableMap: true, enableAreas: false, tableTimeAlert: false, tableTimeLimit: 120,
  storeName: 'Nepos Coffee', storeAddress: '', storePhone: '', serviceMode: 'dine-in',
  autoNewOrder: false, confirmCancelOrder: true, serviceFee: 0, roundingMode: 'none',
  printerName: 'Generic Thermal', printMethod: 'browser', paperSize: '80mm', autoPrint: true, autoPrintReceipt: true,
  printTemp: false, reprintOnEdit: true, showQr: true, showStoreInfo: true, receiptFontSize: 'medium',
  printItemNotes: true, allowDiscount: false, allowCancelItem: false, allowCancelOrder: false, allowRefund: false,
  
  // -- PIN Config (Server Controlled) --
  // masterPin removed
  managerRequirePinCancelOrder: false,
  managerRequirePinCancelItem: false,
  managerRequirePinDiscount: false,
  managerRequirePinReprint: false,

  allowPriceEdit: false, requirePinSensitive: false, requireStaffSelect: true, autoLogoutShift: true,
  
  // -- Theme & UI --
  theme: 'system', 
  themeScheduleEnabled: false,
  themeDayStart: '06:00',
  themeNightStart: '18:00',
  
  uiDensity: 'medium', uiFontSize: 'medium', highContrast: false, singleTapAdd: true,
  soundEffect: true, enableShortcuts: true, tabletMode: false, hapticFeedback: true,
  autoFocusSearch: true, disableAnimation: false, language: 'vi', reportAccess: 'owner',
  logSensitiveActions: true, logShiftChanges: true, logRetention: '30', alertHighDiscount: true,
  highDiscountThreshold: 20, alertCancel: true, requireShiftClose: false, requireCashCount: true,
  hideRevenue: false, allowExport: false, lockOrderCompleted: true, unlockByOwnerPin: true,
  editTimeLimit: '15', alertPriceEdit: true, alertReprint: false, logHistory: true, autoSync: true,
  lastSyncTime: '', allowOfflineSale: true, autoBackup: true, backupFreq: 'daily', autoLogoutIdle: false,
  idleTime: '60'
};

export class SettingsService {
  
  private static getKey(): string {
    return `${SETTINGS_STORAGE_KEY}:device_global`;
  }

  public static loadStore(): any | null {
    const key = this.getKey();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed;
      } else {
        const legacyKey = `${SETTINGS_STORAGE_KEY}:guest`;
        const legacyRaw = localStorage.getItem(legacyKey);
        if (legacyRaw) {
             return JSON.parse(legacyRaw);
        }
        return null;
      }
    } catch (e) {
      console.error(`[SETTINGS_LOAD] Failed to parse settings for (${key}). Resetting.`, e);
      return null;
    }
  }

  public static saveStore(payload: { 
    version: number; 
    data: AppSettings; 
    lastSavedAt?: string; 
    printer?: any;
    pendingSyncCount?: number;
    isOnline?: boolean; 
  }): void {
    const key = this.getKey();
    try {
      if (!payload || !payload.data) return;
      const payloadToSave = {
          ...payload,
          printer: {
              ...payload.printer,
              connected: false,
              status: 'unknown'
          }
      };
      const json = JSON.stringify(payloadToSave);
      localStorage.setItem(key, json);
    } catch (e) {
      console.error(`[SETTINGS_SAVE] Failed to save settings to (${key}):`, e);
    }
  }

  public static loadAndMigrate(): { settings: AppSettings, version: number } {
    const raw = SettingsService.loadStore();
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, version: SETTINGS_VERSION };

    let currentData = raw.data || raw.settings || raw;
    let currentVersion = raw.version || 0;

    // --- MIGRATION LOGIC ---
    if (currentData.allowDeleteOrder !== undefined && currentData.allowCancelOrder === undefined) {
        currentData.allowCancelOrder = currentData.allowDeleteOrder;
        delete currentData.allowDeleteOrder;
    }

    const merged = { ...DEFAULT_SETTINGS, ...currentData };
    return { settings: merged, version: Math.max(currentVersion, SETTINGS_VERSION) };
  }

  public static getDeviceId(): string {
    let deviceId = localStorage.getItem('resbar_device_id');
    if (!deviceId) {
      deviceId = self.crypto.randomUUID();
      localStorage.setItem('resbar_device_id', deviceId);
    }
    return deviceId;
  }

  public static applyRules(settings: AppSettings): AppSettings {
    const next = { ...settings };
    if (!next.enableTableMap) {
      next.enableAreas = false;
      next.tableTimeAlert = false;
    }
    if (!next.enableDiscount) {
      next.maxDiscountPercent = 0;
    }
    if (next.requireCashCount) {
      next.logShiftChanges = true;
    }
    return next;
  }

  /**
   * Verified PIN against Local Registry (Offline-first)
   * @param inputPin 4-digit PIN
   * @param currentUser The current authenticated user session
   */
  public static async verifyPin(inputPin: string, currentUser: any, currentRole?: string): Promise<{ ok: boolean; reason?: 'INVALID_PIN' | 'NOT_ALLOWED_FOR_ROLE' | 'IDENTITY_MISMATCH' }> {
    const cleanInput = inputPin.trim();
    if (!/^\d{4}$/.test(cleanInput)) return { ok: false, reason: 'INVALID_PIN' };

    try {
        // Read local registry
        const rawRegistry = localStorage.getItem(POS_PIN_REGISTRY_KEY);
        const registryRaw: Array<{ role: string; email: string; pin: string | number; auth_user_id?: string }> = rawRegistry ? JSON.parse(rawRegistry) : [];
        const registry = (Array.isArray(registryRaw) ? registryRaw : []).map((u) => ({
          ...u,
          role: String(u?.role || '').toLowerCase(),
          email: String(u?.email || '').trim().toLowerCase(),
          pin: String(u?.pin ?? '').trim(),
          auth_user_id: u?.auth_user_id
        }));

        // Find match by PIN (normalize to string to avoid legacy number mismatch)
        const match = registry.find(u => u.pin === cleanInput);

        if (!match) {
            // Best-effort fallback: check server-side user pin (when online/RLS allows)
            try {
              if (navigator.onLine) {
                const { data } = await supabase
                  .from('users')
                  .select('id,email,role,pin_code')
                  .eq('pin_code', cleanInput)
                  .maybeSingle();
                if (data?.pin_code) {
                  const serverRole = String(data.role || '').toLowerCase();
                  const activeRole = String(currentRole || '').toLowerCase();

                  if (serverRole === 'admin') return { ok: true };
                  if (serverRole === 'manager') {
                    if (activeRole === 'admin') return { ok: false, reason: 'NOT_ALLOWED_FOR_ROLE' };
                    return { ok: true };
                  }
                  if (serverRole === 'staff') {
                    const activeEmail = String(currentUser?.email || '').trim().toLowerCase();
                    const serverEmail = String(data.email || '').trim().toLowerCase();
                    if (activeEmail && (activeEmail === serverEmail || currentUser?.id === data.id)) return { ok: true };
                    return { ok: false, reason: 'IDENTITY_MISMATCH' };
                  }
                }
              }
            } catch (e) {
              console.warn('[VERIFY_PIN] Server fallback unavailable:', e);
            }

            console.warn('[VERIFY_PIN] Invalid PIN (Local check)');
            return { ok: false, reason: 'INVALID_PIN' };
        }

        const pinRole = (match.role || '').toLowerCase();
        const activeRole = String(currentRole || '').toLowerCase();
        
        // RULE 1: Admin PIN can be used for ALL users
        if (pinRole === 'admin') {
            return { ok: true };
        }

        // RULE 2: Manager PIN can ONLY be used by Manager or Staff
        if (pinRole === 'manager') {
            if (activeRole === 'admin') {
                console.warn('[VERIFY_PIN] Manager PIN cannot unlock Admin session');
                return { ok: false, reason: 'NOT_ALLOWED_FOR_ROLE' };
            }
            return { ok: true };
        }

        // RULE 3: Staff PIN can ONLY be used by that specific Staff member
        if (pinRole === 'staff') {
            if (!currentUser) {
                return { ok: false, reason: 'IDENTITY_MISMATCH' };
            }
            const activeEmail = String(currentUser.email || '').trim().toLowerCase();
            if (match.email === activeEmail || (match.auth_user_id && match.auth_user_id === currentUser.id)) {
                return { ok: true };
            }
            console.warn('[VERIFY_PIN] Staff PIN identity mismatch');
            return { ok: false, reason: 'IDENTITY_MISMATCH' };
        }

        return { ok: false, reason: 'INVALID_PIN' };
    } catch (e) {
        console.error('[VERIFY_PIN] Exception:', e);
        return { ok: false, reason: 'INVALID_PIN' };
    }
  }

  public static checkPrinterConnection(settings: AppSettings): { 
    connected: boolean; 
    mode: 'sandbox' | 'real'; 
    status: PrinterConnectionStatus;
    name?: string; 
    paperSize?: string; 
    lastCheckAt: string 
  } {
    const isBrowser = settings.printMethod === 'browser';
    let mode: 'sandbox' | 'real' = 'real';
    let connected = false;
    let status: PrinterConnectionStatus = 'unknown';

    if (isBrowser) {
      mode = 'sandbox';
      connected = true; 
      status = 'ready';
    } else {
      mode = 'real';
      connected = false;
      status = 'unknown';
    }

    return {
      connected,
      mode,
      status,
      name: settings.printerName,
      paperSize: settings.paperSize,
      lastCheckAt: new Date().toISOString()
    };
  }

  public static runScenarioTestsServices(state: SettingsStoreState): ScenarioTestResult[] {
    const results: ScenarioTestResult[] = [];
    const { settings, printer } = state;

    if (printer.connected || printer.status === 'ready') {
      results.push({ id: 'printer-check', name: 'Printer Sanity', status: 'success', message: `Printer ready (${settings.printMethod}).` });
    } else {
      results.push({ id: 'printer-check', name: 'Printer Sanity', status: 'warning', message: 'Printer status unverified (Generic/RawBT).' });
    }

    const validAccess = ['owner', 'manager', 'all'].includes(settings.reportAccess);
    if (validAccess) {
      results.push({ id: 'report-access', name: 'Report access', status: 'success', message: `Access level set to: ${settings.reportAccess}` });
    } else {
      results.push({ id: 'report-access', name: 'Report access', status: 'failed', message: 'Invalid access configuration found.' });
    }

    return results;
  }

  public static async runDiagnostics(settings: AppSettings): Promise<string[]> {
    const tempState: SettingsStoreState = {
      settings,
      version: 2,
      saveStatus: 'idle',
      warnings: [],
      isOnline: navigator.onLine,
      pendingSyncCount: 0,
      printer: SettingsService.checkPrinterConnection(settings)
    };

    const results = SettingsService.runScenarioTestsServices(tempState);
    return results.map(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
      return `${icon} ${r.name}: ${r.message}`;
    });
  }

  public static async requestPrint(
    action: PrintAction, 
    order: any, 
    settings: AppSettings
  ): Promise<PrintResult> {
    const result: PrintResult = {
      ok: true,
      executed: false,
      action,
      reason: 'SUCCESS'
    };

    try {
      let enabled = false;
      switch (action) {
        case 'TEMP_ON_CREATE': enabled = settings.printTemp; break;
        case 'REPRINT_ON_EDIT': enabled = settings.reprintOnEdit; break;
        case 'FINAL_ON_PAYMENT': enabled = settings.autoPrint; break;
        case 'TEST_PRINT': enabled = true; break;
      }

      if (!enabled) {
        result.executed = false;
        result.reason = 'SETTING_DISABLED';
        return result;
      }

      if (isSandboxed() && settings.printMethod !== 'rawbt') {
        result.executed = false;
        result.reason = 'SANDBOX_BLOCKED';
        if (action === 'TEST_PRINT') {
            result.html = await printTestTicket(settings);
        } else {
            result.html = await generateReceiptHTML(order, settings);
        }
        return result;
      }

      if (action === 'TEST_PRINT') {
          const html = await printTestTicket(settings);
          await printViaIframe(html);
      } else {
          await printOrderReceipt(order, settings);
      }
      
      result.executed = true;
      result.reason = 'SUCCESS';

    } catch (e: any) {
      console.error('Print Router Error:', e);
      result.ok = false;
      result.executed = false;
      result.reason = 'ERROR';
      result.message = e.message;
    }
    return result;
  }
}
