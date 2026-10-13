import { relativeTime } from '../time';

describe('relativeTime', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  it.each([
    ['2026-10-01T11:59:30.000Z', 'now'],
    ['2026-10-01T11:55:00.000Z', '5m'],
    ['2026-10-01T09:00:00.000Z', '3h'],
    ['2026-09-29T12:00:00.000Z', '2d'],
  ])('%s -> %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('returns an empty string for invalid input', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});
