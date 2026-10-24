import { query } from './db.js';
import { bad } from './http.js';

export const DEFAULT_SETTINGS = {
  // One price for every drink of a kind, at every station. Hot coffee Rs 100, flavored Rs 120, iced Rs 150.
  price_hot: 100,
  price_flavored: 120,
  price_iced: 150,
  pass_price: 900,                // Rs 90 a cup: a saving on hot coffee, a bigger one on flavored and iced
  partner_share_pct: 35,          // default share of net sales a partner cafe keeps
  pass_cups: 10,
  pass_valid_days: 30,            // life of a pass once its first cup is used
  pass_use_by_days: 180,          // how long an unused pass can wait before its first cup
  // Welcome offers & referrals (managed under Marketing -> Welcome & referrals, with anti-loss guardrails)
  welcome_enabled: 0,             // master toggle: 0 = off by default so no unsolicited giveaways happen
  welcome_trigger: 1,             // 1 = unlock ONLY after 1st full-price paid order is picked up; 0 = on registration
  welcome_first_cup_enabled: 0,   // 1 = issue first-cup coupon when triggered, 0 = only issue follow-up ladder
  welcome_first_cup_pct: 50,      // % discount on 1 cup (e.g. 50% off or 100% free cup, capped at first_cup_max)
  first_cup_days: 14,
  first_cup_max: 100,             // max Rs covered on first cup (hot coffee value; never covers full iced/merch)
  first_cup_min_spend: 120,       // minimum cart subtotal in Rs required to redeem the welcome coupon
  ladder_count: 3,                // number of follow-up step coupons (0..5)
  ladder_pct: 20,                 // % off a single drink on follow-up visits (clamped 5..50%)
  ladder_max_discount: 40,        // max Rs off per follow-up coupon (single cup cap)
  ladder_min_spend: 100,          // minimum order spend in Rs to redeem a follow-up coupon
  ladder_days: 21,
  // Referral ("Give a cup, Get a cup") rules
  referral_enabled: 1,            // master toggle: 1 = active, 0 = paused
  referral_min_spend: 120,        // friend's 1st order must be PAID (cash/online), un-discounted, and >= Rs 120
  referrer_require_paid_order: 1, // referrer must have at least 1 completed paid order of their own
  referral_reward_pct: 100,       // % off 1 drink for referral reward (capped at referral_cup_max)
  referral_cup_max: 100,          // max Rs covered on a referral reward cup (1 standard hot coffee)
  referral_min_redeem_spend: 100, // minimum order subtotal in Rs when redeeming a referral cup
  referral_valid_days: 30,        // days a referral reward coupon remains valid
  referral_cap_month: 3,          // max referral rewards a customer can earn per calendar month
  referral_cap_lifetime: 15,      // max referral rewards a customer can earn across their lifetime
  // Global anti-loss & anti-breach guardrails
  offer_single_cup_only: 1,       // coupons discount at most 1 drink base price (never whole cart, merch, food, or add-ons)
  offer_no_stacking: 1,           // coupons & promo codes cannot stack on top of Offer of the Day or Limited Drops
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
};

/** Hard parameter bounds so an accidental typo or bad input can never put the company into loss. */
const BOUNDS = {
  price_hot: [40, 1000],
  price_flavored: [40, 1000],
  price_iced: [40, 1000],
  pass_price: [200, 10000],
  pass_cups: [2, 30],
  pass_valid_days: [7, 365],
  pass_use_by_days: [14, 365],
  partner_share_pct: [0, 90],
  welcome_enabled: [0, 1],
  welcome_trigger: [0, 1],
  welcome_first_cup_enabled: [0, 1],
  welcome_first_cup_pct: [5, 100],
  first_cup_days: [1, 90],
  first_cup_max: [10, 250],
  first_cup_min_spend: [50, 2000],
  ladder_count: [0, 5],
  ladder_pct: [5, 50],
  ladder_max_discount: [10, 200],
  ladder_min_spend: [50, 2000],
  ladder_days: [1, 90],
  referral_enabled: [0, 1],
  referral_min_spend: [80, 2000],
  referrer_require_paid_order: [0, 1],
  referral_reward_pct: [10, 100],
  referral_cup_max: [10, 250],
  referral_min_redeem_spend: [50, 2000],
  referral_valid_days: [1, 90],
  referral_cap_month: [0, 20],
  referral_cap_lifetime: [1, 100],
  offer_single_cup_only: [0, 1],
  offer_no_stacking: [0, 1],
  offer_payback_max_days: [1, 90],
  target_food_cost_pct: [10, 80],
  variance_alert_value: [50, 50000],
};

export function validateSettingValue(key, rawVal) {
  if (!(key in DEFAULT_SETTINGS)) throw bad(`Unknown setting: ${key}`);
  const num = Number(rawVal);
  if (!Number.isFinite(num)) throw bad(`Invalid numeric value for ${key}`);
  if (BOUNDS[key]) {
    const [min, max] = BOUNDS[key];
    if (num < min || num > max) {
      throw bad(`${key.replace(/_/g, ' ')} must be between ${min} and ${max}`);
    }
  }
  return num;
}

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const n = Number(r.value);
    if (Number.isFinite(n)) out[r.key] = n;
  }
  return out;
}
