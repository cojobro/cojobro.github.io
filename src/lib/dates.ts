const MONTH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Displays a "YYYY-MM" or "YYYY" date (as in `NewsItem.date`): "Oct 2026", or "2026" when only
 * the year is known. Any other shape fails the build, so a typo cannot reach the page.
 */
export function formatMonth(date: string): string {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(date);
  if (!match) throw new Error(`Expected a "YYYY-MM" or "YYYY" date, got "${date}".`);
  const [, year, month] = match;
  if (!month) return year;
  return MONTH_YEAR.format(new Date(Date.UTC(Number(year), Number(month) - 1)));
}
