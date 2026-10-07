import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProjectSummary, Role } from '@/api/types';
import { Person } from '@/components/ui/Avatar';
import { cx } from '@/lib/cx';
import { compareIsoDates } from '@/lib/dates';
import { formatHours } from '@/lib/format';
import { DueDate } from './DueDate';

type SortKey = 'name' | 'manager' | 'deadline' | 'tasks' | 'hours';
type Direction = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  direction: Direction;
}

function sortProjects(projects: ProjectSummary[], { key, direction }: SortState): ProjectSummary[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...projects].sort((a, b) => {
    let result = 0;
    switch (key) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'manager':
        result = (a.manager?.name ?? '').localeCompare(b.manager?.name ?? '');
        break;
      case 'deadline':
        result = compareIsoDates(a.deadline, b.deadline);
        break;
      case 'tasks':
        result = a.taskCount - b.taskCount;
        break;
      case 'hours':
        result = a.totalHours - b.totalHours;
        break;
    }
    return result * factor || a.name.localeCompare(b.name);
  });
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}

function SortableHeader({ label, sortKey, sort, onSort, numeric = false }: SortableHeaderProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx(numeric && 'is-numeric')} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="table__sort" data-active={active} onClick={() => onSort(sortKey)}>
        {label}
        <Icon aria-hidden="true" />
      </button>
    </th>
  );
}

export function ProjectsTable({ projects, viewerRole }: { projects: ProjectSummary[]; viewerRole: Role }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortState>({ key: 'deadline', direction: 'asc' });
  const rows = useMemo(() => sortProjects(projects, sort), [projects, sort]);
  const taskLabel = viewerRole === 'AGENT' ? 'Your tasks' : 'Tasks';

  function handleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'tasks' || key === 'hours' ? 'desc' : 'asc' },
    );
  }

  return (
    <div className="table-scroll">
      <table className="table table--stack">
        <thead>
          <tr>
            <SortableHeader label="Project" sortKey="name" sort={sort} onSort={handleSort} />
            <SortableHeader label="Manager" sortKey="manager" sort={sort} onSort={handleSort} />
            <SortableHeader label="Deadline" sortKey="deadline" sort={sort} onSort={handleSort} />
            <SortableHeader label={taskLabel} sortKey="tasks" sort={sort} onSort={handleSort} numeric />
            <SortableHeader label="Estimate" sortKey="hours" sort={sort} onSort={handleSort} numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map((project) => (
            <tr
              key={project.id}
              className="is-clickable"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button')) return;
                navigate(`/projects/${project.id}`);
              }}
            >
              <td data-label="Project">
                <Link className="table-link" to={`/projects/${project.id}`}>
                  {project.name}
                </Link>
                <span className="cell-sub">{project.clientName}</span>
              </td>
              <td data-label="Manager">
                <Person person={project.manager} />
              </td>
              <td data-label="Deadline">
                <DueDate date={project.deadline} />
              </td>
              <td data-label={taskLabel} className="is-numeric">
                {project.taskCount}
              </td>
              <td data-label="Estimate" className="is-numeric">
                {formatHours(project.totalHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
