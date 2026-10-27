-- Sadhai Coffee schema (PostgreSQL 14+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  name_ne text,
  address text,
  district text,
  lat numeric(9,6),
  lng numeric(9,6),
  opens time NOT NULL DEFAULT '07:00',
  closes time NOT NULL DEFAULT '20:00',
  is_open boolean NOT NULL DEFAULT true,
  accepting_orders boolean NOT NULL DEFAULT true,
  order_letter char(1) NOT NULL DEFAULT 'A',
  breakeven_cups int NOT NULL DEFAULT 220,
  prep_target_seconds int NOT NULL DEFAULT 90,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','station','manager','owner')),
  station_id uuid REFERENCES stations(id),
  lang text NOT NULL DEFAULT 'en' CHECK (lang IN ('en','ne')),
  referral_code text UNIQUE,
  referred_by uuid REFERENCES users(id),
  beans int NOT NULL DEFAULT 0,
  push_token text,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS station_managers (
  station_id uuid REFERENCES stations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (station_id, user_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ne text,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  name_ne text,
  description text,
  description_ne text,
  price int NOT NULL CHECK (price >= 0),          -- NPR, all taxes included
  cost int NOT NULL DEFAULT 0,                     -- food cost per unit (for margin reports)
  prep_seconds int NOT NULL DEFAULT 90,
  is_signature boolean NOT NULL DEFAULT false,
  is_seasonal boolean NOT NULL DEFAULT false,
  pass_eligible boolean NOT NULL DEFAULT true,
  origin text,                                      -- e.g. Gulmi, 1,400 m
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ne text,
  required boolean NOT NULL DEFAULT false,
  multi boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ne text,
  price_delta int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS station_products (
  station_id uuid REFERENCES stations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  price_override int,
  PRIMARY KEY (station_id, product_id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  unit text NOT NULL,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
  qty numeric(10,3) NOT NULL,
  PRIMARY KEY (product_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS station_inventory (
  station_id uuid REFERENCES stations(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
  qty numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS inventory_moves (
  id bigserial PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  delta numeric(12,3) NOT NULL,
  reason text NOT NULL,                              -- sale | restock | waste | adjust
  ref text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_counters (
  station_id uuid REFERENCES stations(id) ON DELETE CASCADE,
  day date NOT NULL,
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, day)
);

CREATE TABLE IF NOT EXISTS passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  total_cups int NOT NULL DEFAULT 10,
  used_cups int NOT NULL DEFAULT 0,
  price_paid int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','used','expired','refunded')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  related_party boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS passes_user_idx ON passes(user_id);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('first_cup','pct','referral_cup','promo')),
  title text NOT NULL,
  pct int,                                           -- percent off (kind=pct/promo)
  free_max int,                                      -- max NPR covered by a free cup
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','expired')),
  expires_at timestamptz NOT NULL,
  used_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupons_user_idx ON coupons(user_id, status);

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  pct int NOT NULL CHECK (pct BETWEEN 1 AND 100),
  min_total int NOT NULL DEFAULT 0,
  max_uses int,
  per_user_limit int NOT NULL DEFAULT 1,
  used int NOT NULL DEFAULT 0,
  valid_until timestamptz,
  station_id uuid REFERENCES stations(id),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ne text,
  partner text,
  product_id uuid NOT NULL REFERENCES products(id),
  price int NOT NULL,
  cap int NOT NULL,
  sold int NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  user_id uuid REFERENCES users(id),
  customer_name text,
  pickup_code text NOT NULL,
  channel text NOT NULL DEFAULT 'app' CHECK (channel IN ('app','qr','counter','web')),
  status text NOT NULL DEFAULT 'placed'
    CHECK (status IN ('awaiting_payment','placed','preparing','ready','picked_up','cancelled')),
  subtotal int NOT NULL,
  discount int NOT NULL DEFAULT 0,
  total int NOT NULL,
  discount_label text,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','esewa','khalti','fonepay','pass')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  coupon_id uuid REFERENCES coupons(id),
  promo_code_id uuid REFERENCES promo_codes(id),
  pass_id uuid REFERENCES passes(id),
  drop_id uuid REFERENCES drops(id),
  note text,
  rating int CHECK (rating BETWEEN 1 AND 5),
  rating_note text,
  cancel_reason text,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS orders_station_status_idx ON orders(station_id, status, created_at);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  name text NOT NULL,
  unit_price int NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  options jsonb NOT NULL DEFAULT '[]',
  line_total int NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  order_id uuid REFERENCES orders(id),
  pass_id uuid REFERENCES passes(id),
  station_id uuid REFERENCES stations(id),
  purpose text NOT NULL CHECK (purpose IN ('order','pass')),
  provider text NOT NULL CHECK (provider IN ('cash','esewa','khalti','fonepay','pass')),
  amount int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  provider_ref text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  reconciled boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments(created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),
  referee_id uuid NOT NULL REFERENCES users(id) UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info',                -- order | promo | pass | system
  title text NOT NULL,
  body text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cash_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  business_date date NOT NULL,
  expected_cash int NOT NULL,
  counted_cash int NOT NULL,
  diff int NOT NULL,
  note text,
  closed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, business_date)
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('esewa','khalti','fonepay')),
  day date NOT NULL,
  amount int NOT NULL,
  note text,
  entered_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, day)
);

-- ---- v2: partner cafes, offers of the day, merch, staff accountability ----
ALTER TABLE stations ADD COLUMN IF NOT EXISTS operator_type text NOT NULL DEFAULT 'company' CHECK (operator_type IN ('company','partner'));
ALTER TABLE stations ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS partner_phone text;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS revenue_share_pct int NOT NULL DEFAULT 0 CHECK (revenue_share_pct BETWEEN 0 AND 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'drink' CHECK (kind IN ('drink','food','merch'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_by uuid REFERENCES users(id);

CREATE TABLE IF NOT EXISTS daily_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_ne text,
  blurb text,
  scope text NOT NULL DEFAULT 'product' CHECK (scope IN ('product','category','all_drinks')),
  product_id uuid REFERENCES products(id),
  category_id uuid REFERENCES categories(id),
  pct int CHECK (pct BETWEEN 1 AND 60),
  offer_price int CHECK (offer_price >= 0),            -- fixed price for a product scope (e.g. Americano Rs 99)
  station_id uuid REFERENCES stations(id),              -- null = every station
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  max_uses int,
  used int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pct IS NOT NULL OR offer_price IS NOT NULL)
);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES daily_offers(id);

CREATE TABLE IF NOT EXISTS partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  net_sales int NOT NULL,
  partner_share int NOT NULL,
  cash_held int NOT NULL,
  net_due int NOT NULL,                                  -- >0 Sadhai pays the cafe, <0 the cafe remits to Sadhai
  reference text,
  settled_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, period_from, period_to)
);

-- ---- v1.2: unique passes used in a queue, kiosk orders, push notifications ----
ALTER TABLE passes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE passes ADD COLUMN IF NOT EXISTS activated_at timestamptz;
UPDATE passes SET code = 'SP-' || upper(substr(md5(id::text), 1, 4)) || '-' || upper(substr(md5(id::text), 5, 4)) WHERE code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS passes_code_idx ON passes(code);

CREATE TABLE IF NOT EXISTS order_pass_uses (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pass_id uuid NOT NULL REFERENCES passes(id),
  cups int NOT NULL CHECK (cups > 0),
  PRIMARY KEY (order_id, pass_id)
);
INSERT INTO order_pass_uses(order_id, pass_id, cups)
  SELECT o.id, o.pass_id, (SELECT COALESCE(sum(qty),1) FROM order_items WHERE order_id = o.id) FROM orders o WHERE o.pass_id IS NOT NULL
  ON CONFLICT DO NOTHING;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check;
ALTER TABLE orders ADD CONSTRAINT orders_channel_check CHECK (channel IN ('app','qr','counter','web','kiosk'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text;


-- ---- v1.2: recipe costing, central inventory, purchasing, transfers, stock counts ----
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ingredients ALTER COLUMN unit_cost TYPE numeric(12,5);   -- Rs per base unit (g, ml, pcs), before wastage
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'ingredient';  -- ingredient | packaging | retail
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_unit text NOT NULL DEFAULT 'pcs';        -- how it is bought: kg, L, pcs
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_size numeric(12,3) NOT NULL DEFAULT 1;   -- base units in one pack (1000 g in a kg)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_price numeric(12,2) NOT NULL DEFAULT 0;  -- Rs per pack
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS waste_pct numeric(5,2) NOT NULL DEFAULT 0;    -- allowed wastage, added to cost and to stock use
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS central_reorder numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS central_par numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_purchase_cost numeric(12,5);
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe_method text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost int NOT NULL DEFAULT 0;                  -- recipe cost of this line at order time
ALTER TABLE station_inventory ADD COLUMN IF NOT EXISTS par_level numeric(12,3) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warehouse boolean NOT NULL DEFAULT false;           -- manager who may run central stock

CREATE TABLE IF NOT EXISTS option_recipes (                -- what a chosen option adds (or removes, if negative) per unit
  option_id uuid REFERENCES options(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
  qty numeric(12,3) NOT NULL,
  PRIMARY KEY (option_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS ingredient_cost_history (
  id bigserial PRIMARY KEY,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  pack_size numeric(12,3), pack_price numeric(12,2), unit_cost numeric(12,5), waste_pct numeric(5,2),
  source text NOT NULL DEFAULT 'edit',
  changed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS central_inventory (
  ingredient_id uuid PRIMARY KEY REFERENCES ingredients(id) ON DELETE CASCADE,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS central_moves (
  id bigserial PRIMARY KEY,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  delta numeric(14,3) NOT NULL,
  reason text NOT NULL,                                    -- purchase | transfer_out | transfer_cancel | waste | adjust
  ref text,
  unit_cost numeric(12,5),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number serial,
  supplier_id uuid REFERENCES suppliers(id),
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('draft','ordered','received','cancelled')),
  expected_on date,
  invoice_no text,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  received_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  qty_ordered numeric(14,3) NOT NULL CHECK (qty_ordered > 0),
  unit_cost numeric(12,5) NOT NULL,
  qty_received numeric(14,3) NOT NULL DEFAULT 0,
  received_unit_cost numeric(12,5)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number serial,
  station_id uuid NOT NULL REFERENCES stations(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','dispatched','received','cancelled')),
  note text,
  requested_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz, dispatched_by uuid REFERENCES users(id),
  received_at timestamptz, received_by uuid REFERENCES users(id),
  receive_note text
);
CREATE INDEX IF NOT EXISTS stock_transfers_station_idx ON stock_transfers(station_id, status);
CREATE TABLE IF NOT EXISTS transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  qty_requested numeric(14,3) NOT NULL DEFAULT 0,
  qty_sent numeric(14,3) NOT NULL DEFAULT 0,
  qty_received numeric(14,3),
  unit_cost numeric(12,5) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  counted_by uuid REFERENCES users(id),
  note text,
  variance_value numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stock_count_lines (
  count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  expected numeric(14,3) NOT NULL, counted numeric(14,3) NOT NULL, variance numeric(14,3) NOT NULL, variance_value numeric(12,2) NOT NULL,
  PRIMARY KEY (count_id, ingredient_id)
);

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS tracked boolean NOT NULL DEFAULT true;  -- false for tap water: costed in recipes, never counted

-- ---- v1.3: owner-managed settings and keys, media and site content, staff, rosters, payroll ----
CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,                       -- plain for normal settings, enc:v1:... (AES-256-GCM) for secrets
  secret boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL,
  data bytea NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_content (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  position text NOT NULL DEFAULT 'barista' CHECK (position IN ('barista','cashier','supervisor','all_rounder')),
  skills text[] NOT NULL DEFAULT '{bar,counter}',
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  max_shifts_week int NOT NULL DEFAULT 6,
  days_off int[] NOT NULL DEFAULT '{}',                    -- fixed weekly days off, 0 = Sunday
  preferred_shift text NOT NULL DEFAULT 'any' CHECK (preferred_shift IN ('morning','evening','any')),
  can_float boolean NOT NULL DEFAULT false,                -- may be sent to another station when one is short
  joined_on date,
  emergency_phone text,
  notes text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'any' CHECK (kind IN ('morning','midday','evening','any')),
  start_time time NOT NULL,
  hours numeric(4,2) NOT NULL DEFAULT 6 CHECK (hours > 0 AND hours <= 12),
  min_staff int NOT NULL DEFAULT 1,
  max_staff int NOT NULL DEFAULT 3,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id),                       -- null = open slot
  shift_date date NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('open','scheduled','checked_in','completed','absent','cancelled')),
  published boolean NOT NULL DEFAULT false,
  duty text,
  auto_assigned boolean NOT NULL DEFAULT false,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  paid_minutes int,
  adjusted_minutes int,
  adjust_reason text,
  hourly_rate numeric(10,2),
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_per_day ON shifts(user_id, shift_date) WHERE user_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS shifts_station_date ON shifts(station_id, shift_date);
CREATE INDEX IF NOT EXISTS shifts_user_date ON shifts(user_id, shift_date);

CREATE TABLE IF NOT EXISTS shift_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  done_at timestamptz,
  done_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  kind text NOT NULL DEFAULT 'leave' CHECK (kind IN ('leave','sick','other')),
  reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  totals jsonb NOT NULL DEFAULT '{}',
  reference text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz
);
CREATE TABLE IF NOT EXISTS payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  regular_minutes int NOT NULL DEFAULT 0,
  overtime_minutes int NOT NULL DEFAULT 0,
  hourly_rate numeric(10,2) NOT NULL,
  gross numeric(12,2) NOT NULL,
  adjustments numeric(12,2) NOT NULL DEFAULT 0,
  deductions numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL,
  employer_cost numeric(12,2) NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}',
  UNIQUE (run_id, user_id)
);
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month date NOT NULL,                                     -- first day of the month it applies to
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,                           -- positive pays more (bonus, allowance), negative pays less (advance)
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- v1.3: price tiers, standard recipe versions, enquiries ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tier text CHECK (price_tier IN ('hot','flavored','iced'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe_version int NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('partner','investor','other')),
  name text NOT NULL,
  email text,
  phone text,
  org text,
  city text,
  message text,
  extra jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','meeting','won','closed')),
  note text,
  consent boolean NOT NULL DEFAULT false,
  ip_hash text,
  handled_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status, created_at DESC);
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL;

-- ---- v1.4: Fonepay only, handover code, partner role ----
-- Older rows may still say esewa or khalti. They stay readable in reports, but the API no longer accepts them.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handover_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS code_attempts int NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handover_override text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;
-- Pickup later: a scheduled order reaches the station queue when released (a little before its pickup time).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS released_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_scheduled_idx ON orders(scheduled_for) WHERE scheduled_for IS NOT NULL AND released_at IS NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','station','manager','owner','partner'));

-- ---- v1.6.6: Multi-gateway QR (Fonepay, eSewa, Khalti), NestSMS & Anti-abuse Marketing ----
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip_hash text;

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_spend int NOT NULL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount int;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS single_cup boolean NOT NULL DEFAULT true;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS step int NOT NULL DEFAULT 1;

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_discount int;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS drinks_only boolean NOT NULL DEFAULT true;

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS qualifying_order_id uuid REFERENCES orders(id);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS qualifying_amount int;

-- Permanent hash registry of phones that have registered, preventing delete-and-recreate welcome/referral abuse
CREATE TABLE IF NOT EXISTS claimed_phones (
  phone_hash text PRIMARY KEY,
  first_user_id uuid,
  welcome_issued boolean NOT NULL DEFAULT false,
  referral_used boolean NOT NULL DEFAULT false,
  welcome_claimed boolean NOT NULL DEFAULT false,
  referral_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE claimed_phones ADD COLUMN IF NOT EXISTS welcome_claimed boolean NOT NULL DEFAULT false;
ALTER TABLE claimed_phones ADD COLUMN IF NOT EXISTS referral_claimed boolean NOT NULL DEFAULT false;
ALTER TABLE claimed_phones ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---- v1.7: online payments were switched off for a while ----
-- (Its one-off clean-up of orders waiting for payment has been applied and is not repeated: such orders are normal again from v1.9.)

-- ---- v1.8: no SMS and no push notifications ----
-- Phone verification, SMS and push notifications were removed. Drop their tables and columns (safe to run again).
DROP TABLE IF EXISTS push_deliveries, push_campaigns, push_tokens, auto_push_log, sms_log, phone_verifications CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS push_token, DROP COLUMN IF EXISTS notif_offers, DROP COLUMN IF EXISTS phone_verified, DROP COLUMN IF EXISTS phone_verified_at;
DELETE FROM app_secrets WHERE key LIKE 'sms%' OR key LIKE 'nestsms%' OR key LIKE 'fcm%' OR key LIKE 'vapid%' OR key = 'push_mode';
DELETE FROM settings WHERE key IN ('offer_require_verified_phone', 'promo_push_daily_cap', 'auto_shift_reminder', 'auto_pass_expiry', 'auto_pass_low', 'auto_winback', 'auto_offers', 'auto_drops');

-- The home page no longer has a hills scene, steps, story or people cards; drop what was saved for them.
DELETE FROM site_content WHERE key IN ('steps', 'story', 'people');
UPDATE site_content SET value = value - 'layers' - 'timer_cup' - 'show_timer' - 'parallax' - 'note' WHERE key = 'hero';

-- ---- v1.9: eSewa and Fonepay online payments ----
-- 'test' payments are the owner's Rs 10 checks of a gateway; they are not sales.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_purpose_check;
ALTER TABLE payments ADD CONSTRAINT payments_purpose_check CHECK (purpose IN ('order','pass','test'));

-- ---- v2.0: NepalPay QR ----
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('cash','esewa','khalti','fonepay','nepalpay','pass'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash','esewa','khalti','fonepay','nepalpay','pass'));
CREATE INDEX IF NOT EXISTS payments_ref_idx ON payments(provider_ref) WHERE provider_ref IS NOT NULL;
