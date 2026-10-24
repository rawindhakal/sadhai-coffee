import { closeStaleShifts } from './roster.js';
import { releaseDueOrders } from './orders.js';

/** Background jobs: scheduled orders move to the station queue, and shifts nobody closed are closed. */
export function startScheduler() {
  const release = () => releaseDueOrders().catch((e) => console.error('release', e.message));
  const shifts = () => closeStaleShifts().catch((e) => console.error('shifts', e.message));
  setInterval(release, 30_000).unref();
  setInterval(shifts, 10 * 60_000).unref();
  setTimeout(shifts, 20_000).unref();
}
