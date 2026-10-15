import { query } from './db.js';

export const DEFAULT_SETTINGS = {
  pass_price: 1200,
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
