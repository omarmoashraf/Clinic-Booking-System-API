/**
 * Clinic scheduling time helpers.
 *
 * All clinic dates/times are interpreted in the single clinic timezone
 * `Africa/Cairo` (PRD decision from Milestone 12). Availability slots are
 * stored as a local DATE plus local start/end TIMEs — canonical wall-clock
 * values with no timezone attached:
 *   - date       → Date at UTC midnight (the calendar day itself)
 *   - start_time → Date anchored at the epoch (UTC time-of-day == wall clock)
 *   - end_time   → Date anchored at the epoch
 *
 * Deciding whether an appointment is "past" needs real instants, so these
 * helpers combine the stored wall-clock values into an instant in
 * Africa/Cairo. The conversion goes through Intl.DateTimeFormat so daylight
 * saving transitions (Egypt reintroduced DST in 2023) are handled by the
 * platform's timezone database instead of a hardcoded UTC+02/+03 offset.
 */

export const CLINIC_TIMEZONE = 'Africa/Cairo';

const wallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Offset of the clinic timezone at a given instant, in minutes east of UTC.
 */
const zoneOffsetMinutes = (instant) => {
  const parts = Object.fromEntries(
    wallClockFormatter.formatToParts(instant).map((part) => [part.type, part.value])
  );
  // hour may come back "24" on some platforms; normalize to 0.
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUTC - instant.getTime()) / 60000);
};

/**
 * Convert clinic-local wall-clock components to the exact UTC instant that
 * has those wall-clock values in Africa/Cairo. Two-pass offset resolution
 * handles instants that fall inside a DST fold/gap.
 */
export const clinicWallClockToInstant = ({ year, month, day, hour = 0, minute = 0 }) => {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMinutes(new Date(guess));
  guess -= offset * 60000;
  const correctedOffset = zoneOffsetMinutes(new Date(guess));
  if (correctedOffset !== offset) {
    guess -= (correctedOffset - offset) * 60000;
  }
  return new Date(guess);
};

/**
 * The instant a slot ends in the clinic timezone.
 * `slot` is an availability row (date + end_time in the stored conventions).
 */
export const slotEndInstant = (slot) => {
  // Both columns are stored canonically (UTC midnight / epoch-anchored),
  // so slicing their ISO strings yields the exact stored wall-clock values.
  const [year, month, day] = slot.date.toISOString().slice(0, 10).split('-').map(Number);
  const [hour, minute] = slot.end_time.toISOString().slice(11, 16).split(':').map(Number);
  return clinicWallClockToInstant({ year, month, day, hour, minute });
};

/**
 * Whether an appointment's slot has fully elapsed in clinic time.
 * Used by the appointment state machine: past appointments are immutable
 * except for a doctor marking their own CONFIRMED appointment COMPLETED.
 */
export const isSlotPast = (slot, now = new Date()) => slotEndInstant(slot).getTime() < now.getTime();
