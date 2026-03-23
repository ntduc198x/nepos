
export type TaxPayerType = 'HKD_CNKD' | 'COMPANY';
export type TaxMethod = 'KHOAN' | 'KE_KHAI_MONTH' | 'KE_KHAI_QUARTER' | 'PER_OCCURRENCE';
export type TaxCalculationMethod = 'REVENUE_PERCENT' | 'INCOME_NET'; // New 2026 methods
export type BusinessActivity = 'FOOD_BEVERAGE' | 'GOODS' | 'SERVICES' | 'OTHER';

export interface ActivityTaxRate {
  vat_rate_percent: number;
  pit_rate_percent: number;
}

export interface TaxThresholdRule {
  effective_from_date: string; // YYYY-MM-DD
  revenue_threshold_annual: number;
}

export interface TaxConfig {
  store_id: string; // Primary Key
  taxpayer_type: TaxPayerType;
  tax_method: TaxMethod;
  calculation_method: TaxCalculationMethod; // New field
  business_activity: BusinessActivity;
  vat_rate_percent: number;
  pit_rate_percent: number;
  activity_rates?: Record<BusinessActivity, ActivityTaxRate>; // TT152: theo nhóm ngành nghề
  category_activity_map?: Record<string, BusinessActivity>; // map category/menu -> ngành thuế
  threshold_rules: TaxThresholdRule[];
  include_refunds: boolean; // Trừ tiền hoàn trả
  include_discount: boolean; // Trừ chiết khấu
  include_surcharge: boolean; // Cộng phụ thu
  updated_at: string;
}

export type LedgerEntryType = 'SALE' | 'REFUND' | 'SURCHARGE' | 'ADJUSTMENT';

export interface TaxLedgerEntry {
  id?: number; // Auto-increment
  store_id: string;
  business_date: string; // YYYY-MM-DD
  order_id?: string; // Nullable for manual adjustments
  type: LedgerEntryType;
  gross_amount: number;
  discount_amount: number;
  surcharge_amount: number;
  refund_amount: number;
  net_amount: number; // The taxable base
  channel?: string; // e.g., 'POS', 'GRAB'
  payment_method?: string;
  business_activity?: BusinessActivity;
  voucher_no?: string;
  voucher_date?: string;
  created_at: string;
  updated_at: string;
  status: 'ACTIVE' | 'VOID';
}

export interface ExpenseEntry {
  id?: number; // Auto-increment
  store_id: string;
  expense_date: string; // YYYY-MM-DD
  category: string; // e.g., 'COGS', 'RENT', 'LABOR'
  amount: number;
  note?: string;
  vendor?: string;
  proof_ref?: string; // Invoice number or image URL
  created_at: string;
}

export interface TaxPeriodClosing {
  id: string;
  store_id: string;
  period_type: 'MONTH' | 'QUARTER';
  period_key: string; // e.g., "2026-02" or "2026-Q1"
  period_start: string;
  period_end: string;
  total_revenue: number;
  total_expenses?: number; // New field
  taxable_income: number; // New field (Revenue or Net Income)
  vat_amount: number;
  pit_amount: number;
  checksum: string;
  closed_by: string;
  closed_at: string;
  is_locked: boolean;
  calculation_method?: TaxCalculationMethod;
}

export interface TaxExport {
  id: string;
  store_id: string;
  period_start: string;
  period_end: string;
  export_type: 'EXCEL' | 'PDF' | 'CSV';
  created_at: string;
  file_name: string;
  checksum: string;
}
