import { query } from './db.js';

/**
 * Recipe costing.
 *  unit_cost  = pack_price / pack_size                       (Rs per g, ml or piece)
 *  effective  = unit_cost x (1 + waste_pct / 100)            (what a unit really costs once allowed wastage is counted)
 *  line cost  = recipe qty x effective
 * Example: coffee Rs 2,500 per kg, 10% wastage, a 16 g double shot: 16 x 2.5 x 1.10 = Rs 44.00.
 * The same wastage allowance is added to stock use, so stock counts stay in step with the costing.
 */
export const effectiveUnitCost = (ing) => Number(ing.unit_cost) * (1 + Number(ing.waste_pct || 0) / 100);

export const unitCostFromPack = (packPrice, packSize) => (Number(packSize) > 0 ? Number(packPrice) / Number(packSize) : 0);

/** Cost breakdown for a product with the given chosen option ids. Option recipes add (or remove, if negative) per unit. */
export async function recipeBreakdown(productId, optionIds = [], db = { query }) {
  const base = (await db.query(
    `SELECT r.ingredient_id, r.qty, i.name, i.unit, i.unit_cost, i.waste_pct, i.category FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.product_id=$1`, [productId])).rows;
  const map = new Map(base.map((r) => [r.ingredient_id, { ...r, qty: Number(r.qty) }]));
  if (optionIds.length) {
    const opt = (await db.query(
      `SELECT o.ingredient_id, sum(o.qty)::numeric AS qty, i.name, i.unit, i.unit_cost, i.waste_pct, i.category FROM option_recipes o JOIN ingredients i ON i.id=o.ingredient_id
        WHERE o.option_id = ANY($1::uuid[]) GROUP BY o.ingredient_id, i.name, i.unit, i.unit_cost, i.waste_pct, i.category`, [optionIds])).rows;
    for (const r of opt) { const cur = map.get(r.ingredient_id); if (cur) cur.qty += Number(r.qty); else map.set(r.ingredient_id, { ...r, qty: Number(r.qty) }); }
  }
  const lines = [...map.values()].filter((l) => l.qty > 0).map((l) => {
    const eff = effectiveUnitCost(l);
    return { ingredient_id: l.ingredient_id, name: l.name, unit: l.unit, category: l.category, qty: l.qty, use_qty: l.qty * (1 + Number(l.waste_pct) / 100), unit_cost: Number(l.unit_cost), waste_pct: Number(l.waste_pct), cost: l.qty * eff };
  });
  return { lines, cost: lines.reduce((a, l) => a + l.cost, 0) };
}

/** Stock a line will use: recipe plus chosen options, with the wastage allowance. Returns Map(ingredient_id -> qty). */
export async function stockNeeds(db, items) {
  const needs = new Map();
  for (const it of items) {
    const { lines } = await recipeBreakdown(it.product_id, it.option_ids || [], db);
    for (const l of lines) needs.set(l.ingredient_id, (needs.get(l.ingredient_id) || 0) + l.use_qty * it.qty);
  }
  return needs;
}

/** Re-prices products.cost from recipes. Pass an ingredient id to touch only products that use it. Returns what moved. */
export async function recomputeProductCosts(db = { query }, { ingredientId = null, productId = null } = {}) {
  const { rows: prods } = await db.query(
    `SELECT p.id, p.name, p.price, p.cost FROM products p WHERE ($1::uuid IS NULL OR p.id=$1)
       AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM recipes r WHERE r.product_id=p.id AND r.ingredient_id=$2)
            OR EXISTS (SELECT 1 FROM option_recipes orr JOIN options o ON o.id=orr.option_id JOIN option_groups g ON g.id=o.group_id WHERE g.product_id=p.id AND orr.ingredient_id=$2))`,
    [productId, ingredientId]);
  const moved = [];
  for (const p of prods) {
    const { lines, cost } = await recipeBreakdown(p.id, await defaultOptionIds(p.id, db), db);
    if (!lines.length) continue; // products without a recipe keep their manual cost
    const next = Math.round(cost);
    if (next !== p.cost) { await db.query('UPDATE products SET cost=$2 WHERE id=$1', [p.id, next]); moved.push({ id: p.id, name: p.name, price: p.price, before: p.cost, after: next }); }
  }
  return moved;
}

async function defaultOptionIds(productId, db) {
  return (await db.query(`SELECT o.id FROM options o JOIN option_groups g ON g.id=o.group_id WHERE g.product_id=$1 AND o.is_default`, [productId])).rows.map((r) => r.id);
}

/** All products with cost, margin and a flag against the target food-cost %. */
export async function costingTable(targetPct, db = { query }) {
  const { rows } = await db.query(
    `SELECT p.id, p.sku, p.name, p.price, p.cost, p.kind, p.active, c.name AS category,
            EXISTS (SELECT 1 FROM recipes r WHERE r.product_id=p.id) AS has_recipe
       FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort, p.sort, p.name`);
  return rows.map((p) => {
    const foodCostPct = p.price ? Math.round((p.cost / p.price) * 1000) / 10 : 0;
    return {
      ...p, margin: p.price - p.cost, margin_pct: p.price ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : 0, food_cost_pct: foodCostPct,
      over_target: p.has_recipe && foodCostPct > targetPct, suggested_price: p.cost && targetPct ? Math.ceil(((p.cost / (targetPct / 100)) / 5)) * 5 : null,
    };
  });
}
