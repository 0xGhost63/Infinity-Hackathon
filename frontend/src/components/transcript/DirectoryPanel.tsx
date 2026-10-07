import type { User } from '@/api/types';
import { ErrorState } from '@/components/feedback/StatusViews';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Loaders';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { RoleTag } from '@/components/ui/Tag';
import type { Resource } from '@/lib/useResource';

const ROLE_ORDER = { MANAGER: 0, AGENT: 1, ADMIN: 2 } as const;

export function DirectoryPanel({ resource }: { resource: Resource<User[]> }) {
  const people = (resource.data ?? [])
    .filter((person) => person.role !== 'ADMIN')
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  return (
    <Panel aria-labelledby="directory-title">
      <PanelHeader
        id="directory-title"
        title="Who the AI can assign"
        subtitle="Work only goes to people in this directory. Passwords are never sent to the AI."
      />
      <PanelBody>
        {resource.status === 'error' && resource.error ? (
          <ErrorState error={resource.error} onRetry={resource.reload} title="The team directory could not be loaded" />
        ) : resource.status === 'loading' ? (
          <div className="stack-sm">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={40} />
            ))}
          </div>
        ) : (
          <ul className="directory">
            {people.map((person) => (
              <li key={person.id}>
                <Avatar name={person.name} id={person.id} size="sm" />
                <span className="directory__text">
                  <span className="directory__name">{person.name}</span>
                  <span className="directory__meta">{person.specialization}</span>
                </span>
                <RoleTag role={person.role} />
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
