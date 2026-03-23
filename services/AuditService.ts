
import { db } from '../db';
import { AuditLogItem } from '../types/settingsTypes';
import { SettingsService } from './SettingsService';

export const AuditService = {
  /**
   * Logs a sensitive action to the local database and queues it for synchronization.
   * 
   * @param action The action name (e.g., 'cancel_order', 'user_switch')
   * @param user The user performing the action (id, role, email)
   * @param details Optional details description
   * @param result Result of the action ('success', 'blocked', 'failed')
   * @param meta Additional metadata (order_id, table_id, reason, etc.)
   */
  logSensitiveAction: async (
    action: string,
    user: { id?: string; role?: string; email?: string } | null,
    details?: string,
    result: 'success' | 'blocked' | 'failed' = 'success',
    meta: any = {}
  ) => {
    // Construct the audit log entry
    const entry: AuditLogItem = {
      id: self.crypto.randomUUID(),
      action,
      actor_role: user?.role || 'system',
      actor_id: user?.id,
      device_id: SettingsService.getDeviceId(),
      created_at: new Date().toISOString(),
      entity_type: meta?.entity_type, // Optional entity type override
      meta: { 
        details, 
        user_email: user?.email,
        ...meta 
      },
      result,
      synced_at: null
    };

    try {
      // 1. Write to Audit Log Table
      await db.audit_logs.add(entry);
      
      // 2. Queue for Sync (Always queue audit logs for security/tracking)
      await db.offline_queue.add({
          type: 'audit_log',
          data: { log: entry },
          timestamp: Date.now(),
          retries: 0
      });
      
      console.log(`[AuditService] Logged: ${action} (${result})`);
    } catch (e) {
      console.error("[AuditService] Failed to log action:", e);
    }
  }
};
