import { query } from './db.js';
import { rt } from './runtime.js';

/** Editable website, kiosk and app content. A null picture means "use the built-in artwork". */
export const SITE_DEFAULTS = {
  hero: {
    headline_en: 'Good coffee, every day.', headline_ne: 'सधैं राम्रो कफी।',
    sub_en: 'Grown in the hills. Ready in 90 seconds.', sub_ne: 'पहाडमा फलेको, ९० सेकेन्डमा तयार।',
    primary_cta: 'Order ahead', secondary_cta: 'Get a free first cup', note: 'The price you see is the price you pay.',
    layers: { sun: null, far: null, mid: null, near: null }, timer_cup: null, portrait: null, show_timer: true, parallax: true,
  },
  steps: [
    { title_en: 'Pick a counter', title_ne: 'नजिकको काउन्टर छान्नुहोस्', text: 'Share your location (free, on your phone) and we sort the nearest counters by walking time.', art: null },
    { title_en: 'Order and pay', title_ne: 'अर्डर र भुक्तानी', text: 'Add a coffee in one tap. Pay with Fonepay, your pass, or cash at the counter.', art: null },
    { title_en: 'Walk in, 90 seconds', title_ne: 'भित्र आउनुहोस्, ९० सेकेन्ड', text: 'Your pickup number lights up when it is ready. Fresh Nepali beans, poured while you walk up.', art: null },
  ],
  people: [
    { role: 'The hands on the hill', title: 'Farmers in Gulmi, Syangja and Kaski', text: 'Families who pick each ripe cherry by hand on mid-hill terraces. We name the district on the bag.', art: null },
    { role: 'Behind the counter', title: 'Baristas who know your order', text: 'A small team at every counter, trained on one standard recipe so a drink tastes the same everywhere.', art: null },
    { role: 'On the way to work', title: 'Commuters, students, nurses', text: 'People who want a good cup in 90 seconds, at a bus stop, a hospital gate or a campus entrance.', art: null },
    { role: 'Our cafe partners', title: 'Cafe owners across Kathmandu', text: 'Neighbourhood cafes that keep their own counter and team, and bring Sadhai coffee and orders through the door.', art: null },
  ],
  story: [
    { tag: 'Grown', title: 'In the hills of Gulmi, Syangja and Kaski', text: 'Nepali farmers pick cherries by hand on mid-hill terraces. We name the district on the bag.', art: null },
    { tag: 'Roasted', title: 'By Sevya Coffee Processing', text: 'Roasted weekly in Nepal, planned from what you actually order, so beans stay fresh.', art: null },
    { tag: 'Poured', title: 'At a counter near you', text: 'A pickup counter in a cafe, a hospital gate or a bus stand. Small team, one promise: 90 seconds.', art: null },
  ],
  partners: {
    headline: 'Run Sadhai at your cafe',
    intro: 'Keep your counter and your team. We bring the app, the beans, the standard recipes and the customers. You keep a share of every sale and see every order and statement as it happens.',
    requirements: ['A counter or window facing the street or a busy lobby, about 4 square metres', 'One trained person on every shift', 'Power, water and a steady internet connection', 'A bank or wallet account for your monthly statement'],
    steps: [
      { title: 'Tell us about your cafe', text: 'Send the form below. We reply within two working days.' },
      { title: 'We visit and agree terms', text: 'We look at the space and agree your revenue share and start date in writing.' },
      { title: 'Training on the standard recipes', text: 'Your team learns the Sadhai recipes so every cup tastes the same at every counter.' },
      { title: 'Go live', text: 'We install the app and kiosk, deliver your first stock, and open for orders.' },
    ],
    faqs: [
      { q: 'Who buys the coffee, milk and cups?', a: 'We do, centrally, and send stock to your counter. You confirm what arrives, so shortages are recorded fairly.' },
      { q: 'Who holds the money?', a: 'You keep the cash you take at the counter. Digital payments (Fonepay) settle through us. Each month we net the two against your share and send one clear statement.' },
      { q: 'Can I change the recipes or the prices?', a: 'No. Every drink is made to the Sadhai standard and sold at the Sadhai price, so customers get the same coffee wherever they order. You can still sell your own food.' },
      { q: 'What does it cost to join?', a: 'There is no franchise fee in this model. Ask us for the current terms.' },
    ],
    contact_note: 'Prefer to talk first? Email us and we will call you back.',
  },
  investors: {
    headline: 'Invest in Nepal’s everyday specialty coffee',
    intro: 'Sadhai Coffee sells good Nepali coffee at one honest price, ready in 90 seconds, through pickup counters inside existing cafes, hospitals, campuses and bus stands.',
    why: ['Nepal grows excellent coffee, and most of it is still sold unroasted or as a one-off gift. An everyday habit is a large, open market.', 'Pickup counters need little space and few people, so a new location is cheap to open and fast to learn from.', 'One app, one standard recipe and one price make every counter the same, which is what lets a small team run many.'],
    model: ['Counters run by Sadhai, and by partner cafes that keep a share of sales', 'Beans from Sevya Coffee Processing, bought and stocked centrally', 'App-first ordering with a 10-cup pass, referrals and one limited drop a month', 'One live dashboard for sales, stock, staff, cash and partner statements'],
    metrics: [],
    roadmap: [{ when: 'Now', what: 'Prove the model at a handful of counters' }, { when: 'Next', what: 'Open one proven counter every 90 days, mostly through partner cafes' }, { when: 'Then', what: 'Add vending lockers and fuel-station pods once three counters hold their numbers' }],
    use_of_funds: [],
    risks: ['Early stage: results from a few counters may not hold as the network grows.', 'Coffee, milk and cup prices move, which changes margin.', 'Partner cafes must follow the standard; one bad counter affects the brand.', 'Mobile payment providers and app stores can change their rules.'],
    deck_url: '', show_unit_economics: false,
    contact_note: 'We share more detail with serious investors under an agreement. Tell us a little about you below.',
  },
  marquee: 'Good coffee, every day · सधैं राम्रो कफी · Grown in the hills · Ready in 90 seconds · Prices include VAT and service',
};

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
export const mediaUrl = (id, mime) => `${rt('public_api_url')}/media/${id}.${EXT[mime] || 'bin'}`;

