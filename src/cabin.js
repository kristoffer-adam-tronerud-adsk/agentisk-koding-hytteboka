// The rules of the cabin book.
//
// Everything that is stored is one object:
//
//   bookings: { [week]: { name, at } }                              who has the cabin that week
//   draws:    { [week]: { label, weeks, entries: [{ name, at }] } } the stays a winner is drawn for
//
// A week has at most one booking, since bookings are kept by week.
// A draw is kept under its first week, and is for `weeks` weeks in a row from there (1 when it is not said).
// Easter is two: one trip, so the winner gets both weeks, and nobody can have half of it.
// A draw is done when its first week has a booking: that booking is the winner, and its `at` is when it was drawn.
//
// Each rule takes the state and what someone wants, and either changes the state and answers
// { ok: true }, or leaves it as it was and answers { ok: false, status, message } with words for the person.

import { randomInt } from 'node:crypto';
import { addWeeks, currentWeek, easterWeek, isWeekId, weekNumber, weeksFrom } from './weeks.js';

/** How many weeks are shown and can be booked, counting the one we are in. */
export const HORIZON = 52;

const NAME_LENGTH = 60;
const LABEL_LENGTH = 40;

/** How many weeks a draw can be for. */
const DRAW_WEEKS = [1, 2];

export function emptyState() {
  return { bookings: {}, draws: {} };
}

/** What the book holds the first time it is opened: the weeks Gro named, set up for a draw. */
export function firstState(now = new Date()) {
  const state = emptyState();
  const today = currentWeek(now);
  const year = Number(today.slice(0, 4));
  const next = (startIn, weeks = 1) => [startIn(year), startIn(year + 1)]
    .find((week) => isOpen(week, today) && weeksFrom(week, weeks).every((each) => isOpen(each, today)));

  // Easter is the week before and the week from Good Friday: Palm Sunday, the school break and the Easter days.
  const winterBreak = next((y) => `${y}-W08`);
  const easter = next((y) => addWeeks(easterWeek(y), -1), 2);
  if (winterBreak) state.draws[winterBreak] = { label: 'Vinterferie', weeks: 1, entries: [] };
  if (easter) state.draws[easter] = { label: 'Påske', weeks: 2, entries: [] };
  return state;
}

/** A name as someone typed it, tidied. Empty when it cannot be used as a name. */
export function readName(text) {
  const name = tidy(text);
  return name.length <= NAME_LENGTH ? name : '';
}

export function sameName(a, b) {
  return tidy(a).toLocaleLowerCase('nb') === tidy(b).toLocaleLowerCase('nb');
}

export function isEntered(draw, name) {
  return draw.entries.some((entry) => sameName(entry.name, name));
}

/**
 * The weeks from this one on, each with what stands in the book about it.
 * A draw for more than one week is one entry, since it is one stay.
 */
export function calendar(state, today) {
  const entries = [];
  for (const week of weeksFrom(today, HORIZON)) {
    const start = drawCovering(state, week) ?? week;
    if (entries.at(-1)?.week !== start) entries.push(describe(state, start));
  }
  return entries;
}

export function describe(state, week) {
  const draw = state.draws[week] ?? null;
  return { week, weeks: draw ? drawWeeks(week, draw) : [week], booking: state.bookings[week] ?? null, draw };
}

/** The weeks a draw is for, from the week it is kept under. */
export function drawWeeks(start, draw) {
  return weeksFrom(start, draw.weeks ?? 1);
}

/** The week the draw that holds `week` is kept under, or null when no draw holds it. */
function drawCovering(state, week) {
  return Object.keys(state.draws).find((start) => drawWeeks(start, state.draws[start]).includes(week)) ?? null;
}

export function book(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  const start = drawCovering(state, week);
  if (start) {
    const which = drawName(start, state.draws[start]);
    return booking
      ? refuse(`Det er trukket lodd om ${which}, og hytta gikk til ${booking.name}.`)
      : refuse(`Det trekkes lodd om ${which}. Meld deg på trekningen i stedet.`);
  }
  if (booking) {
    return sameName(booking.name, name)
      ? refuse(`Du har allerede ${uke(week)}.`)
      : refuse(`${Uke(week)} er allerede booket av ${booking.name}.`);
  }

  state.bookings[week] = { name: readName(name), at: now };
  return done();
}

/**
 * Giving a week up. A week that was won in a draw goes back to be drawn among the others,
 * and with it every week of that draw: the winner cannot keep half of Easter.
 */
export function cancel(state, { week, name, today }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (!booking) return refuse(`${Uke(week)} er ikke booket.`);
  if (!sameName(booking.name, name)) return refuse(`${Uke(week)} er booket av ${booking.name}, ikke av deg.`, 403);

  const start = drawCovering(state, week);
  const draw = start && state.draws[start];
  for (const each of draw ? drawWeeks(start, draw) : [week]) delete state.bookings[each];
  if (draw) draw.entries = draw.entries.filter((entry) => !sameName(entry.name, name));
  return done();
}

