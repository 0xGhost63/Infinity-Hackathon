import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/api';
import type { Role } from '@/api/types';
import { useCurrentUser } from '@/auth/AuthContext';
import { ErrorState } from '@/components/feedback/StatusViews';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Loaders';
import { pluralize } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useResource } from '@/lib/useResource';

const DESCRIPTION: Record<Role, string> = {
  ADMIN: 'All client projects. Select a project to see its tasks and deadlines.',
  MANAGER: 'Projects you manage. Select a project to see its tasks and deadlines.',
  AGENT: 'Projects that include tasks assigned to you. Only your own tasks are counted.',
};

export function ProjectsPage() {
  useDocumentTitle('Projects');
  const user = useCurrentUser();
  const projects = useResource((signal) => api.projects.list({ signal }), [user.id]);
  const [query, setQuery] = useState('');

  const all = projects.data ?? [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((project) =>
      [project.name, project.clientName, project.manager?.name ?? ''].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [all, query]);

  return (
    <>
      <PageHeader
        title="Projects"
        description={DESCRIPTION[user.role]}
        actions={
          user.role === 'ADMIN' ? (
            <LinkButton to="/transcript" variant="primary">
              Create from Transcript
            </LinkButton>
          ) : undefined
        }
      />
      {projects.status === 'error' && projects.error ? (
        <ErrorState error={projects.error} onRetry={projects.reload} />
      ) : projects.status === 'loading' ? (
        <div className="table-skeleton" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} height={48} />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title="No projects to show"
          description={
            user.role === 'ADMIN'
              ? 'Create projects by pasting a meeting transcript.'
              : 'Projects appear here once the administrator creates them and assigns you.'
          }
          action={
            user.role === 'ADMIN' ? (
              <LinkButton to="/transcript" variant="primary">
                Create from Transcript
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="toolbar">
            <label className="control-icon toolbar__search">
              <span className="sr-only">Search projects</span>
              <Search aria-hidden="true" />
              <Input type="search" placeholder="Search by project, client, or manager" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <p className="toolbar__count" aria-live="polite">
              {visible.length === all.length ? pluralize(all.length, 'project') : `${visible.length} of ${pluralize(all.length, 'project')}`}
            </p>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No matching projects" description={`Nothing matches "${query.trim()}". Try a client or manager name.`} />
          ) : (
            <ProjectsTable projects={visible} viewerRole={user.role} />
          )}
        </>
      )}
    </>
  );
}
