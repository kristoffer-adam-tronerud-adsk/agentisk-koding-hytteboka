import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  book, calendar, cancel, drawWinner, emptyState, enter, firstState, HORIZON, markDraw, readName, sameName,
  unmarkDraw, withdraw,
} from '../src/cabin.js';
import { easterSunday, formatRange, weekIdOf } from '../src/weeks.js';

// The week the tests happen in: Friday 9 to Friday 16 October 2026.
const TODAY = '2026-W42';
const AUTUMN = '2026-W45';
// Easter 2027 is one trip of two weeks: the week before, and the one from Good Friday.
const EASTER = '2027-W12';
const EASTER_WEEK = '2027-W13';
const NOW = '2026-10-14T08:00:00.000Z';

const as = (name, week) => ({ name, week, today: TODAY, now: NOW });

/** A book where a winner is to be drawn for Easter. */
function bookWithEaster(...entered) {
  const state = emptyState();
  state.draws[EASTER] = { label: 'Påske', weeks: 2, entries: [] };
  for (const name of entered) assert.equal(enter(state, as(name, EASTER)).ok, true);
  return state;
}

/** Checks that a rule said no, with the words it used, and left the book as it was. */
function refused(state, rule, wish, words, status = 409) {
  const before = structuredClone(state);
  const answer = rule(state, wish);
  assert.equal(answer.ok, false);
  assert.equal(answer.status, status);
  assert.match(answer.message, words);
  assert.deepEqual(state, before, 'a refused wish changes nothing');
}

describe('booking a week', () => {
  test('a free week goes to the one who books it', () => {
    const state = emptyState();
    assert.deepEqual(book(state, as('Ola Nordmann', AUTUMN)), { ok: true });
    assert.deepEqual(state.bookings[AUTUMN], { name: 'Ola Nordmann', at: NOW });
  });

  test('a week that is taken cannot be booked by someone else', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, book, as('Kari Hansen', AUTUMN), /Uke 45 er allerede booket av Ola Nordmann/);
    assert.equal(state.bookings[AUTUMN].name, 'Ola Nordmann');
  });

  test('the one who has the week is told so when they book it again', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, book, as('ola nordmann', AUTUMN), /Du har allerede uke 45/);
  });

  test('the week we are in can be booked, and the last of the 52', () => {
    const state = emptyState();
    assert.equal(book(state, as('Ola Nordmann', TODAY)).ok, true);
    assert.equal(book(state, as('Ola Nordmann', '2027-W40')).ok, true);
  });

  test('a week that is over, too far ahead or not a week cannot be booked', () => {
    const state = emptyState();
    refused(state, book, as('Ola Nordmann', '2026-W41'), /Uke 41 er over/);
    refused(state, book, as('Ola Nordmann', '2027-W41'), /for langt fram/);
    refused(state, book, as('Ola Nordmann', '2027-W53'), /finnes ikke/, 404);
    refused(state, book, as('Ola Nordmann', 'tull'), /finnes ikke/, 404);
  });

  test('nobody books without a name', () => {
    const state = emptyState();
    refused(state, book, as('', AUTUMN), /Skriv navnet ditt/, 400);
    refused(state, book, as('   ', AUTUMN), /Skriv navnet ditt/, 400);
    refused(state, book, as('x'.repeat(61), AUTUMN), /Skriv navnet ditt/, 400);
  });

  test('a name is the same however it is typed', () => {
    assert.equal(readName('  Ola \t Nordmann\n'), 'Ola Nordmann');
    assert.equal(sameName('Ola Nordmann', ' ola   NORDMANN '), true);
    assert.equal(sameName('Åse Ødegård', 'åse ødegård'), true);
    assert.equal(sameName('Ola Nordmann', 'Ola Normann'), false);
  });
});

describe('giving a week up', () => {
  test('the one who has the week can give it up, and then it is free', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    assert.equal(cancel(state, as('ola nordmann', AUTUMN)).ok, true);
    assert.equal(state.bookings[AUTUMN], undefined);
    assert.equal(book(state, as('Kari Hansen', AUTUMN)).ok, true);
  });

  test('nobody gives up a week that is someone else’s', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, cancel, as('Kari Hansen', AUTUMN), /booket av Ola Nordmann, ikke av deg/, 403);
  });

  test('a week nobody has cannot be given up', () => {
    refused(emptyState(), cancel, as('Ola Nordmann', AUTUMN), /Uke 45 er ikke booket/);
  });
});

