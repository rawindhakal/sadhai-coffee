import { query } from './db.js';

export const DEFAULT_SETTINGS = {
  pass_price: 1200,
  pass_cups: 10,
  pass_valid_days: 30,
  first_cup_days: 14,
  first_cup_max: 200,
  ladder_count: 3,
  ladder_pct: 30,
  ladder_days: 21,
  referral_cap_month: 3,
  referral_cup_max: 200,
  promo_push_daily_cap: 1,
  offer_payback_max_days: 30,
};

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
