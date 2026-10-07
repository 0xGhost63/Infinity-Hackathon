import { Lock } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '@/api';
import { useCurrentUser } from '@/auth/AuthContext';
import { ErrorState, ForbiddenView, NotFoundView, PageLoader } from '@/components/feedback/StatusViews';
import { Breadcrumbs, SectionHeader } from '@/components/layout/PageHeader';
import { DeadlineTimeline } from '@/components/projects/DeadlineTimeline';
import { DueDate } from '@/components/projects/DueDate';
import { TaskTable } from '@/components/projects/TaskTable';
import { Person } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { cx } from '@/lib/cx';
import { formatDate } from '@/lib/dates';
import { formatHoursLong, pluralize, sumBy } from '@/lib/format';
import { accentClass } from '@/lib/palette';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useResource } from '@/lib/useResource';

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const user = useCurrentUser();
  const project = useResource((signal) => api.projects.get(projectId, { signal }), [projectId, user.id]);
  useDocumentTitle(project.data?.name ?? 'Project');

  if (project.status === 'error' && project.error) {
    if (project.error.status === 403) {
      return (
        <ForbiddenView
          title="You do not have access to this project"
          description="A project is visible to the administrator, its project manager, and agents with tasks in it."
        />
      );
    }
    if (project.error.status === 404) {
      return <NotFoundView title="Project not found" description="This project does not exist, or the link is incorrect." />;
    }
    return <ErrorState error={project.error} onRetry={project.reload} />;
  }
  if (!project.data) return <PageLoader label="Loading project" />;

  const detail = project.data;
  const isAgent = user.role === 'AGENT';
  const hours = sumBy(detail.tasks, (task) => task.estimatedHours);
  const taskHeading = isAgent ? 'Your tasks' : 'Tasks';

  return (
    <>
      <Breadcrumbs items={[{ label: 'Projects', to: '/projects' }, { label: detail.name }]} />

      <article className={cx('project-hero', accentClass(detail.managerId))} aria-labelledby="project-title">
        <div className="project-hero__top">
          <p className="project-hero__client">{detail.clientName}</p>
          <h1 className="project-hero__title" id="project-title">
            {detail.name}
          </h1>
          {detail.description && <p className="project-hero__desc">{detail.description}</p>}
        </div>
        <dl className="facts">
          <div>
            <dt>Project manager</dt>
            <dd>
              <Person person={detail.manager} />
            </dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              <DueDate date={detail.deadline} />
            </dd>
          </div>
          <div>
            <dt>{taskHeading}</dt>
            <dd>{pluralize(detail.tasks.length, 'task')}</dd>
          </div>
          <div>
            <dt>{isAgent ? 'Your estimate' : 'Estimate'}</dt>
            <dd>{formatHoursLong(hours)}</dd>
          </div>
        </dl>
      </article>

      {isAgent && (
        <p className="section__note">
          <Lock aria-hidden="true" />
          Only tasks assigned to you are shown.
        </p>
      )}

      {detail.tasks.length === 0 ? (
        <EmptyState title="No tasks in this project" description="Tasks are added when a meeting transcript is converted." />
      ) : (
        <>
          <section className="section" aria-labelledby="timeline-title">
            <SectionHeader id="timeline-title" title="Deadlines" meta={`Project due ${formatDate(detail.deadline)}`} />
            <DeadlineTimeline tasks={detail.tasks} projectDeadline={detail.deadline} />
          </section>
          <section className="section" aria-labelledby="tasks-title">
            <SectionHeader id="tasks-title" title={taskHeading} meta={pluralize(detail.tasks.length, 'task')} />
            <TaskTable tasks={detail.tasks} showAssignee={!isAgent} />
          </section>
        </>
      )}
    </>
  );
}