export async function loadSite(section) {
  const { rows } = await query('SELECT key, value, updated_at FROM site_content');
  const saved = Object.fromEntries(rows.map((r) => [r.key, r]));
  const merged = {};
  for (const k of Object.keys(SITE_DEFAULTS)) {
    const d = SITE_DEFAULTS[k], v = saved[k]?.value;
    merged[k] = Array.isArray(d) ? (Array.isArray(v) ? d.map((x, i) => ({ ...x, ...(v[i] || {}) })) : d) : typeof d === 'object' ? { ...d, ...(v || {}), layers: d.layers ? { ...d.layers, ...(v?.layers || {}) } : undefined } : (v ?? d);
    if (merged[k] && merged[k].layers === undefined) delete merged[k].layers;
  }
  // swap media ids for urls
  const ids = new Set();
  const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if ((k === 'art' || k === 'timer_cup' || k === 'portrait' || ['sun', 'far', 'mid', 'near'].includes(k)) && typeof v === 'string') ids.add(v); else walk(v); } };
  walk(merged);
  const found = ids.size ? (await query('SELECT id, mime FROM media WHERE id = ANY($1::uuid[])', [[...ids]])).rows : [];
  const byId = new Map(found.map((m) => [m.id, m]));
  const resolve = (o) => {
    if (Array.isArray(o)) return o.map(resolve);
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ((k === 'art' || k === 'timer_cup' || k === 'portrait' || ['sun', 'far', 'mid', 'near'].includes(k)) && (typeof v === 'string' || v === null)) ? (v && byId.has(v) ? { id: v, url: mediaUrl(v, byId.get(v).mime) } : null) : resolve(v)]));
    return o;
  };
  const out = resolve(merged);
  return section ? out[section] : { ...out, updated_at: rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), null) };
}
