// A week on the cabin runs Friday to Friday, and is named after the ISO week its days off fall in:
// "2027-W08" runs from Friday 19 February to Friday 26 February 2027.
// The ones leaving are out by 12:00 on Friday, so that is when one week ends and the next begins.
// Written that way, weeks sort as text: "2026-W53" < "2027-W01".
//
// Every date here is a calendar day held as midnight UTC, so summer time never moves one.

const DAY = 86_400_000;
const HANDOVER_HOUR = 12;
const WEEK_ID = /^(\d{4})-W(\d{2})$/;

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const osloDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

const osloMoment = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** The week a day is in. A Friday is the first day of the week that arrives. */
export function weekIdOf(date) {
  return isoWeekOf(new Date(date.getTime() + 3 * DAY));
}

function isoWeekOf(date) {
  // A week belongs to the year its Thursday is in.
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Friday a week starts on, or null when the text names no week (as "2027-W53" does not). */
export function fridayOf(id) {
  const monday = mondayOf(id);
  return monday && new Date(monday.getTime() - 3 * DAY);
}

function mondayOf(id) {
  const match = WEEK_ID.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // 4 January is always in week 1.
  const monday = new Date(Date.UTC(year, 0, 4));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1 + (week - 1) * 7);
  return isoWeekOf(monday) === id ? monday : null;
}

export function isWeekId(id) {
  return typeof id === 'string' && mondayOf(id) !== null;
}

export function weekNumber(id) {
  return Number(id.slice(-2));
}

export function addWeeks(id, count) {
  return weekIdOf(new Date(mondayOf(id).getTime() + count * 7 * DAY));
}

export function weeksFrom(id, count) {
  return Array.from({ length: count }, (_, index) => addWeeks(id, index));
}

/** The week it is in Norway at this moment. Until 12:00 on Friday, that is still the week that is leaving. */
export function currentWeek(now = new Date()) {
  const parts = Object.fromEntries(osloDay.formatToParts(now).map((part) => [part.type, part.value]));
  const today = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const leaving = parts.weekday === 'Fri' && Number(parts.hour) < HANDOVER_HOUR;
  return weekIdOf(leaving ? new Date(today.getTime() - DAY) : today);
}

export function easterSunday(year) {
  // The anonymous Gregorian algorithm (Meeus, Jones, Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The week that starts on Good Friday, so it holds the whole Easter weekend and Easter Monday. */
export function easterWeek(year) {
  return weekIdOf(new Date(easterSunday(year).getTime() - 2 * DAY));
}

/**
 * "19.–26. mars 2027", or without the year where a heading above already says it.
 * A stay of more than one week runs to the Friday after its last week: "19. mars – 2. april 2027".
 */
export function formatRange(id, { year = true, weeks = 1 } = {}) {
  const from = fridayOf(id);
  const to = new Date(from.getTime() + weeks * 7 * DAY);
  const day = (date) => `${date.getUTCDate()}.`;
  const month = (date) => MONTHS[date.getUTCMonth()];
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const closing = year ? ` ${to.getUTCFullYear()}` : '';

  if (from.getUTCMonth() === to.getUTCMonth()) return `${day(from)}–${day(to)} ${month(to)}${closing}`;
  const opening = year && !sameYear ? ` ${from.getUTCFullYear()}` : '';
  return `${day(from)} ${month(from)}${opening} – ${day(to)} ${month(to)}${closing}`;
}

/** The month a week is listed under: the one most of its seven nights fall in, which is the month of its Monday. */
export function monthOf(id) {
  const monday = mondayOf(id);
  const name = MONTHS[monday.getUTCMonth()];
  return `${name[0].toUpperCase()}${name.slice(1)} ${monday.getUTCFullYear()}`;
}

/** "11. oktober 2026 kl. 15:42", in Norwegian time, from a stored moment. */
export function formatMoment(iso) {
  return osloMoment.format(new Date(iso));
}