describe('entering a draw', () => {
  test('a week a winner is drawn for cannot be booked', () => {
    const state = bookWithEaster();
    refused(state, book, as('Ola Nordmann', EASTER), /Det trekkes lodd om uke 12 og 13/);
  });

  test('neither week of Easter can be booked on its own', () => {
    const state = bookWithEaster();
    refused(state, book, as('Ola Nordmann', EASTER_WEEK), /Det trekkes lodd om uke 12 og 13/);
  });

  test('those who want the week enter, in the order they came', () => {
    const state = bookWithEaster('Ola Nordmann', 'Kari Hansen');
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Ola Nordmann', 'Kari Hansen']);
    assert.equal(state.bookings[EASTER], undefined);
  });

  test('one person has one ticket', () => {
    const state = bookWithEaster('Ola Nordmann');
    refused(state, enter, as('OLA NORDMANN', EASTER), /Du er allerede påmeldt/);
  });

  test('someone who entered can leave again', () => {
    const state = bookWithEaster('Ola Nordmann', 'Kari Hansen');
    assert.equal(withdraw(state, as('ola nordmann', EASTER)).ok, true);
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Kari Hansen']);
    refused(state, withdraw, as('Ola Nordmann', EASTER), /Du er ikke påmeldt/);
  });

  test('there is no draw to enter for an ordinary week', () => {
    refused(emptyState(), enter, as('Ola Nordmann', AUTUMN), /Det trekkes ikke lodd om uke 45/);
    refused(emptyState(), withdraw, as('Ola Nordmann', AUTUMN), /Det trekkes ikke lodd om uke 45/);
  });

  test('nobody enters without a name, or for a week that is over', () => {
    const state = bookWithEaster();
    refused(state, enter, as('', EASTER), /Skriv navnet ditt/, 400);
    state.draws['2026-W41'] = { label: '', entries: [] };
    refused(state, enter, as('Ola Nordmann', '2026-W41'), /Uke 41 er over/);
  });
});

describe('drawing the winner', () => {
  const people = ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'];
  const draw = (state, pick) => drawWinner(state, { week: EASTER, today: TODAY, now: NOW, pick });

  test('the one whose ticket is picked gets the whole stay', () => {
    const state = bookWithEaster(...people);
    const asked = [];
    const answer = draw(state, (count) => {
      asked.push(count);
      return 1;
    });

    assert.deepEqual(answer, { ok: true, winner: 1, entries: people });
    assert.deepEqual(asked, [3], 'one pick among the three tickets');
    assert.deepEqual(state.bookings[EASTER], { name: 'Kari Hansen', at: NOW });
    assert.deepEqual(state.bookings[EASTER_WEEK], { name: 'Kari Hansen', at: NOW }, 'both weeks of Easter');
    assert.equal(state.draws[EASTER].entries.length, 3, 'the tickets stay, to show who was in the draw');
  });

  test('every ticket can win', () => {
    for (const [index, name] of people.entries()) {
      const state = bookWithEaster(...people);
      draw(state, () => index);
      assert.equal(state.bookings[EASTER].name, name);
    }
  });

  test('left to itself, the draw gives everyone the same chance', () => {
    const wins = [0, 0, 0];
    for (let round = 0; round < 6000; round += 1) {
      const state = bookWithEaster(...people);
      wins[drawWinner(state, { week: EASTER, today: TODAY, now: NOW }).winner] += 1;
    }
    // 2000 each on average. Outside 1800 to 2200 is more than five standard deviations away.
    for (const count of wins) assert.ok(count > 1800 && count < 2200, `wins were ${wins}`);
  });

  test('a single ticket wins', () => {
    const state = bookWithEaster('Ola Nordmann');
    assert.equal(drawWinner(state, { week: EASTER, today: TODAY, now: NOW }).winner, 0);
    assert.equal(state.bookings[EASTER].name, 'Ola Nordmann');
  });

  test('there is nothing to draw before someone has entered', () => {
    refused(bookWithEaster(), drawWinner, { week: EASTER, today: TODAY, now: NOW }, /Ingen har meldt seg på/);
  });

  test('a winner is drawn once', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, drawWinner, { week: EASTER, today: TODAY, now: NOW, pick: () => 2 }, /er gjort. Hytta gikk til Ola Nordmann/);
  });

  test('no winner is drawn for an ordinary week', () => {
    refused(emptyState(), drawWinner, { week: AUTUMN, today: TODAY, now: NOW }, /Det trekkes ikke lodd om uke 45/);
  });

  test('after the draw nobody enters, leaves or books the week', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, enter, as('Nina Berg', EASTER), /Trekningen om uke 12 og 13 er gjort/);
    refused(state, withdraw, as('Kari Hansen', EASTER), /Trekningen om uke 12 og 13 er gjort/);
    refused(state, book, as('Nina Berg', EASTER), /gikk til Ola Nordmann/);
    refused(state, book, as('Nina Berg', EASTER_WEEK), /gikk til Ola Nordmann/);
  });

  test('a winner who gives the week up is out, and it is drawn again among the others', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, cancel, as('Kari Hansen', EASTER), /ikke av deg/, 403);

    assert.equal(cancel(state, as('Ola Nordmann', EASTER)).ok, true);
    assert.equal(state.bookings[EASTER], undefined);
    assert.equal(state.bookings[EASTER_WEEK], undefined, 'nobody keeps half of Easter');
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Kari Hansen', 'Per Olsen']);

    assert.equal(enter(state, as('Nina Berg', EASTER)).ok, true, 'the draw is open again');
    assert.deepEqual(draw(state, () => 2), { ok: true, winner: 2, entries: ['Kari Hansen', 'Per Olsen', 'Nina Berg'] });
    assert.equal(state.bookings[EASTER].name, 'Nina Berg');
  });

  test('giving up the second week of Easter gives up the first as well', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    assert.equal(cancel(state, as('Ola Nordmann', EASTER_WEEK)).ok, true);
    assert.deepEqual(state.bookings, {});
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Kari Hansen', 'Per Olsen']);
  });
});

