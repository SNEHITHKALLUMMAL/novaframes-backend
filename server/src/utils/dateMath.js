/**
 * Adds one billing interval to a date, correctly handling JS Date's
 * month-overflow behavior (Jan 31 + 1 month naively overflows to Mar 3
 * instead of clamping to Feb 28; a leap day + 1 year overflows to Mar 1
 * instead of Feb 28). Extracted from subscription.service.js into its own
 * module specifically so this logic — found and fixed via testing in
 * Phase 18 — can be unit-tested in isolation, without pulling in
 * mongoose/the rest of the subscription service's dependencies.
 */
export function addInterval(date, billingCycle) {
  const next = new Date(date);
  const originalDay = next.getDate();

  if (billingCycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  if (next.getDate() !== originalDay) {
    next.setDate(0); // clamp back to the last valid day of the intended month
  }

  return next;
}
