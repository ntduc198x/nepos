
import { useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useSettingsContext } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../ThemeContext';
import { playBeep } from '../services/SoundService';

export const useOrderOperations = () => {
  const { cancelOrder } = useData();
  const { guardSensitive, settings } = useSettingsContext();
  const { showToast } = useToast();
  const { t } = useTheme();

  /**
   * Standardized Cancel/Delete Order Flow
   * 
   * LOGIC:
   * 1. This function invokes `guardSensitive` ('cancel_order').
   * 2. `guardSensitive` checks RBAC (allowCancelOrder).
   * 3. `guardSensitive` checks PIN requirement (Manager/Staff rules).
   * 4. `guardSensitive` opens ConfirmModal based on `meta.confirm`.
   * 5. If all pass, executes cancellation.
   */
  const performCancelOrder = useCallback(async (order: any, onSuccess?: () => void, customOptions?: any) => {
    if (!order) {
        console.warn("[ORDER_OP] performCancelOrder called with no order");
        return;
    }

    console.log(`[ORDER_OP] Request cancel for Order #${order.id}`);

    // Allow overriding meta config from caller (e.g. Reset Flow message)
    const meta = {
        tableId: order.table_id,
        entity_type: 'order',
        details: customOptions?.details || `Cancel Order #${order.id} Total: ${order.total_amount}`,
        confirm: customOptions?.confirm || {
            title: t('Xác nhận hủy đơn hàng?'),
            message: t('Hành động này không thể hoàn tác. Dữ liệu đơn hàng sẽ bị hủy bỏ.'),
            confirmText: t('Xác nhận hủy'),
            isDanger: true
        }
    };

    // Call Central Guard
    // NO window.confirm here.
    const guardRes = await guardSensitive('cancel_order', async () => {
        try {
            // EXECUTION STEP
            console.log(`[ORDER_OP] Executing cancelOrder()...`);
            await cancelOrder(order.id);
            console.log(`[ORDER_OP] cancelOrder() completed.`);
            
            // FEEDBACK STEP
            if (customOptions?.successMessage) {
                showToast(customOptions.successMessage, 'success');
            } else {
                showToast(t('Đã hủy đơn hàng thành công'), 'success');
            }
            
            if (settings.soundEffect) playBeep('success');
            
            // CLEANUP STEP
            if (onSuccess) onSuccess();
            
            return { cancelled: false };
        } catch (e: any) {
            console.error("[ORDER_OP] Cancel failed:", e);
            showToast(t('Lỗi khi hủy đơn hàng'), 'error');
            if (settings.soundEffect) playBeep('error');
            throw e;
        }
    }, meta);

    if (!guardRes.ok) {
        console.log(`[ORDER_OP] Action blocked or cancelled: ${guardRes.reason}`);
    }
  }, [cancelOrder, guardSensitive, showToast, t, settings.soundEffect]);

  return {
    performCancelOrder
  };
};