describe('choosing the weeks a winner is drawn for', () => {
  const choose = (week, label = '', weeks = 1) => ({ week, label, weeks, today: TODAY });

  test('a free week can be set up for a draw, with a name', () => {
    const state = emptyState();
    assert.equal(markDraw(state, choose(AUTUMN, '  Høstferie ')).ok, true);
    assert.deepEqual(state.draws[AUTUMN], { label: 'Høstferie', weeks: 1, entries: [] });
    refused(state, book, as('Ola Nordmann', AUTUMN), /Det trekkes lodd om uke 45/);
  });

  test('a draw can be for two weeks in a row, and then neither can be booked', () => {
    const state = emptyState();
    assert.equal(markDraw(state, choose(AUTUMN, 'Høstferie', 2)).ok, true);
    assert.deepEqual(state.draws[AUTUMN], { label: 'Høstferie', weeks: 2, entries: [] });
    refused(state, book, as('Ola Nordmann', '2026-W46'), /Det trekkes lodd om uke 45 og 46/);
    refused(state, markDraw, choose('2026-W46'), /Det trekkes allerede lodd om uke 46/);
    refused(state, markDraw, choose('2026-W44', '', 2), /Det trekkes allerede lodd om uke 45/);
  });

  test('a two-week draw needs the second week free and in the book too', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', '2026-W46'));
    refused(state, markDraw, choose(AUTUMN, '', 2), /Uke 46 er allerede booket av Ola Nordmann/);
    refused(state, markDraw, choose('2027-W40', '', 2), /Uke 41 er for langt fram/);
  });

  test('a draw is for one week or two, nothing else', () => {
    refused(emptyState(), markDraw, choose(AUTUMN, '', 3), /én eller to uker/, 400);
    refused(emptyState(), markDraw, choose(AUTUMN, '', NaN), /én eller to uker/, 400);
  });

  test('a week that is booked, or already set up, cannot be', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, markDraw, choose(AUTUMN), /allerede booket av Ola Nordmann/);
    markDraw(state, choose('2026-W46'));
    refused(state, markDraw, choose('2026-W46'), /Det trekkes allerede lodd om uke 46/);
  });

  test('a week that is over or does not exist cannot be, nor one with a name that is too long', () => {
    const state = emptyState();
    refused(state, markDraw, choose('2026-W41'), /er over/);
    refused(state, markDraw, choose('ingen uke'), /finnes ikke/, 404);
    refused(state, markDraw, choose(AUTUMN, 'x'.repeat(41)), /40 tegn/, 400);
  });

  test('a draw nobody has entered can be made an ordinary week again', () => {
    const state = bookWithEaster();
    assert.equal(unmarkDraw(state, choose(EASTER)).ok, true);
    assert.equal(state.draws[EASTER], undefined);
    assert.equal(book(state, as('Ola Nordmann', EASTER)).ok, true);
  });

  test('a draw someone has entered, or that is done, stays a draw', () => {
    const state = bookWithEaster('Ola Nordmann');
    refused(state, unmarkDraw, choose(EASTER), /1 har meldt seg på/);
    drawWinner(state, { week: EASTER, today: TODAY, now: NOW });
    refused(state, unmarkDraw, choose(EASTER), /Trekningen om uke 12 og 13 er gjort/);
    refused(state, unmarkDraw, choose(AUTUMN), /Det trekkes ikke lodd om uke 45/);
  });
});

