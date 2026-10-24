/**
 * What counts as a sale, everywhere (overview, live board, station day, partner statement, scorecard, customers):
 * an order that has been handed over to the customer (picked up). Cash is collected at hand-over, so a picked-up order is a paid order.
 * Orders still in the queue are "in progress", never sales. Cancelled orders are nothing.
 */
export const SALE = `o.status = 'picked_up'`;
export const IN_PROGRESS = `o.status IN ('placed','preparing','ready')`;
