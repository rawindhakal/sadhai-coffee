import { query } from './db.js';
import { publish } from './hub.js';
import { sendToUser } from './push.js';

export async function notify(userId, { kind = 'info', title, body = null, data = null }, db = { query }) {
  if (!userId) return;
  const { rows } = await db.query(
    'INSERT INTO notifications(user_id, kind, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [userId, kind, title, body, data],
  );
  publish(`user:${userId}`, 'notification', rows[0]);
  // Phone and browser push, fire and forget so a slow provider never delays an order.
  sendToUser(userId, { kind, title, body, data: { ...(data || {}), notification_id: rows[0].id } }).catch((e) => console.error('push failed', e.message));
}

export async function audit(actorId, action, entity, entityId, meta = null, db = { query }) {
  await db.query('INSERT INTO audit_log(actor_id, action, entity, entity_id, meta) VALUES ($1,$2,$3,$4,$5)', [
    actorId, action, entity, entityId == null ? null : String(entityId), meta,
  ]);
}
