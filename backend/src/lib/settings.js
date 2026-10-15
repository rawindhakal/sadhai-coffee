import { query } from './db.js';

export const DEFAULT_SETTINGS = {
  // One price for every drink of a kind, at every station. Hot coffee Rs 100, flavored Rs 120, iced Rs 150.
  price_hot: 100,
  price_flavored: 120,
  price_iced: 150,
  pass_price: 900,                // Rs 90 a cup: a saving on hot coffee, a bigger one on flavored and iced
  partner_share_pct: 35,          // default share of net sales a partner cafe keeps
  pass_cups: 10,
  pass_valid_days: 30,      // life of a pass once its first cup is used
  pass_use_by_days: 180,    // how long an unused pass can wait before its first cup
  first_cup_days: 14,
  first_cup_max: 200,
  ladder_count: 3,
  ladder_pct: 30,
  ladder_days: 21,
  referral_cap_month: 3,
  referral_cup_max: 200,
  promo_push_daily_cap: 1,
  offer_payback_max_days: 30,
  target_food_cost_pct: 35,
  variance_alert_value: 500,
  // staff, shifts and pay
  shift_hours: 6,
  weekly_regular_hours: 48,       // Nepal labour law: 48 hours a week, 8 a day; beyond that is overtime
  daily_regular_hours: 8,
  overtime_multiplier: 1.5,
  max_weekly_hours: 40,           // the auto-roster never plans more than this for one person
  min_rest_hours: 11,
  orders_per_staff_shift: 60,     // used to decide how many people a shift needs
  checkin_early_minutes: 30,
  checkin_grace_minutes: 10,
  ssf_employee_pct: 0,            // social security / provident fund taken from pay (ask your accountant)
  ssf_employer_pct: 0,            // employer contribution on top of pay
  preorder_enabled: 1,            // let customers choose a pickup time later today
  preorder_min_minutes: 15,       // earliest pickup, from now
  preorder_prep_minutes: 10,      // a scheduled order reaches the bar this long before pickup
  auto_shift_reminder: 1,
  auto_pass_expiry: 1,
  auto_pass_low: 1,
  auto_winback: 1,
  auto_offers: 1,
  auto_drops: 1,
};

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