describe('the book as it is shown', () => {
  test('the calendar is the 52 weeks from this one, each with what stands about it', () => {
    const state = bookWithEaster('Kari Hansen');
    book(state, as('Ola Nordmann', AUTUMN));
    const weeks = calendar(state, TODAY);

    assert.equal(weeks.flatMap((entry) => entry.weeks).length, HORIZON);
    assert.equal(weeks[0].week, TODAY);
    assert.equal(weeks.at(-1).week, '2027-W40');
    assert.deepEqual(weeks[0], { week: TODAY, weeks: [TODAY], booking: null, draw: null });
    assert.equal(weeks.find((entry) => entry.week === AUTUMN).booking.name, 'Ola Nordmann');
  });

  test('Easter is one stay in the calendar, not two weeks', () => {
    const weeks = calendar(bookWithEaster('Kari Hansen'), TODAY);
    const easter = weeks.find((entry) => entry.week === EASTER);
    assert.deepEqual(easter.weeks, [EASTER, EASTER_WEEK]);
    assert.equal(easter.draw.label, 'Påske');
    assert.equal(weeks.find((entry) => entry.week === EASTER_WEEK), undefined);
  });

  test('in the second week of a stay, the calendar still shows it from its start', () => {
    const weeks = calendar(bookWithEaster(), EASTER_WEEK);
    assert.equal(weeks[0].week, EASTER);
    assert.deepEqual(weeks[0].weeks, [EASTER, EASTER_WEEK]);
  });

  test('a draw from a book written before draws had a length is for one week', () => {
    const state = emptyState();
    state.draws[AUTUMN] = { label: '', entries: [] };
    assert.deepEqual(calendar(state, TODAY).find((entry) => entry.week === AUTUMN).weeks, [AUTUMN]);
    assert.equal(book(state, as('Ola Nordmann', '2026-W46')).ok, true);
  });

  test('a new book has Easter, for two weeks, and the winter break set up for a draw', () => {
    const state = firstState(new Date('2026-10-11T12:00:00Z'));
    assert.deepEqual(state.bookings, {});
    assert.deepEqual(state.draws, {
      '2027-W08': { label: 'Vinterferie', weeks: 1, entries: [] },
      '2027-W12': { label: 'Påske', weeks: 2, entries: [] },
    });
  });

  test('a new book takes this year’s weeks while they are still ahead', () => {
    const state = firstState(new Date('2027-01-11T12:00:00Z'));
    assert.deepEqual(Object.keys(state.draws), ['2027-W08', '2027-W12']);
  });

  test('a new book leaves out an Easter that is more than 52 weeks away', () => {
    // The week after Easter 2027. Easter 2028 starts in week 15, 53 weeks later.
    const state = firstState(new Date('2027-04-05T12:00:00Z'));
    assert.deepEqual(Object.keys(state.draws), ['2028-W08']);
  });
});

