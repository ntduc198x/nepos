
import { db } from '../db';
import { TaxConfig, TaxPeriodClosing, TaxThresholdRule, TaxLedgerEntry, ExpenseEntry } from '../types/taxTypes';
import { SettingsService } from './SettingsService';
import { ExpenseService } from './ExpenseService';

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  store_id: 'default',
  taxpayer_type: 'HKD_CNKD',
  tax_method: 'KE_KHAI_QUARTER',
  calculation_method: 'REVENUE_PERCENT', // Default
  business_activity: 'FOOD_BEVERAGE',
  vat_rate_percent: 3.0, // Ngành ăn uống
  pit_rate_percent: 1.5, // Ngành ăn uống
  activity_rates: {
    FOOD_BEVERAGE: { vat_rate_percent: 3.0, pit_rate_percent: 1.5 },
    GOODS: { vat_rate_percent: 1.0, pit_rate_percent: 0.5 },
    SERVICES: { vat_rate_percent: 5.0, pit_rate_percent: 2.0 },
    OTHER: { vat_rate_percent: 2.0, pit_rate_percent: 1.0 }
  },
  category_activity_map: {
    beverage: 'FOOD_BEVERAGE',
    food: 'FOOD_BEVERAGE',
    cafe: 'FOOD_BEVERAGE',
    coffee: 'FOOD_BEVERAGE',
    tea: 'FOOD_BEVERAGE',
    kitchen: 'FOOD_BEVERAGE',
    retail: 'GOODS',
    goods: 'GOODS',
    service: 'SERVICES'
  },
  threshold_rules: [
    { effective_from_date: '2025-01-01', revenue_threshold_annual: 100000000 },
    { effective_from_date: '2026-01-01', revenue_threshold_annual: 500000000 }
  ],
  include_refunds: true,
  include_discount: true,
  include_surcharge: true,
  updated_at: new Date().toISOString()
};

export class TaxService {
  
  private static isSameStore(order: any, storeId: string): boolean {
    // Current deployment is effectively single-store per device.
    // Accept local orders even when store_id differs/missing to avoid dropping tax data.
    if (!storeId) return true;
    if (!order?.store_id) return true;
    if (order.store_id === storeId) return true;
    return true;
  }

  private static dateOnly(isoLike: string): string {
    return isoLike.split('T')[0];
  }

