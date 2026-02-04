

import { useState, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { useDB } from '../context/DBProvider';
import { useNetwork } from '../context/NetworkContext';
import { printTestTicket, isSandboxed, printViaIframe } from '../services/printService';
import { db } from '../db';
import { useSettingsContext, SETTINGS_PRESETS } from '../context/SettingsContext';
import { SettingsService } from '../services/SettingsService';
import { SystemStatus, SaveStatus, AppSettings } from '../types/settingsTypes';
import { usePrintPreview } from '../context/PrintPreviewContext';
import { useData } from '../context/DataContext';

// Re-export SaveStatus
export type { SaveStatus }; 

export const useSettingsLogic = () => {
  const { user, signOut, role } = useAuth();
  const { dbReady } = useDB();
  const { processQueue, isOnline, serverReachable, connectionStatus, pendingCount, lastSyncError, lastSyncTime } = useNetwork();
  const { refreshData } = useData();
  
  const { 
    state,
    setSetting,
    bulkSet,
    guardSensitive,
    logAuditAction,
    saveStatus,
    runScenarioTests
  } = useSettingsContext();

  const { openPreview } = usePrintPreview();

  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error' | 'warning' | 'info'} | null>(null);
  const [printPreviewHtml, setPrintPreviewHtml] = useState<string | null>(null);
  
  const { settings, printer } = state;

  // --- DYNAMIC CARD STATUS CALCULATOR ---
  const cardStatuses = useMemo(() => {
    const statuses: Record<string, SystemStatus> = {
      store: 'active',
      printing: 'active',
      staff: 'active',
      ui: 'active',
      data: 'active',
      system: 'active'
    };

    if (!settings.enableTableMap && !settings.quickOrder) statuses.store = 'warning';
    
    // Printing Status Logic
    // Browser print ('ready') is active.
    // 'unknown' (Generic Thermal) is warning (unverified).
    // 'disconnected' is error.
    if (printer.status === 'ready' || printer.connected) {
      statuses.printing = 'active';
    } else if (printer.status === 'unknown') {
      statuses.printing = 'warning';
    } else {
      statuses.printing = 'error';
    }

    if (settings.allowRefund || settings.allowDiscount) statuses.staff = 'warning';
    
    if (!isOnline || pendingCount > 0) statuses.system = 'warning';
    if (!serverReachable || pendingCount > 10 || lastSyncError) statuses.system = 'error';

    return statuses;
  }, [settings, isOnline, serverReachable, pendingCount, printer, lastSyncError]);

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleApplyPreset = (presetKey: string) => {
    const preset = SETTINGS_PRESETS[presetKey];
    if (preset) {
        bulkSet({ ...preset.patch, presetId: presetKey });
        logAuditAction('APPLY_PRESET', `Applied preset: ${preset.label}`);
        showToast(`Đã áp dụng preset: ${preset.label}`, 'success');
    }
  };

  const handleValueChange = (key: string, value: any) => {
    try {
      if (key === 'masterPin' && role !== 'admin') {
          showToast('Không có quyền đổi PIN', 'error');
          return;
      }

      if (key === 'presetId') {
         handleApplyPreset(value);
         return;
      }

      bulkSet({ [key]: value, presetId: '' });
      
      if (key === 'language') {
        showToast('Đã đổi ngôn ngữ', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('Lỗi lưu cài đặt', 'error');
    }
  };

  const getActivePreset = () => {
    if (settings.presetId && SETTINGS_PRESETS[settings.presetId]) {
      return settings.presetId;
    }
    for (const [key, preset] of Object.entries(SETTINGS_PRESETS)) {
        let match = true;
        for (const [k, v] of Object.entries(preset.patch)) {
            // @ts-ignore
            if (settings[k] !== v) {
                match = false;
                break;
            }
        }
        if (match) return key;
    }
    return null;
  };

  const handleAction = async (actionId: string, payload?: any) => {
    switch (actionId) {
      case 'check_connection':
        showToast('Đang kiểm tra kết nối...', 'warning');
        bulkSet({ printerName: settings.printerName }); 
        setTimeout(() => {
            const currentPrinter = state.printer;
            if (currentPrinter.status === 'ready') {
                showToast(`Hệ thống in sẵn sàng (Browser Print)`, 'success');
            } else if (currentPrinter.mode === 'real') {
                // For generic thermal/rawbt, we can't really "ping" without advanced hardware API.
                // Warn user that status is unverified.
                showToast('Đã gửi tín hiệu. Vui lòng kiểm tra máy in.', 'info');
            } else {
                showToast('Không tìm thấy máy in', 'error');
            }
        }, 1000);
        break;
      case 'test_print':
        try {
          const result = await SettingsService.requestPrint('TEST_PRINT', null, settings);
          if (result.reason === 'SANDBOX_BLOCKED' && result.html) {
             openPreview({ 
               html: result.html, 
               title: 'Hóa đơn in mẫu', 
               meta: { action: 'TEST_PRINT' }
             });
             showToast('Sandbox Mode: In ấn bị hạn chế. Mở preview.', 'warning');
             logAuditAction('test_print', 'Blocked by Sandbox');
          } else if (result.executed) {
             showToast('Đã gửi lệnh in test');
             logAuditAction('test_print', 'Sent to printer');
          } else {
             showToast('Không thể in test (Settings disabled?)', 'error');
          }
        } catch { showToast('Lỗi in ấn', 'error'); }
        break;
      case 'logout':
        await signOut();
        break;
      
      case 'factory_reset':
        const resetGuard = await guardSensitive('factory_reset', async () => {
           // Clear Dexie
           await db.delete();
           await db.open(); // Re-open to ensure clean state implies DB structure recreation via schema
           // Clear Storage
           localStorage.removeItem(SettingsService['SETTINGS_STORAGE_KEY'] || 'RESBAR_SETTINGS_STORE');
           // Logout
           await signOut();
           window.location.reload();
        });
        
        if (!resetGuard.ok) {
            if (resetGuard.reason === 'PIN_REQUIRED') showToast('Cần quyền Admin (PIN) để thực hiện', 'error');
            else showToast('Thao tác bị chặn', 'error');
        }
        break;

      case 'sync_now':
        if (!isOnline) {
            showToast('Không có mạng, không thể đồng bộ', 'error');
            return;
        }
        showToast('Đang đồng bộ...', 'info');
        try {
            const queueSuccess = await processQueue(true);
            await refreshData();
            
            if (queueSuccess) {
                setSetting('lastSyncTime', new Date().toISOString());
                showToast('Đồng bộ thành công', 'success');
            } else {
                showToast('Đồng bộ không hoàn tất', 'warning');
            }
        } catch (e) {
            showToast('Đồng bộ thất bại', 'error');
        }
        break;

      case 'export_data':
        const exportGuard = await guardSensitive('export_data', async () => {
           const orders = await db.orders.toArray();
           const items = await db.order_items.toArray();
           const menu = await db.menu_items.toArray();
           const tables = await db.pos_tables.toArray();
           const logs = await db.audit_logs.toArray();
           
           const data = JSON.stringify({ 
               meta: {
                   version: 1,
                   exportedAt: new Date().toISOString(),
                   deviceId: SettingsService.getDeviceId()
               },
               data: { orders, items, menu, tables, logs }
           }, null, 2);
           
           const blob = new Blob([data], { type: 'application/json' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `resbar_backup_${new Date().toISOString().split('T')[0]}.json`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           
           showToast('Đã xuất dữ liệu thành công', 'success');
        });
        
        if (!exportGuard.ok) {
             showToast('Không đủ quyền xuất dữ liệu', 'error');
        }
        break;

      case 'import_data':
        const importGuard = await guardSensitive('modify_system_settings', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e: any) => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (!window.confirm("CẢNH BÁO: Import sẽ GHI ĐÈ dữ liệu hiện tại. Bạn có chắc chắn muốn tiếp tục?")) return;

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const json = JSON.parse(ev.target?.result as string);
                        if (!json.data || !json.meta) throw new Error("Invalid backup file format");

                        await db.transaction('rw', [db.orders, db.order_items, db.menu_items, db.pos_tables, db.audit_logs], async () => {
                            await db.orders.clear();
                            await db.order_items.clear();
                            await db.menu_items.clear();
                            await db.pos_tables.clear();
                            await db.audit_logs.clear();

                            if (json.data.orders?.length) await db.orders.bulkAdd(json.data.orders);
                            if (json.data.items?.length) await db.order_items.bulkAdd(json.data.items);
                            if (json.data.menu?.length) await db.menu_items.bulkAdd(json.data.menu);
                            if (json.data.tables?.length) await db.pos_tables.bulkAdd(json.data.tables);
                            if (json.data.logs?.length) await db.audit_logs.bulkAdd(json.data.logs);
                        });

                        showToast('Import dữ liệu thành công!', 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    } catch (err: any) {
                        console.error(err);
                        showToast(`Lỗi import: ${err.message}`, 'error');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
        if (!importGuard.ok) showToast('Cần quyền Admin để nhập liệu', 'error');
        break;

      case 'run_scenario_tests':
        const results = await runScenarioTests();
        const failures = results.filter(r => r.status === 'failed' || r.status === 'warning');
        if (failures.length > 0) {
            const details = failures.map(f => `[${f.status.toUpperCase()}] ${f.name}: ${f.message}`).join('\n');
            alert(`System Diagnostics Report:\n\n${details}`);
        } else {
            showToast('System Check: All Systems Operational', 'success');
        }
        break;
      default:
        console.log('Unknown action', actionId);
    }
  };

  const getPrinterLabel = () => {
    // If user explicitly typed a name (and it's not the default placeholder), show it
    if (settings.printerName && settings.printerName !== 'Generic Thermal') {
        const suffix = printer.status === 'ready' ? ' (Ready)' 
                     : printer.status === 'unknown' ? ' (Unverified)' 
                     : ' (Connected)';
        return settings.printerName + suffix;
    }
    // Fallback based on status
    if (printer.status === 'ready') return 'Trình duyệt (System Ready)';
    if (printer.status === 'unknown') return 'Chưa kiểm tra (Generic)';
    if (printer.connected) return 'Máy in nhiệt (Connected)';
    return 'Chưa cấu hình';
  };

  const values: Record<string, any> = {
    ...settings,
    isOnline, // Explicitly expose for UI boolean checks
    userEmail: user?.email || 'Chưa đăng nhập',
    printerName: getPrinterLabel(),
    paperSizeDisplay: settings.paperSize,
    
    // --- Mapped System Status Values ---
    networkStatusLabel: connectionStatus === 'online' ? 'Online' : (connectionStatus === 'unreachable' ? 'Online (No Server)' : 'Offline'),
    pendingSyncCount: `${pendingCount} item(s)`,
    lastSyncTimeDisplay: lastSyncTime ? lastSyncTime.toLocaleString('vi-VN') : (settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString('vi-VN') : 'Chưa có'),
    lastSyncError: lastSyncError || 'Không có lỗi',
    
    appVersion: 'v2.4.0 (Live)',
    dbStatus: dbReady ? 'Sẵn sàng' : 'Lỗi',
  };

  return { 
    values, 
    handleValueChange, 
    handleApplyPreset,
    getActivePreset,
    handleAction, 
    notification, 
    showToast, 
    saveStatus, 
    isOnline, 
    connectionStatus, 
    printPreviewHtml,
    setPrintPreviewHtml,
    cardStatuses
  };
};