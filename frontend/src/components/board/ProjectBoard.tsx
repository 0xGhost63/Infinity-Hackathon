import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectDetail, Task } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { LinkButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Loaders';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { compareIsoDates, describeDeadline, formatDate, formatShortDate } from '@/lib/dates';
import { formatHours, sumBy } from '@/lib/format';
import { accentClass } from '@/lib/palette';

export type BoardViewer = 'all' | 'manager' | 'agent';

interface ProjectBoardProps {
  projects: ProjectDetail[];
  viewer: BoardViewer;
  /** Plays the one entrance animation, used right after projects are created. */
  reveal?: boolean;
}

/** One lane per project; each task is a sticky note, ordered by deadline. */
export function ProjectBoard({ projects, viewer, reveal = false }: ProjectBoardProps) {
  return (
    <div className={cx('board', reveal && 'board--reveal')}>
      {projects.map((project, index) => (
        <ProjectLane key={project.id} project={project} viewer={viewer} style={cssVars({ '--i': index })} />
      ))}
    </div>
  );
}

function ProjectLane({ project, viewer, style }: { project: ProjectDetail; viewer: BoardViewer; style?: CSSProperties }) {
  const tasks = [...project.tasks].sort((a, b) => compareIsoDates(a.deadline, b.deadline) || a.title.localeCompare(b.title));
  const hours = sumBy(tasks, (task) => task.estimatedHours);
  const deadline = describeDeadline(project.deadline);
  const titleId = `lane-${project.id}`;
  const href = `/projects/${project.id}`;

  return (
    <section className={cx('lane', accentClass(project.managerId))} style={style} aria-labelledby={titleId}>
      <header className="lane__head">
        <p className="lane__client">{project.clientName}</p>
        <h2 className="lane__title" id={titleId}>
          <Link to={href}>{project.name}</Link>
        </h2>
        <dl className="lane__facts">
          <div>
            <dt>Manager</dt>
            <dd>{project.manager?.name ?? 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {formatShortDate(project.deadline)}
              <span className={cx('lane__rel', `lane__rel--${deadline.tone}`)}>{deadline.label}</span>
            </dd>
          </div>
          <div>
            <dt>{viewer === 'agent' ? 'Your tasks' : 'Tasks'}</dt>
            <dd>{tasks.length}</dd>
          </div>
          <div>
            <dt>Estimate</dt>
            <dd>{formatHours(hours)}</dd>
          </div>
        </dl>
      </header>
      {tasks.length > 0 ? (
        <ol className="lane__notes">
          {tasks.map((task, index) => (
            <TaskNote key={task.id} task={task} showOwner={viewer !== 'agent'} style={cssVars({ '--j': index })} />
          ))}
        </ol>
      ) : (
        <p className="lane__empty">No tasks in this project yet.</p>
      )}
      <div className="lane__foot">
        <LinkButton to={href} size="sm" block>
          Open project
        </LinkButton>
      </div>
    </section>
  );
}

function TaskNote({ task, showOwner, style }: { task: Task; showOwner: boolean; style?: CSSProperties }) {
  const deadline = describeDeadline(task.deadline);
  return (
    <li className="note" style={style}>
      <p className="note__title">{task.title}</p>
      {task.description && <p className="note__desc">{task.description}</p>}
      <div className="note__foot">
        {showOwner ? (
          <span className="note__owner">
            {task.assignee && <Avatar name={task.assignee.name} id={task.assignee.id} size="xs" />}
            <span>{task.assignee?.name ?? 'Unassigned'}</span>
          </span>
        ) : (
          <span className={cx('note__rel', `note__rel--${deadline.tone}`)}>{deadline.label}</span>
        )}
        <span className="note__stats">
          <span className={cx('note__due', `note__due--${deadline.tone}`)} title={`Due ${formatDate(task.deadline)}`}>
            {formatShortDate(task.deadline)}
          </span>
          <span className="note__hours">{formatHours(task.estimatedHours)}</span>
        </span>
      </div>
    </li>
  );
}

export function BoardSkeleton({ lanes = 3 }: { lanes?: number }) {
  return (
    <div className="board" aria-hidden="true">
      {Array.from({ length: lanes }, (_, lane) => (
        <div key={lane} className="lane lane--skeleton">
          <div className="lane__head">
            <Skeleton width="40%" height={12} />
            <Skeleton width="78%" height={26} />
            <Skeleton width="62%" height={12} />
          </div>
          <div className="lane__notes">
            {[0, 1, 2].map((note) => (
              <Skeleton key={note} height={82} className="note-skeleton" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
