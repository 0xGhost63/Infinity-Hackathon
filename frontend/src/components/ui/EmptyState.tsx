import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <h2 className="empty__title">{title}</h2>
      {description && <p className="empty__text">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
