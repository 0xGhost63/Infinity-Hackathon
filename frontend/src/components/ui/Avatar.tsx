import type { ReactNode } from 'react';
import type { UserRef } from '@/api/types';
import { cx } from '@/lib/cx';
import { initials } from '@/lib/format';
import { accentClass } from '@/lib/palette';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps {
  name: string;
  id?: string;
  size?: AvatarSize;
  className?: string;
}

/** Initials on the person's sticky-note color. Decorative: the name is always shown beside it. */
export function Avatar({ name, id, size = 'md', className }: AvatarProps) {
  return (
    <span className={cx('avatar', `avatar--${size}`, accentClass(id ?? name), className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

interface PersonProps {
  person: UserRef | null | undefined;
  meta?: ReactNode;
  size?: AvatarSize;
}

export function Person({ person, meta, size = 'sm' }: PersonProps) {
  if (!person) return <span className="person person--missing">Unassigned</span>;
  return (
    <span className="person">
      <Avatar name={person.name} id={person.id} size={size} />
      <span className="person__text">
        <span className="person__name">{person.name}</span>
        <span className="person__meta">{meta ?? person.specialization}</span>
      </span>
    </span>
  );
}
