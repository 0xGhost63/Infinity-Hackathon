import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx('panel', className)} {...rest} />;
}

interface PanelHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
}

export function PanelHeader({ title, subtitle, actions, id }: PanelHeaderProps) {
  return (
    <header className="panel__head">
      <div className="panel__heading">
        <h2 className="panel__title" id={id}>
          {title}
        </h2>
        {subtitle && <p className="panel__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="panel__actions">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('panel__body', className)} {...rest} />;
}

export function PanelFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('panel__foot', className)} {...rest} />;
}