describe('drawing the holidays', () => {
  // Christmas 2026 runs into week 53, which 2026 has, and on into 2027.
  const CHRISTMAS_EVE = '2026-W52';
  const ROMJUL = '2026-W53';
  const NEW_YEAR = '2027-W01';
  // Ascension Day 2027 is a Thursday, and the Friday squeezed in after it is when the week changes.
  const ASCENSION = '2027-W18';
  const ASCENSION_FRIDAY = '2027-W19';
  // Whit Monday and 17 May are the same day in 2027.
  const WHITSUN = '2027-W20';

  const day = (date) => new Date(`${date}T00:00:00Z`);
  const daysAfter = (date, count) => new Date(date.getTime() + count * 86_400_000);
  const pickWinner = (state, week, pick) => drawWinner(state, { week, today: TODAY, now: NOW, pick });

  /** A book where the office manager has set up a draw, and these people have entered it. */
  function bookWithDraw(week, label, weeks, ...entered) {
    const state = emptyState();
    assert.equal(markDraw(state, { week, label, weeks, today: TODAY }).ok, true);
    for (const name of entered) assert.equal(enter(state, as(name, week)).ok, true);
    return state;
  }

  test('the holidays fall in the weeks the tests draw for', () => {
    assert.equal(weekIdOf(day('2026-12-24')), CHRISTMAS_EVE);
    assert.equal(weekIdOf(day('2026-12-25')), ROMJUL, 'Christmas Day is a Friday, so the week changes at 12:00 that day');
    assert.equal(weekIdOf(day('2026-12-31')), ROMJUL);
    assert.equal(weekIdOf(day('2027-01-01')), NEW_YEAR);

    const easter = easterSunday(2027);
    assert.equal(weekIdOf(daysAfter(easter, -3)), EASTER, 'Maundy Thursday is in the week before Easter week');
    assert.equal(weekIdOf(daysAfter(easter, 39)), ASCENSION);
    assert.equal(weekIdOf(daysAfter(easter, 40)), ASCENSION_FRIDAY);
    assert.equal(weekIdOf(daysAfter(easter, 50)), WHITSUN);
    assert.equal(weekIdOf(day('2027-05-17')), WHITSUN);
  });

  test('both of Easter’s holidays, Maundy Thursday and Easter Monday, are in the Easter draw', () => {
    const state = bookWithEaster('Ola Nordmann', 'Kari Hansen');
    pickWinner(state, EASTER, () => 1);
    const easter = easterSunday(2027);
    assert.equal(state.bookings[weekIdOf(daysAfter(easter, -3))].name, 'Kari Hansen');
    assert.equal(state.bookings[weekIdOf(daysAfter(easter, 1))].name, 'Kari Hansen');
  });

  test('Christmas and the days up to New Year can be one draw, over week 52 and 53', () => {
    const state = bookWithDraw(CHRISTMAS_EVE, 'Jul', 2, 'Ola Nordmann', 'Kari Hansen');
    refused(state, book, as('Per Olsen', ROMJUL), /Det trekkes lodd om uke 52 og 53/);
    assert.equal(book(state, as('Per Olsen', NEW_YEAR)).ok, true, 'New Year is not part of Christmas');

    pickWinner(state, CHRISTMAS_EVE, () => 1);
    assert.equal(state.bookings[CHRISTMAS_EVE].name, 'Kari Hansen');
    assert.equal(state.bookings[ROMJUL].name, 'Kari Hansen');
    assert.equal(formatRange(CHRISTMAS_EVE, { weeks: 2 }), '18. desember 2026 – 1. januar 2027');
  });

  test('a draw over New Year runs from week 53 into week 1 of the next year', () => {
    const state = bookWithDraw(ROMJUL, 'Nyttår', 2, 'Ola Nordmann', 'Kari Hansen', 'Per Olsen');
    refused(state, book, as('Nina Berg', NEW_YEAR), /Det trekkes lodd om uke 53 og 1/);

    assert.deepEqual(pickWinner(state, ROMJUL, () => 2), { ok: true, winner: 2, entries: ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'] });
    assert.deepEqual(state.bookings, {
      [ROMJUL]: { name: 'Per Olsen', at: NOW },
      [NEW_YEAR]: { name: 'Per Olsen', at: NOW },
    });
    assert.equal(formatRange(ROMJUL, { weeks: 2 }), '25. desember 2026 – 8. januar 2027');

    const stay = calendar(state, TODAY).find((entry) => entry.week === ROMJUL);
    assert.deepEqual(stay.weeks, [ROMJUL, NEW_YEAR], 'one stay in the calendar, across the turn of the year');
    assert.equal(calendar(state, TODAY).find((entry) => entry.week === NEW_YEAR), undefined);
  });

  test('a New Year winner who gives up week 1 gives up week 53 as well, and the draw opens again', () => {
    const state = bookWithDraw(ROMJUL, 'Nyttår', 2, 'Ola Nordmann', 'Kari Hansen');
    pickWinner(state, ROMJUL, () => 0);
    assert.equal(cancel(state, as('Ola Nordmann', NEW_YEAR)).ok, true);
    assert.deepEqual(state.bookings, {});
    assert.deepEqual(state.draws[ROMJUL].entries.map((entry) => entry.name), ['Kari Hansen']);
    assert.equal(pickWinner(state, ROMJUL, () => 0).ok, true);
    assert.equal(state.bookings[NEW_YEAR].name, 'Kari Hansen');
  });

  test('Christmas and New Year cannot both be drawn for week 53', () => {
    const state = bookWithDraw(CHRISTMAS_EVE, 'Jul', 2);
    refused(state, markDraw, { week: ROMJUL, label: 'Nyttår', weeks: 2, today: TODAY }, /Det trekkes allerede lodd om uke 53/);
    assert.equal(markDraw(state, { week: NEW_YEAR, label: 'Nyttår', weeks: 1, today: TODAY }).ok, true, 'week 1 is still free');
  });

  test('a week someone has already booked over Christmas cannot be drawn for afterwards', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', ROMJUL));
    refused(state, markDraw, { week: CHRISTMAS_EVE, label: 'Jul', weeks: 2, today: TODAY }, /Uke 53 er allerede booket av Ola Nordmann/);
  });

  test('next Christmas is more than 52 weeks away, so it cannot be drawn for yet', () => {
    const christmas2027 = weekIdOf(day('2027-12-24'));
    refused(emptyState(), markDraw, { week: christmas2027, label: 'Jul', weeks: 1, today: TODAY }, /for langt fram/);
  });

  test('the long weekend over Ascension Day is two weeks, since the squeezed-in Friday is when the week changes', () => {
    const state = bookWithDraw(ASCENSION, 'Kristi himmelfart', 2, 'Ola Nordmann', 'Kari Hansen');
    refused(state, book, as('Per Olsen', ASCENSION_FRIDAY), /Det trekkes lodd om uke 18 og 19/);
    pickWinner(state, ASCENSION, () => 0);
    assert.equal(state.bookings[ASCENSION].name, 'Ola Nordmann');
    assert.equal(state.bookings[ASCENSION_FRIDAY].name, 'Ola Nordmann');
    assert.equal(formatRange(ASCENSION, { weeks: 2 }), '30. april – 14. mai 2027');
  });

  test('Whitsun and 17 May are one week, and can be drawn right after Ascension', () => {
    const state = bookWithDraw(ASCENSION, 'Kristi himmelfart', 2, 'Ola Nordmann');
    assert.equal(markDraw(state, { week: WHITSUN, label: 'Pinse og 17. mai', weeks: 1, today: TODAY }).ok, true);
    assert.equal(enter(state, as('Ola Nordmann', WHITSUN)).ok, true, 'one person can be in both draws');
    assert.equal(enter(state, as('Kari Hansen', WHITSUN)).ok, true);

    pickWinner(state, ASCENSION, () => 0);
    pickWinner(state, WHITSUN, () => 0);
    assert.deepEqual(Object.keys(state.bookings), [ASCENSION, ASCENSION_FRIDAY, WHITSUN]);
    assert.ok(Object.values(state.bookings).every((booking) => booking.name === 'Ola Nordmann'), 'and win both');
    assert.equal(formatRange(WHITSUN), '14.–21. mai 2027');
  });

  test('the draws for the holidays stand side by side in the calendar, each as one stay', () => {
    const state = bookWithDraw(CHRISTMAS_EVE, 'Jul', 2);
    markDraw(state, { week: NEW_YEAR, label: 'Nyttår', weeks: 1, today: TODAY });
    markDraw(state, { week: ASCENSION, label: 'Kristi himmelfart', weeks: 2, today: TODAY });
    markDraw(state, { week: WHITSUN, label: 'Pinse og 17. mai', weeks: 1, today: TODAY });
    const weeks = calendar(state, TODAY);

    assert.equal(weeks.flatMap((entry) => entry.weeks).length, HORIZON, 'no week is lost or shown twice');
    const draws = weeks.filter((entry) => entry.draw).map((entry) => [entry.draw.label, entry.weeks]);
    assert.deepEqual(draws, [
      ['Jul', [CHRISTMAS_EVE, ROMJUL]],
      ['Nyttår', [NEW_YEAR]],
      ['Kristi himmelfart', [ASCENSION, ASCENSION_FRIDAY]],
      ['Pinse og 17. mai', [WHITSUN]],
    ]);
  });
});
