import type { ReactNode } from 'react';
import type { Role } from '@/api/types';
import { cx } from '@/lib/cx';
import { ROLE_LABEL, ROLE_TONE } from '@/lib/roles';

export type TagTone = 'plain' | 'ink' | 'blue' | 'yellow' | 'green' | 'pink' | 'violet' | 'orange';

export function Tag({ tone = 'plain', className, children }: { tone?: TagTone; className?: string; children: ReactNode }) {
  return <span className={cx('tag', `tag--${tone}`, className)}>{children}</span>;
}

export function RoleTag({ role }: { role: Role }) {
  return <Tag tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Tag>;
}
