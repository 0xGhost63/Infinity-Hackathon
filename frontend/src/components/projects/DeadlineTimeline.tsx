import { Fragment, useMemo } from 'react';
import type { Task } from '@/api/types';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import {
  addDays,
  compareIsoDates,
  diffInDays,
  formatDate,
  formatMonthRange,
  formatWeekday,
  isWeekend,
  parseIsoDate,
  startOfToday,
} from '@/lib/dates';
import { formatHours } from '@/lib/format';
import { accentClass } from '@/lib/palette';

const MAX_SPAN_DAYS = 62;

interface TimelineModel {
  days: Date[];
  todayIndex: number | null;
  dueIndex: number | null;
  rows: { task: Task; index: number | null }[];
}

function buildTimeline(tasks: Task[], projectDeadline: string): TimelineModel | null {
  const deadlines = [projectDeadline, ...tasks.map((task) => task.deadline)]
    .map((value) => parseIsoDate(value))
    .filter((date): date is Date => date !== null);
  if (deadlines.length === 0) return null;

  const times = deadlines.map((date) => date.getTime());
  let start = new Date(Math.min(...times));
  let end = new Date(Math.max(...times));

  // Include today when it keeps the range readable, so remaining time is visible.
  const today = startOfToday();
  const startWithToday = today < start ? today : start;
  const endWithToday = today > end ? today : end;
  if (diffInDays(startWithToday, endWithToday) <= MAX_SPAN_DAYS) {
    start = startWithToday;
    end = endWithToday;
  }

  const span = diffInDays(start, end);
  if (span > MAX_SPAN_DAYS) return null;

  const days = Array.from({ length: span + 1 }, (_, offset) => addDays(start, offset));
  const indexOf = (value: string | null | undefined): number | null => {
    const date = parseIsoDate(value);
    if (!date) return null;
    const index = diffInDays(start, date);
    return index >= 0 && index < days.length ? index : null;
  };
  const todayOffset = diffInDays(start, today);

  return {
    days,
    todayIndex: todayOffset >= 0 && todayOffset < days.length ? todayOffset : null,
    dueIndex: indexOf(projectDeadline),
    rows: [...tasks]
      .sort((a, b) => compareIsoDates(a.deadline, b.deadline) || a.title.localeCompare(b.title))
      .map((task) => ({ task, index: indexOf(task.deadline) })),
  };
}

/** Milestone chart: one row per task, a diamond on the day it is due. */
export function DeadlineTimeline({ tasks, projectDeadline }: { tasks: Task[]; projectDeadline: string }) {
  const model = useMemo(() => buildTimeline(tasks, projectDeadline), [tasks, projectDeadline]);
  if (!model || model.rows.length === 0) return null;

  const { days, todayIndex, dueIndex, rows } = model;
  const dayState = (day: Date, index: number) =>
    cx(isWeekend(day) && 'is-weekend', index === todayIndex && 'is-today', index === dueIndex && 'is-due');

  return (
    <>
      <ul className="legend" aria-label="Timeline key">
        <li>
          <span className="legend__diamond" aria-hidden="true" />
          Task deadline
        </li>
        <li>
          <span className="legend__swatch legend__swatch--today" aria-hidden="true" />
          Today
        </li>
        <li>
          <span className="legend__swatch legend__swatch--due" aria-hidden="true" />
          Project deadline
        </li>
      </ul>
      <div className="timeline-scroll" role="region" aria-label="Task deadlines by date" tabIndex={0}>
        <div className="timeline" style={cssVars({ '--days': days.length })}>
          <div className="timeline__corner">{formatMonthRange(days[0], days[days.length - 1])}</div>
          {days.map((day, index) => (
            <div key={`day-${index}`} className={cx('timeline__day', dayState(day, index))}>
              <span className="timeline__dow">{formatWeekday(day)}</span>
              <span className="timeline__date">{day.getDate()}</span>
            </div>
          ))}
          {rows.map(({ task, index: markerIndex }) => (
            <Fragment key={task.id}>
              <div className="timeline__label">
                <span className="timeline__task">{task.title}</span>
                <span className="timeline__meta">
                  {task.assignee?.name ?? 'Unassigned'}, {formatHours(task.estimatedHours)}
                </span>
              </div>
              {days.map((day, index) => (
                <div key={`${task.id}-${index}`} className={cx('timeline__slot', dayState(day, index))}>
                  {index === markerIndex && (
                    <span
                      className={cx('timeline__marker', accentClass(task.assigneeId))}
                      role="img"
                      aria-label={`Due ${formatDate(task.deadline)}`}
                      title={`${task.title}, due ${formatDate(task.deadline)}`}
                    />
                  )}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
