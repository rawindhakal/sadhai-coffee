# Recipes, costing and inventory

## The numbers behind the costing
Every ingredient is bought in a pack, so its cost is **pack price ÷ units in the pack**, then **wastage** is added.

| Ingredient | Bought as | Price | Cost per unit | Wastage |
|---|---|---|---|---|
| Coffee beans | 1 kg (1,000 g) | Rs 2,500 | Rs 2.50 / g | 10% |
| Water | 1 L (1,000 ml) | Rs 5 | Rs 0.005 / ml | 0 |
| Milk | 1 L | Rs 110 | Rs 0.11 / ml | 0 |
| Ice | 1 kg | Rs 50 | Rs 0.05 / g | 0 |
| Sugar | sachet (box of 100 = Rs 500) | Rs 5 | Rs 5 / sachet | 0 |
| Syrups (chiya, suntala, gur, chocolate) | 1 L | Rs 1,500 | Rs 1.50 / ml | 0 |
| Cups, bakery, merch | by the sleeve, tray or carton | see Ingredients and prices | per piece | 0 |

The sugar price (Rs 5) is entered **per sachet**. If you meant a different unit, change the pack on Ingredients and prices and every recipe re-costs.

**A double shot of espresso is 16 g of coffee.** With 10% wastage: 16 × Rs 2.50 × 1.10 = **Rs 44.00**.
So an Americano (16 g coffee + 120 ml water + a hot cup) costs 44.00 + 0.60 + 9.00 = **Rs 53.60**, and a Latte (adds 180 ml milk) costs Rs 72.80.

The same 10% wastage is added to the stock a sale takes (17.6 g per double shot), so shelf counts agree with the costing and any loss beyond the allowance shows up as a count difference.

Options carry their own recipe: *Large* adds milk, ice or water; *Oat* removes milk and adds the same amount of oat milk; *Extra shot* adds 16 g of coffee; *Sugar* adds 1 or 2 sachets. The order stores the real cost of what was sold, so margin reports are exact.

## Where it lives
- **Dashboard, Costing and stock, Recipes and costing**: every item with cost, margin, food-cost % against your target (default 35%), and the price that would hit the target. Click an item for the cost breakdown, option effects, a price what-if slider, and (owner) the recipe editor with the barista method.
- **Ingredients and prices**: change a pack price or wastage and see which items moved. Price history is kept.
- Changing a price re-costs every recipe at once (`products.cost` is calculated, not typed).

## Central purchasing and stock flow
Everything is bought centrally, held in the **central store**, and sent to stations.

1. **Suppliers and purchasing**: create a purchase order (packs and price per pack). Receiving it books stock into the central store, records the real price paid against the standard cost, and can update the standard cost.
2. **Suggested purchases**: items at or below their central reorder level, topped up to the par level, with an estimated cost.
3. **Station requests**: a station (or manager) requests stock, or presses "Fill up to par levels".
4. **Dispatch**: the warehouse (owner, or a manager with the warehouse role) sends it. The central store goes down immediately.
5. **Receive**: the station confirms what actually arrived. A short or damaged delivery is recorded at cost and alerts the owner.
6. **Sales** deduct recipe quantities (with wastage) from the station.
7. **Shelf counts**: staff count what is on the shelf. The difference from the system is logged at cost; large differences alert the manager and owner.
8. **All stations** shows every ingredient at the central store and every station at a glance; valuation shows the money tied up in stock.

Every movement writes a ledger row (`central_moves`, `inventory_moves`) and an audit-log entry, so each unit can be traced from supplier to cup.
