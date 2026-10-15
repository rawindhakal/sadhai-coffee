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