export function enter(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  if (isEntered(draw, name)) return refuse(`Du er allerede påmeldt trekningen om ${drawName(week, draw)}.`);

  draw.entries.push({ name: readName(name), at: now });
  return done();
}

export function withdraw(state, { week, name, today }) {
  const problem = weekProblem(week, today) ?? nameProblem(name) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  if (!isEntered(draw, name)) return refuse(`Du er ikke påmeldt trekningen om ${drawName(week, draw)}.`);

  draw.entries = draw.entries.filter((entry) => !sameName(entry.name, name));
  return done();
}

/**
 * Draws the winner: one of those entered, each with the same chance, and books every week of the draw for them.
 * `pick(count)` answers a whole number from 0 up to, not including, count.
 */
export function drawWinner(state, { week, today, now, pick = randomInt }) {
  const problem = weekProblem(week, today) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  const { entries } = draw;
  if (entries.length === 0) return refuse(`Ingen har meldt seg på trekningen om ${drawName(week, draw)} ennå.`);

  const winner = pick(entries.length);
  for (const each of drawWeeks(week, draw)) state.bookings[each] = { name: entries[winner].name, at: now };
  return done({ winner, entries: entries.map((entry) => entry.name) });
}

/** Setting up a draw for `weeks` weeks from `week`. Every one of them has to be free. */
export function markDraw(state, { week, label, weeks = 1, today }) {
  const problem = weekProblem(week, today);
  if (problem) return problem;

  const title = tidy(label);
  if (title.length > LABEL_LENGTH) return refuse(`Navnet på uka kan være på ${LABEL_LENGTH} tegn.`, 400);
  if (!DRAW_WEEKS.includes(weeks)) return refuse('Velg om trekningen gjelder én eller to uker.', 400);
  for (const each of weeksFrom(week, weeks)) {
    if (drawCovering(state, each)) return refuse(`Det trekkes allerede lodd om ${uke(each)}.`);
    const booking = state.bookings[each];
    if (booking) return refuse(`${Uke(each)} er allerede booket av ${booking.name}, så den kan det ikke trekkes lodd om.`);
    if (!isOpen(each, today)) return refuse(`${Uke(each)} er for langt fram til å stå i boka ennå.`);
  }

  state.draws[week] = { label: title, weeks, entries: [] };
  return done();
}

export function unmarkDraw(state, { week, today }) {
  const problem = weekProblem(week, today) ?? drawProblem(state, week);
  if (problem) return problem;

  const count = state.draws[week].entries.length;
  if (count > 0) {
    return refuse(`${count} har meldt seg på trekningen om ${drawName(week, state.draws[week])}, så den kan ikke gjøres om til en vanlig uke.`);
  }

  delete state.draws[week];
  return done();
}

/** "uke 12", or "uke 12 og 13" for a stay of two weeks. */
export function uke(week, count = 1) {
  return `uke ${weekNumbers(week, count)}`;
}

export function Uke(week, count = 1) {
  return `Uke ${weekNumbers(week, count)}`;
}

function weekNumbers(week, count) {
  if (count === 1) return `${weekNumber(week)}`;
  const numbers = weeksFrom(week, count).map(weekNumber);
  return `${numbers.slice(0, -1).join(', ')} og ${numbers.at(-1)}`;
}

function drawName(start, draw) {
  return uke(start, draw.weeks ?? 1);
}

function isOpen(week, today) {
  return isWeekId(week) && week >= today && week < addWeeks(today, HORIZON);
}

function weekProblem(week, today) {
  if (!isWeekId(week)) return refuse('Den uka finnes ikke.', 404);
  if (week < today) return refuse(`${Uke(week)} er over.`);
  if (!isOpen(week, today)) return refuse(`${Uke(week)} er for langt fram til å stå i boka ennå.`);
  return null;
}

function nameProblem(name) {
  return readName(name) ? null : refuse('Skriv navnet ditt først.', 400);
}

/** Why nobody can enter, leave or draw: there is no draw for the week, or it is done. */
function drawProblem(state, week) {
  const draw = state.draws[week];
  if (!draw) return refuse(`Det trekkes ikke lodd om ${uke(week)}.`);
  const booking = state.bookings[week];
  if (booking) return refuse(`Trekningen om ${drawName(week, draw)} er gjort. Hytta gikk til ${booking.name}.`);
  return null;
}

function tidy(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
}

function refuse(message, status = 409) {
  return { ok: false, status, message };
}

function done(more = {}) {
  return { ok: true, ...more };
}
