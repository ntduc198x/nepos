
import { z } from 'zod';

export const TaxConfigSchema = z.object({
  store_id: z.string().min(1, "Store ID is required"),
  taxpayer_type: z.enum(['HKD_CNKD', 'COMPANY']),
  tax_method: z.enum(['KHOAN', 'KE_KHAI_MONTH', 'KE_KHAI_QUARTER', 'PER_OCCURRENCE']),
  business_activity: z.enum(['FOOD_BEVERAGE', 'GOODS', 'SERVICES', 'OTHER']),
  vat_rate_percent: z.number().min(0).max(100),
  pit_rate_percent: z.number().min(0).max(100),
  threshold_rules: z.array(z.object({
    effective_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revenue_threshold_annual: z.number().min(0)
  })),
  include_refunds: z.boolean(),
  include_discount: z.boolean(),
  include_surcharge: z.boolean(),
  updated_at: z.string().optional()
});

export const TaxPeriodClosingSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().min(1),
  period_type: z.enum(['MONTH', 'QUARTER']),
  period_key: z.string(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  total_revenue: z.number().min(0),
  taxable_revenue: z.number().min(0),
  vat_amount: z.number().min(0),
  pit_amount: z.number().min(0),
  checksum: z.string(),
  closed_by: z.string(),
  closed_at: z.string().datetime(),
  is_locked: z.boolean()
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  table_id: z.string(),
  status: z.enum(['Pending', 'Cooking', 'Ready', 'Completed', 'Cancelled']),
  total_amount: z.number().min(0),
  discount_amount: z.number().min(0).default(0),
  payment_method: z.enum(['Cash', 'Card', 'Transfer']).optional(),
  user_id: z.string().optional(),
  guests: z.number().int().min(1).default(1),
  created_at: z.string().datetime(),
  is_offline: z.boolean().optional(),
  staff_name: z.string().optional()
});
