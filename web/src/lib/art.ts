// Illustrations for menu items, keyed by SKU, with a fallback by product kind.
const BY_SKU: Record<string, string> = {
  ESP: 'espresso', AMR: 'cup-hot', CAP: 'cup-hot', LAT: 'latte', MOC: 'cup-hot', ICL: 'cup-iced', CLB: 'cup-iced', CHL: 'chiya', SCB: 'cup-iced-orange',
  GPO: 'pourover', GUR: 'chiya', CRO: 'croissant', BUN: 'bun', MUG: 'mug', TOT: 'tote', BAG: 'bag', HAT: 'hat',
};
export const productArt = (p: { sku?: string; kind?: string; image_url?: string | null }) => p.image_url || `/img/${BY_SKU[p.sku || ''] || (p.kind === 'merch' ? 'bag' : p.kind === 'food' ? 'croissant' : 'cup-hot')}.svg`;
