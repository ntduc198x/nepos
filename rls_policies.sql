
-- RLS Policies for Multi-Tenant POS
-- This file documents the Row Level Security policies required for the Supabase database.
-- Run these SQL commands in the Supabase SQL Editor.

-- 1. Enable RLS on all tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Create Helper Function to get current user's store_id
-- Assumes app_metadata contains 'store_id'
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS text AS $$
BEGIN
  RETURN current_setting('request.jwt.claims', true)::json->'app_metadata'->>'store_id';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Policies for ORDERS
-- Staff can view/create orders for their store.
CREATE POLICY "Orders are viewable by store members" ON public.orders
FOR SELECT USING (
  store_id = get_my_store_id()
);

CREATE POLICY "Orders can be created by store members" ON public.orders
FOR INSERT WITH CHECK (
  store_id = get_my_store_id()
);

CREATE POLICY "Orders can be updated by store members" ON public.orders
FOR UPDATE USING (
  store_id = get_my_store_id()
);

-- 4. Policies for MENU ITEMS
-- Staff can view, but only Managers/Admins can edit (enforced by app logic + policy)
CREATE POLICY "Menu items viewable by store members" ON public.menu_items
FOR SELECT USING (
  store_id = get_my_store_id()
);

CREATE POLICY "Menu items editable by managers" ON public.menu_items
FOR ALL USING (
  store_id = get_my_store_id() 
  AND (auth.jwt() -> 'app_metadata' ->> 'role')::text IN ('admin', 'manager')
);

-- 5. Policies for AUDIT LOGS
-- Only insert allowed for everyone (logging actions). View restricted to Admin/Manager.
CREATE POLICY "Audit logs insertable by everyone" ON public.audit_logs
FOR INSERT WITH CHECK (
  store_id = get_my_store_id()
);

CREATE POLICY "Audit logs viewable by managers" ON public.audit_logs
FOR SELECT USING (
  store_id = get_my_store_id()
  AND (auth.jwt() -> 'app_metadata' ->> 'role')::text IN ('admin', 'manager')
);

-- 6. Policies for TAX CONFIGS
-- Strictly limited to Admin/Manager
CREATE POLICY "Tax data restricted to managers" ON public.tax_configs
FOR ALL USING (
  store_id = get_my_store_id()
  AND (auth.jwt() -> 'app_metadata' ->> 'role')::text IN ('admin', 'manager')
);
