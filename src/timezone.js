/** Convert an IST calendar date boundary to a UTC MySQL DATETIME string. */
export function istDateBoundaryUtc(date, dayOffset = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const istMidnight = new Date(0);
  istMidnight.setUTCFullYear(year, month - 1, day);
  istMidnight.setUTCHours(0, 0, 0, 0);
  if (istMidnight.getUTCFullYear() !== year || istMidnight.getUTCMonth() !== month - 1 || istMidnight.getUTCDate() !== day) return null;
  const utc = new Date(istMidnight.getTime() + dayOffset * 86400000 - 330 * 60000);
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString().slice(0, 19).replace('T', ' ');
}
