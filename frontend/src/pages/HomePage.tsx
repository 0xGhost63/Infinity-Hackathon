import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { api } from '@/api';
import type { Role } from '@/api/types';
import { useCurrentUser } from '@/auth/AuthContext';
import { BoardSkeleton, ProjectBoard, type BoardViewer } from '@/components/board/ProjectBoard';
import { ErrorState } from '@/components/feedback/StatusViews';
import { PageHeader } from '@/components/layout/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatHoursLong, pluralize, sumBy } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useResource } from '@/lib/useResource';

interface HomeCopy {
  title: string;
  description: string;
  summary: (projects: number, tasks: number, hours: number) => string;
  emptyTitle: string;
  emptyText: string;
  emptyAction?: ReactNode;
  viewer: BoardViewer;
}

const createButton = (
  <LinkButton to="/transcript" variant="primary" size="lg">
    Create from Transcript
  </LinkButton>
);

const COPY: Record<Role, HomeCopy> = {
  ADMIN: {
    title: 'Company overview',
    description: 'Every client project at NovaWorks Technologies, with owners, deadlines, and estimated hours.',
    summary: (projects, tasks, hours) =>
      `${pluralize(projects, 'project')} and ${pluralize(tasks, 'task')} across the company, ${formatHoursLong(hours)}.`,
    emptyTitle: 'No projects yet',
    emptyText: 'Paste a meeting transcript and the projects, tasks, owners, and deadlines it agrees on will appear here.',
    emptyAction: createButton,
    viewer: 'all',
  },
  MANAGER: {
    title: 'Your projects',
    description: 'Projects where you are the project manager.',
    summary: (projects, tasks, hours) =>
      `You manage ${pluralize(projects, 'project')} with ${pluralize(tasks, 'task')}, ${formatHoursLong(hours)}.`,
    emptyTitle: 'No projects assigned to you',
    emptyText: 'Projects appear here once the administrator creates them from a meeting and names you as the manager.',
    viewer: 'manager',
  },
  AGENT: {
    title: 'My tasks',
    description: 'Tasks assigned to you, grouped by project and ordered by deadline.',
    summary: (projects, tasks, hours) =>
      `${pluralize(tasks, 'task')} assigned to you across ${pluralize(projects, 'project')}, ${formatHoursLong(hours)}.`,
    emptyTitle: 'No tasks assigned to you',
    emptyText: 'Tasks appear here once the administrator creates projects from a meeting and assigns work to you.',
    viewer: 'agent',
  },
};

export function HomePage() {
  const user = useCurrentUser();
  const copy = COPY[user.role];
  useDocumentTitle(copy.title);
  const board = useResource((signal) => api.projects.board({ signal }), [user.id]);

  const projects = board.data ?? [];
  const taskCount = sumBy(projects, (project) => project.tasks.length);
  const hours = sumBy(projects, (project) => sumBy(project.tasks, (task) => task.estimatedHours));
  const description = projects.length > 0 ? copy.summary(projects.length, taskCount, hours) : copy.description;

  return (
    <>
      <PageHeader title={copy.title} description={description} actions={user.role === 'ADMIN' && projects.length > 0 ? createButton : undefined} />
      {user.role === 'AGENT' && (
        <p className="section__note">
          <Lock aria-hidden="true" />
          Only tasks assigned to you are shown. Other agents' work is not visible to you.
        </p>
      )}
      {board.status === 'error' && board.error ? (
        <ErrorState error={board.error} onRetry={board.reload} />
      ) : board.status === 'loading' ? (
        <BoardSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyText} action={copy.emptyAction} />
      ) : (
        <ProjectBoard projects={projects} viewer={copy.viewer} />
      )}
    </>
  );
}
