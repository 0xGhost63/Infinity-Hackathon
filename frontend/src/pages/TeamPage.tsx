import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/api';
import type { Role, User } from '@/api/types';
import { useCurrentUser } from '@/auth/AuthContext';
import { ErrorState } from '@/components/feedback/StatusViews';
import { PageHeader, SectionHeader } from '@/components/layout/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Loaders';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { RoleTag, Tag } from '@/components/ui/Tag';
import { pluralize } from '@/lib/format';
import { ROLE_GROUP_TITLE } from '@/lib/roles';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useResource } from '@/lib/useResource';

type Filter = 'ALL' | Role;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'MANAGER', label: 'Managers' },
  { value: 'AGENT', label: 'Agents' },
  { value: 'ADMIN', label: 'Admin' },
];

const GROUP_ORDER: Role[] = ['MANAGER', 'AGENT', 'ADMIN'];

function PersonCard({ person, isSelf }: { person: User; isSelf: boolean }) {
  return (
    <li className="person-card">
      <div className="person-card__top">
        <Avatar name={person.name} id={person.id} size="lg" />
        <div className="person-card__tags">
          <RoleTag role={person.role} />
          {isSelf && <Tag tone="yellow">You</Tag>}
        </div>
      </div>
      <h3 className="person-card__name">{person.name}</h3>
      <p className="person-card__spec">{person.specialization}</p>
      <p className="person-card__email">{person.email}</p>
      {person.skills.length > 0 && (
        <ul className="tag-list" aria-label={`${person.name} skills`}>
          {person.skills.map((skill) => (
            <li key={skill} className="tag tag--plain">
              {skill}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function TeamPage() {
  useDocumentTitle('Team');
  const user = useCurrentUser();
  const team = useResource((signal) => api.team.list({ signal }), [user.id]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const people = (team.data ?? []).filter((person) => {
      if (filter !== 'ALL' && person.role !== filter) return false;
      if (!needle) return true;
      return [person.name, person.specialization, person.email, ...person.skills].some((value) => value.toLowerCase().includes(needle));
    });
    return GROUP_ORDER.map((role) => ({
      role,
      people: people.filter((person) => person.role === role).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.people.length > 0);
  }, [team.data, filter, query]);

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone at NovaWorks Technologies and what they specialize in. This read-only directory is also the list the AI assigns work from."
      />
      {team.status === 'error' && team.error ? (
        <ErrorState error={team.error} onRetry={team.reload} />
      ) : team.status === 'loading' ? (
        <div className="people" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <Skeleton key={card} height={190} />
          ))}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="control-icon toolbar__search">
              <span className="sr-only">Search the team</span>
              <Search aria-hidden="true" />
              <Input type="search" placeholder="Search by name or skill" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <SegmentedControl label="Filter by role" options={FILTERS} value={filter} onChange={setFilter} />
          </div>
          {groups.length === 0 ? (
            <EmptyState title="Nobody matches" description="Try another name or skill, or show everyone." />
          ) : (
            groups.map((group) => (
              <section className="section" key={group.role} aria-labelledby={`group-${group.role}`}>
                <SectionHeader id={`group-${group.role}`} title={ROLE_GROUP_TITLE[group.role]} meta={pluralize(group.people.length, 'person', 'people')} />
                <ul className="people">
                  {group.people.map((person) => (
                    <PersonCard key={person.id} person={person} isSelf={person.id === user.id} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