  private static async getEntryActivity(order: any, config: TaxConfig) {
    if (order?.business_activity) return order.business_activity as any;

    const fallback = (config.business_activity || 'FOOD_BEVERAGE') as any;

    try {
      const orderItems = await db.order_items.where('order_id').equals(order.id).toArray();
      if (!orderItems.length) return fallback;

      const menuItems = await db.menu_items.toArray();
      const menuMap = new Map(menuItems.map((m: any) => [String(m.id), m]));

      const score: Record<string, number> = {};
      for (const oi of orderItems as any[]) {
        const menu = menuMap.get(String(oi.menu_item_id));
        const rawCategory = String(menu?.category || '').toLowerCase().trim();
        const mapped = config.category_activity_map?.[rawCategory];

        let activity = mapped;
        if (!activity) {
          if (/food|drink|beverage|coffee|tea|cafe|kitchen/.test(rawCategory)) activity = 'FOOD_BEVERAGE' as any;
          else if (/goods|retail|pack|bottle|item/.test(rawCategory)) activity = 'GOODS' as any;
          else if (/service|fee|booking/.test(rawCategory)) activity = 'SERVICES' as any;
          else activity = fallback;
        }

        score[activity] = (score[activity] || 0) + Number(oi.quantity || 1);
      }

      const dominant = Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0];
      return (dominant || fallback) as any;
    } catch {
      return fallback;
    }
  }

  private static getRatesForActivity(config: TaxConfig, activity: any) {
    const rates = config.activity_rates?.[activity];
    return {
      vat: rates?.vat_rate_percent ?? config.vat_rate_percent,
      pit: rates?.pit_rate_percent ?? config.pit_rate_percent
    };
  }

  private static async ensureLedgerFromOrdersInRange(startISO: string, endISO: string, config: TaxConfig): Promise<number> {
    const startDate = this.dateOnly(startISO);
    const endDate = this.dateOnly(endISO);

    const completedOrders = await db.orders
      .where('status')
      .equals('Completed')
      .filter((o) => {
        if (!this.isSameStore(o, config.store_id)) return false;
        const orderDate = this.dateOnly(o.updated_at || o.created_at || '');
        return orderDate >= startDate && orderDate <= endDate;
      })
      .toArray();

    let inserted = 0;
    for (const order of completedOrders) {
      const exists = await db.tax_ledger_entries.where('order_id').equals(order.id).count();
      if (exists === 0) {
        await this.syncOrderToLedger(order);
        inserted++;
      }
    }

    return inserted;
  }

  static async getConfig(): Promise<TaxConfig> {
    const configs = await db.tax_configs.toArray();
    if (configs.length > 0) return configs[0];
    
    // Init default if not exists
    const deviceId = SettingsService.getDeviceId();
    const newConfig = { ...DEFAULT_TAX_CONFIG, store_id: deviceId };
    await db.tax_configs.put(newConfig);
    return newConfig;
  }

  static async saveConfig(config: TaxConfig): Promise<void> {
    config.updated_at = new Date().toISOString();
    await db.tax_configs.put(config);
    // Queue sync here if needed
  }

  static getEffectiveThreshold(dateStr: string, config: TaxConfig): number {
    const date = new Date(dateStr).getTime();
    // Sort rules descending by date
    const sortedRules = [...config.threshold_rules].sort((a, b) => 
      new Date(b.effective_from_date).getTime() - new Date(a.effective_from_date).getTime()
    );
    
    const rule = sortedRules.find(r => new Date(r.effective_from_date).getTime() <= date);
    return rule ? rule.revenue_threshold_annual : 500000000;
  }

  // --- LEDGER LOGIC ---

  static async syncOrderToLedger(order: any): Promise<void> {
    if (order.status !== 'Completed') return;

    // Check if entry exists (and self-heal duplicates if already present)
    const existingEntries = await db.tax_ledger_entries.where('order_id').equals(order.id).toArray();
    if (existingEntries.length > 0) {
      if (existingEntries.length > 1) {
        const sorted = existingEntries.sort((a, b) => {
          const aTs = new Date(a.updated_at || a.created_at).getTime();
          const bTs = new Date(b.updated_at || b.created_at).getTime();
          return bTs - aTs;
        });
        const keepId = sorted[0].id;
        const removeIds = sorted.slice(1).map((e) => e.id!).filter(Boolean);
        if (removeIds.length > 0) {
          await db.tax_ledger_entries.bulkDelete(removeIds);
        }
        if (keepId) await db.tax_ledger_entries.update(keepId, { store_id: (await this.getConfig()).store_id });
      }
      return; // Idempotent
    }

    const gross = order.subtotal_amount || order.total_amount || 0;
    const discount = order.discount_amount || 0;
    const surcharge = 0; // Future
    const refund = 0; // Future

    const config = await this.getConfig();
    
    // Calculate Net based on Config
    let net = gross;
    if (config.include_discount) net -= discount;
    if (config.include_surcharge) net += surcharge;
    if (config.include_refunds) net -= refund;
    net = Math.max(0, net);

    const businessDate = this.dateOnly(order.updated_at || order.created_at || new Date().toISOString());
    const activity = await this.getEntryActivity(order, config);

    const entry: TaxLedgerEntry = {
        store_id: config.store_id,
        business_date: businessDate,
        order_id: order.id,
        type: 'SALE',
        gross_amount: gross,
        discount_amount: discount,
        surcharge_amount: surcharge,
        refund_amount: refund,
        net_amount: net,
        channel: 'POS',
        payment_method: order.payment_method || 'CASH',
        business_activity: activity,
        voucher_no: order.id,
        voucher_date: businessDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'ACTIVE'
    };

    await db.tax_ledger_entries.add(entry);
  }

  static async backfillLedgerFromOrders(storeId?: string): Promise<number> {
    const config = await this.getConfig();
    const resolvedStoreId = storeId || config.store_id;
    const orders = await db.orders
      .where('status')
      .equals('Completed')
      .filter((o) => this.isSameStore(o, resolvedStoreId))
      .toArray();

    let count = 0;
    for (const order of orders) {
      const exists = await db.tax_ledger_entries.where('order_id').equals(order.id).count();
      if (exists === 0) {
        await this.syncOrderToLedger(order);
        count++;
      }
    }
    return count;
  }

  static async rebuildLedgerForPeriod(startISO: string, endISO: string, storeId?: string): Promise<{ deleted: number; inserted: number }> {
    const config = await this.getConfig();
    const resolvedStoreId = storeId || config.store_id;
    const startDate = this.dateOnly(startISO);
    const endDate = this.dateOnly(endISO);

    // 1) Remove existing ledger entries in period for this store
    const existing = await db.tax_ledger_entries
      .where('[business_date+store_id]')
      .between([startDate, resolvedStoreId], [endDate, resolvedStoreId], true, true)
      .toArray();

    if (existing.length > 0) {
      await db.tax_ledger_entries.bulkDelete(existing.map((e) => e.id!).filter(Boolean));
    }

    // 2) Rebuild from completed orders in period
    const completedOrders = await db.orders
      .where('status')
      .equals('Completed')
      .filter((o) => {
        if (!this.isSameStore(o, resolvedStoreId)) return false;
        const orderDate = this.dateOnly(o.updated_at || o.created_at || '');
        return orderDate >= startDate && orderDate <= endDate;
      })
      .toArray();

    let inserted = 0;
    for (const order of completedOrders) {
      await this.syncOrderToLedger(order);
      inserted++;
    }

    return { deleted: existing.length, inserted };
  }

  // --- CALCULATION LOGIC ---

  static async computePeriodLedger(startISO: string, endISO: string, config: TaxConfig) {
    const startDate = this.dateOnly(startISO);
    const endDate = this.dateOnly(endISO);
    const storeId = config.store_id;

    // Use Ledger as Source of Truth
    const entries = await db.tax_ledger_entries
        .where('[business_date+store_id]')
        .between([startDate, storeId], [endDate, storeId], true, true)
        .filter(e => e.status === 'ACTIVE')
        .toArray();

    // De-duplicate by order_id for SALE entries (race conditions/offline retries can create duplicates).
    // Keep the latest updated_at record as source of truth.
    const byOrder = new Map<string, TaxLedgerEntry>();
    const manualEntries: TaxLedgerEntry[] = [];

    for (const entry of entries) {
      if (entry.type === 'SALE' && entry.order_id) {
        const prev = byOrder.get(entry.order_id);
        if (!prev) {
          byOrder.set(entry.order_id, entry);
        } else {
          const prevTs = new Date(prev.updated_at || prev.created_at).getTime();
          const nextTs = new Date(entry.updated_at || entry.created_at).getTime();
          if (nextTs >= prevTs) byOrder.set(entry.order_id, entry);
        }
      } else {
        manualEntries.push(entry);
      }
    }

    const dedupedEntries = [...byOrder.values(), ...manualEntries].sort((a, b) => {
      const aTs = new Date(a.created_at || a.updated_at).getTime();
      const bTs = new Date(b.created_at || b.updated_at).getTime();
      return aTs - bTs;
    });

    let totalNet = 0;
    dedupedEntries.forEach(e => totalNet += e.net_amount);

    return {
        revenue: totalNet,
        count: dedupedEntries.length,
        entries: dedupedEntries
    };
  }

  static async computeRolling12Revenue(endDateISO: string, config: TaxConfig): Promise<{ amount: number, isProjected: boolean }> {
    const end = new Date(endDateISO);
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1); // Go back 12 months

    const startISO = start.toISOString();
    
    // Check if store has data for 12 months (First completed order of this store)
    const completedOrders = await db.orders
      .where('status')
      .equals('Completed')
      .filter((o) => this.isSameStore(o, config.store_id))
      .sortBy('created_at');

    const firstOrder = completedOrders[0];
    let isProjected = false;
    let multiplier = 1;

    if (firstOrder) {
        const firstDate = new Date(firstOrder.created_at);
        const monthsDiff = (end.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsDiff < 12 && monthsDiff > 0) {
            isProjected = true;
            multiplier = 12 / monthsDiff;
        }
    }

    // For rolling revenue, we still use the ledger logic
    const { revenue } = await this.computePeriodLedger(startISO, endDateISO, config);
    
    return {
        amount: isProjected ? revenue * multiplier : revenue,
        isProjected
    };
  }

  static async calculateTaxLiability(periodStart: string, periodEnd: string) {
    const config = await this.getConfig();

    // Reconcile missed/completed orders into ledger before calculating.
    await this.ensureLedgerFromOrdersInRange(periodStart, periodEnd, config);

    // 1. Revenue from Ledger
    let ledgerData = await this.computePeriodLedger(periodStart, periodEnd, config);

    // Safety fallback: if period ledger is still empty, rebuild from all completed orders once.
    if (ledgerData.count === 0) {
      await this.backfillLedgerFromOrders(config.store_id);
      ledgerData = await this.computePeriodLedger(periodStart, periodEnd, config);
    }

    // 2. Expenses (if needed)
    const expenses = await ExpenseService.getExpenses(
      config.store_id,
      this.dateOnly(periodStart),
      this.dateOnly(periodEnd)
    );
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // 3. Threshold Check
    const rolling = await this.computeRolling12Revenue(periodEnd, config);
    const threshold = this.getEffectiveThreshold(this.dateOnly(periodEnd), config);
    const isTaxable = rolling.amount > threshold;
    
    // 4. Tax Calculation
    let taxableIncome = 0;
    let vat = 0;
    let pit = 0;

    const revenueByActivity = (ledgerData.entries as TaxLedgerEntry[]).reduce((acc, entry) => {
      const activity = (entry.business_activity || config.business_activity || 'FOOD_BEVERAGE') as any;
      acc[activity] = (acc[activity] || 0) + (entry.net_amount || 0);
      return acc;
    }, {} as Record<string, number>);

    if (isTaxable) {
        if (config.calculation_method === 'INCOME_NET') {
            taxableIncome = Math.max(0, ledgerData.revenue - totalExpenses);
            // INCOME_NET currently uses global rates from config.
            vat = taxableIncome * (config.vat_rate_percent / 100);
            pit = taxableIncome * (config.pit_rate_percent / 100);
        } else {
            taxableIncome = ledgerData.revenue;
            for (const [activity, revenue] of Object.entries(revenueByActivity)) {
              const rates = this.getRatesForActivity(config, activity);
              vat += revenue * (rates.vat / 100);
              pit += revenue * (rates.pit / 100);
            }
        }
    }

    return {
        config,
        periodRevenue: ledgerData.revenue,
        totalExpenses,
        taxableIncome,
        rollingRevenue: rolling.amount,
        isProjected: rolling.isProjected,
        threshold,
        isTaxable,
        vat: Math.round(vat),
        pit: Math.round(pit),
        totalTax: Math.round(vat + pit),
        details: {
            ledger: ledgerData.entries,
            expenses,
            revenueByActivity
        }
    };
  }

  // --- CHECKSUM & CLOSING ---

  static async generateChecksum(data: any): Promise<string> {
      const canonical = JSON.stringify(data, Object.keys(data).sort());
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(canonical);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async closePeriod(data: any, userId: string): Promise<TaxPeriodClosing> {
      // Create canonical data for checksum
      const checksumData = {
          store_id: data.config.store_id,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          ledger_ids: data.details.ledger.map((e: TaxLedgerEntry) => e.id).sort(),
          expense_ids: data.details.expenses.map((e: ExpenseEntry) => e.id).sort(),
          totals: {
              revenue: data.periodRevenue,
              expenses: data.totalExpenses,
              taxable: data.taxableIncome,
              vat: data.vat,
              pit: data.pit
          }
      };

      const checksum = await this.generateChecksum(checksumData);

      const closing: TaxPeriodClosing = {
          id: self.crypto.randomUUID(),
          store_id: data.config.store_id,
          period_type: data.config.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH',
          period_key: data.periodKey, // "2026-02"
          period_start: data.periodStart,
          period_end: data.periodEnd,
          total_revenue: data.periodRevenue,
          total_expenses: data.totalExpenses,
          taxable_income: data.taxableIncome,
          vat_amount: data.vat,
          pit_amount: data.pit,
          checksum: checksum,
          closed_by: userId,
          closed_at: new Date().toISOString(),
          is_locked: true,
          calculation_method: data.config.calculation_method
      };
      
      await db.tax_period_closings.add(closing);
      return closing;
  }
  
  static async getPeriodClosing(periodKey: string): Promise<TaxPeriodClosing | undefined> {
      return await db.tax_period_closings.where('period_key').equals(periodKey).first();
  }

  // --- EXPORT HELPERS ---

  static buildS2aRows(calculation: any) {
      const byActivity = calculation?.details?.revenueByActivity || {};
      return Object.entries(byActivity).map(([activity, revenue]) => {
        const rates = this.getRatesForActivity(calculation.config, activity);
        const vat = Number(revenue) * (rates.vat / 100);
        const pit = Number(revenue) * (rates.pit / 100);
        return {
          MauSo: 'S2a-HKD',
          NhomNganh: activity,
          DoanhThu: Math.round(Number(revenue)),
          TyLeVAT: rates.vat,
          ThueVAT: Math.round(vat),
          TyLeTNCN: rates.pit,
          ThueTNCN: Math.round(pit)
        };
      });
  }

  static buildS2cRows(calculation: any) {
      return [
        {
          MauSo: 'S2c-HKD',
          ChiTieu: 'Doanh thu bán hàng hóa, dịch vụ',
          SoTien: Math.round(calculation.periodRevenue || 0)
        },
        {
          MauSo: 'S2c-HKD',
          ChiTieu: 'Chi phí hợp lý',
          SoTien: Math.round(calculation.totalExpenses || 0)
        },
        {
          MauSo: 'S2c-HKD',
          ChiTieu: 'Chênh lệch (Doanh thu - Chi phí)',
          SoTien: Math.round((calculation.periodRevenue || 0) - (calculation.totalExpenses || 0))
        },
        {
          MauSo: 'S2c-HKD',
          ChiTieu: 'Thuế TNCN phải nộp',
          SoTien: Math.round(calculation.pit || 0)
        }
      ];
  }

  static buildLedgerRowsFor152(calculation: any) {
      return (calculation?.details?.ledger || []).map((e: TaxLedgerEntry) => ({
        MauSo: calculation?.config?.calculation_method === 'INCOME_NET' ? 'S2b/S2c-HKD' : 'S2a-HKD',
        SoChungTu: e.voucher_no || e.order_id || '',
        NgayChungTu: e.voucher_date || e.business_date,
        DienGiai: `${e.type} ${e.order_id || ''}`.trim(),
        NhomNganh: e.business_activity || calculation?.config?.business_activity || 'FOOD_BEVERAGE',
        SoTien: Math.round(e.net_amount || 0),
        ThanhToan: e.payment_method || ''
      }));
  }

  static async buildS2dRows(periodStartISO: string, periodEndISO: string) {
      const startDate = this.dateOnly(periodStartISO);
      const endDate = this.dateOnly(periodEndISO);

      const completedOrders = await db.orders
        .where('status')
        .equals('Completed')
        .filter((o) => {
          const d = this.dateOnly(o.updated_at || o.created_at || '');
          return d >= startDate && d <= endDate;
        })
        .toArray();

      const orderMap = new Map(completedOrders.map((o: any) => [String(o.id), o]));
      const orderIds = new Set(completedOrders.map((o: any) => String(o.id)));
      const orderItems = await db.order_items.toArray();
      const soldItems = orderItems.filter((oi: any) => orderIds.has(String(oi.order_id)));

      const menu = await db.menu_items.toArray();
      const menuMap = new Map(menu.map((m: any) => [String(m.id), m]));

      return soldItems.map((it: any) => {
        const itemId = String(it.menu_item_id || it.id || 'UNKNOWN');
        const m: any = menuMap.get(itemId) || {};
        const order: any = orderMap.get(String(it.order_id)) || {};
        const unitPrice = Number(it.price || m.price || 0);
        const qty = Number(it.quantity || 0);
        const chứngTừ = String(order.id || it.order_id || '');
        const ngày = this.dateOnly(order.updated_at || order.created_at || new Date().toISOString());

        return {
          MauSo: 'S2d-HKD',
          SoChungTu: chứngTừ,
          NgayChungTu: ngày,
          DienGiai: `Xuất bán ${m.name || itemId}`,
          MaHang: itemId,
          TenHangHoa: m.name || 'Unknown Item',
          DonViTinh: m.unit || 'suất',
          DonGiaXuatBQ: Math.round(unitPrice),
          SoLuongXuat: qty,
          ThanhTienXuat: Math.round(qty * unitPrice)
        };
      });
  }

  static async buildS2eRows(periodStartISO: string, periodEndISO: string) {
      const startDate = this.dateOnly(periodStartISO);
      const endDate = this.dateOnly(periodEndISO);

      const completedOrders = await db.orders
        .where('status')
        .equals('Completed')
        .filter((o) => {
          const d = this.dateOnly(o.updated_at || o.created_at || '');
          return d >= startDate && d <= endDate;
        })
        .toArray();

      const expenses = await db.expense_entries
        .filter((e) => e.expense_date >= startDate && e.expense_date <= endDate)
        .toArray();

      const inflows = completedOrders.map((o: any) => ({
        MauSo: 'S2e-HKD',
        SoChungTu: String(o.id || ''),
        NgayChungTu: this.dateOnly(o.updated_at || o.created_at || new Date().toISOString()),
        DienGiai: `Thu từ bán hàng - ${o.payment_method || 'UNKNOWN'}`,
        ThuVao: Math.round(Number(o.total_amount || 0)),
        ChiRa: 0,
        KenhTien: (o.payment_method || '').toUpperCase() === 'CASH' ? 'Tien mat' : 'Tien gui'
      }));

      const outflows = expenses.map((e: ExpenseEntry) => ({
        MauSo: 'S2e-HKD',
        SoChungTu: e.proof_ref || `EXP-${e.id || ''}`,
        NgayChungTu: e.expense_date,
        DienGiai: `Chi phí ${e.category}${e.note ? ` - ${e.note}` : ''}`,
        ThuVao: 0,
        ChiRa: Math.round(Number(e.amount || 0)),
        KenhTien: 'Tien mat/Tien gui'
      }));

      return [...inflows, ...outflows].sort((a, b) => (a.NgayChungTu > b.NgayChungTu ? 1 : -1));
  }
  
  static generateCSV(data: any[]): string {
      if (data.length === 0) return '';
      const header = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(','));
      return [header, ...rows].join('\n');
  }
}
