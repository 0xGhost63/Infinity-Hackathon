const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

/** Parses YYYY-MM-DD as a local calendar date, avoiding UTC off-by-one errors. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function isValidIsoDate(value: string | null | undefined): value is string {
  return parseIsoDate(value) !== null;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function compareIsoDates(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '9999-12-31').localeCompare(b || '9999-12-31');
}

const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const monthOnly = new Intl.DateTimeFormat('en-GB', { month: 'short' });

export function formatDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  return date ? fullDate.format(date) : 'No date';
}

export function formatShortDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  return date ? shortDate.format(date) : 'No date';
}

export function formatWeekday(date: Date): string {
  return weekday.format(date);
}

/** "Oct 2026", or "Oct to Nov 2026" when the range crosses months. */
export function formatMonthRange(first: Date, last: Date): string {
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return monthYear.format(first);
  }
  return `${monthOnly.format(first)} to ${monthYear.format(last)}`;
}

export type DeadlineTone = 'overdue' | 'soon' | 'normal' | 'none';

export function describeDeadline(value: string | null | undefined): { label: string; tone: DeadlineTone } {
  const date = parseIsoDate(value);
  if (!date) return { label: 'No deadline', tone: 'none' };
  const days = diffInDays(startOfToday(), date);
  if (days < 0) return { label: days === -1 ? '1 day overdue' : `${-days} days overdue`, tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'soon' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' };
  return { label: `${days} days left`, tone: days <= 3 ? 'soon' : 'normal' };
}
