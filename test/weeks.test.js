import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addWeeks, currentWeek, easterSunday, easterWeek, formatMoment, formatRange, fridayOf, isWeekId, monthOf, weekIdOf,
  weekNumber,
  weeksFrom,
} from '../src/weeks.js';

const day = (text) => new Date(`${text}T00:00:00Z`);
const iso = (date) => date.toISOString().slice(0, 10);

test('a week runs from Friday to Friday, and a Friday belongs to the week that arrives', () => {
  assert.equal(weekIdOf(day('2026-10-08')), '2026-W41');
  assert.equal(weekIdOf(day('2026-10-09')), '2026-W42');
  assert.equal(weekIdOf(day('2026-10-12')), '2026-W42');
  assert.equal(weekIdOf(day('2026-10-15')), '2026-W42');
  assert.equal(weekIdOf(day('2026-10-16')), '2026-W43');
});

test('the days around New Year belong to the week they are in, not the year', () => {
  assert.equal(weekIdOf(day('2026-12-31')), '2026-W53');
  assert.equal(weekIdOf(day('2027-01-01')), '2027-W01');
  assert.equal(weekIdOf(day('2027-01-03')), '2027-W01');
  assert.equal(weekIdOf(day('2024-12-26')), '2024-W52');
  assert.equal(weekIdOf(day('2024-12-27')), '2025-W01');
});

test('a week starts on the Friday before its Monday', () => {
  assert.equal(iso(fridayOf('2026-W42')), '2026-10-09');
  assert.equal(iso(fridayOf('2027-W08')), '2027-02-19');
  assert.equal(iso(fridayOf('2026-W53')), '2026-12-25');
  assert.equal(iso(fridayOf('2027-W01')), '2027-01-01');
  assert.equal(fridayOf('2027-W53'), null);
});

test('only weeks that exist are weeks', () => {
  assert.equal(isWeekId('2026-W53'), true);
  assert.equal(isWeekId('2027-W53'), false, '2027 has 52 weeks');
  assert.equal(isWeekId('2027-W00'), false);
  assert.equal(isWeekId('2027-W1'), false);
  assert.equal(isWeekId('uke 12'), false);
  assert.equal(isWeekId(undefined), false);
});

test('weeks are counted across New Year', () => {
  assert.equal(addWeeks('2026-W52', 2), '2027-W01');
  assert.deepEqual(weeksFrom('2026-W52', 3), ['2026-W52', '2026-W53', '2027-W01']);
  assert.equal(weekNumber('2027-W08'), 8);
});

test('weeks sort as text', () => {
  const weeks = weeksFrom('2026-W40', 70);
  assert.deepEqual([...weeks].sort(), weeks);
});

test('the week changes at 12:00 on Friday in Norway', () => {
  // Summer time: noon in Oslo is 10:00 UTC.
  assert.equal(currentWeek(new Date('2026-10-09T09:59:59Z')), '2026-W41');
  assert.equal(currentWeek(new Date('2026-10-09T10:00:00Z')), '2026-W42');
  // Winter time: noon in Oslo is 11:00 UTC.
  assert.equal(currentWeek(new Date('2027-01-01T10:59:59Z')), '2026-W53');
  assert.equal(currentWeek(new Date('2027-01-01T11:00:00Z')), '2027-W01');
});

test('the rest of the week is the same week, morning or night', () => {
  assert.equal(currentWeek(new Date('2026-10-10T05:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-14T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-15T21:59:59Z')), '2026-W42');
});

test('Easter Sunday falls where the almanac says', () => {
  assert.equal(iso(easterSunday(2025)), '2025-04-20');
  assert.equal(iso(easterSunday(2026)), '2026-04-05');
  assert.equal(iso(easterSunday(2027)), '2027-03-28');
  assert.equal(iso(easterSunday(2028)), '2028-04-16');
  assert.equal(iso(easterSunday(2038)), '2038-04-25');
});

test('Easter week starts on Good Friday', () => {
  assert.equal(easterWeek(2027), '2027-W13');
  assert.equal(iso(fridayOf(easterWeek(2027))), '2027-03-26');
  assert.equal(iso(fridayOf(easterWeek(2028))), '2028-04-14');
});

test('a week is written with its dates', () => {
  assert.equal(formatRange('2027-W12'), '19.–26. mars 2027');
  assert.equal(formatRange('2027-W13'), '26. mars – 2. april 2027');
  assert.equal(formatRange('2026-W53'), '25. desember 2026 – 1. januar 2027');
  assert.equal(formatRange('2027-W12', { year: false }), '19.–26. mars');
  assert.equal(formatRange('2026-W53', { year: false }), '25. desember – 1. januar');
});

test('a week is listed under the month most of its nights fall in', () => {
  assert.equal(monthOf('2027-W12'), 'Mars 2027');
  assert.equal(monthOf('2027-W13'), 'Mars 2027');
  assert.equal(monthOf('2027-W14'), 'April 2027');
  assert.equal(monthOf('2026-W53'), 'Desember 2026');
});

test('a moment is written in Norwegian time', () => {
  const text = formatMoment('2026-10-11T13:42:00.000Z');
  assert.match(text, /11\. oktober 2026/);
  assert.match(text, /15[:.]42/);
});
