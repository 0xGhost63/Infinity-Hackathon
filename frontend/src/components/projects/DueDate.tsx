import { cx } from '@/lib/cx';
import { describeDeadline, formatDate, formatShortDate } from '@/lib/dates';

export function DueDate({ date, compact = false }: { date: string | null | undefined; compact?: boolean }) {
  const deadline = describeDeadline(date);
  return (
    <span className={cx('due', `due--${deadline.tone}`)}>
      <span className="due__date">{compact ? formatShortDate(date) : formatDate(date)}</span>
      <span className="due__rel">{deadline.label}</span>
    </span>
  );
}
