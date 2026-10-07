import type { Role } from '@/api/types';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  AGENT: 'Agent',
};

export const ROLE_TONE: Record<Role, 'ink' | 'blue' | 'green'> = {
  ADMIN: 'ink',
  MANAGER: 'blue',
  AGENT: 'green',
};

export const ROLE_GROUP_TITLE: Record<Role, string> = {
  ADMIN: 'Administration',
  MANAGER: 'Project managers',
  AGENT: 'Agents',
};

/** "Manager, Web PM". Skips the specialization when it repeats the role. */
export function describeAccount(user: { role: Role; specialization: string }): string {
  const role = ROLE_LABEL[user.role];
  return user.specialization && user.specialization !== role ? `${role}, ${user.specialization}` : role;
}
