/** Same-origin coordination for cooperating calendar manager instances only. */
export async function withCalendarSyncLock<T>(ownerUserId: string, operation: () => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ownerUserId)
    || ownerUserId === '00000000-0000-0000-0000-000000000000') throw new Error('Calendar owner is unavailable.');
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
    throw new Error('Calendar coordination is unavailable in this browser.');
  }
  // Never steal a lock or release it on sign-out: an admitted local transaction
  // may still be settling. A second tab can explicitly try again after it ends.
  return navigator.locks.request(`mind-manual:calendar-sync:v1:${ownerUserId}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Another calendar operation is still running.');
    return operation();
  });
}
