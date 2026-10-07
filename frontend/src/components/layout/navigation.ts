import type { Role } from '@/api/types';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** Agents land on their own tasks; everyone else lands on the project overview. */
export function navigationFor(role: Role): NavItem[] {
  return [
    { to: '/', label: role === 'AGENT' ? 'My tasks' : 'Overview', end: true },
    { to: '/projects', label: 'Projects' },
    { to: '/team', label: 'Team' },
  ];
}
