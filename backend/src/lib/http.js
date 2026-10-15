import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const bad = (m, c) => new HttpError(400, m, c);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const forbidden = (m = 'Not allowed') => new HttpError(403, m);
export const conflict = (m, c) => new HttpError(409, m, c);

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.code === '23505') return res.status(409).json({ error: 'Already exists' });
  if (err?.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}

export const parse = (schema, data) => schema.parse(data);

// Nepal mobile numbers: 97/98 + 8 digits, optional +977. Stored as +977XXXXXXXXXX.
export function normalizePhone(raw) {
  const d = String(raw || '').replace(/[\s-]/g, '');
  const m = d.match(/^(?:\+?977)?(9[78]\d{8})$/);
  if (!m) throw bad('Enter a valid Nepal mobile number, for example 9812345678');
  return `+977${m[1]}`;
}

export const npr = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;
