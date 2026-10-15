// In-memory Server-Sent Events hub. For multiple API instances swap publish() for Postgres LISTEN/NOTIFY or Redis.
const channels = new Map();

export function subscribe(res, chans) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res };
  for (const c of chans) {
    if (!channels.has(c)) channels.set(c, new Set());
    channels.get(c).add(client);
  }
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => {
    clearInterval(ping);
    for (const c of chans) channels.get(c)?.delete(client);
  });
}

export function publish(chans, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of [].concat(chans)) channels.get(c)?.forEach((cl) => cl.res.write(payload));
}
