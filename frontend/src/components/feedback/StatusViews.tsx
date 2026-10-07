import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import type { ApiError } from '@/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button, LinkButton } from '@/components/ui/Button';
import { NotesLoader } from '@/components/ui/Loaders';
import { cx } from '@/lib/cx';

export function PageLoader({ label = 'Loading', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div className={cx('page-loader', fullScreen && 'page-loader--full')} role="status" aria-live="polite">
      <NotesLoader />
      <span className="page-loader__label">{label}</span>
    </div>
  );
}

interface ErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
  title?: string;
}

export function ErrorState({ error, onRetry, title = 'This page could not be loaded' }: ErrorStateProps) {
  return (
    <Alert
      tone="error"
      title={title}
      action={
        onRetry && (
          <Button size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {error.message}
    </Alert>
  );
}

interface StatusViewProps {
  code: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function StatusView({ code, title, description, action }: StatusViewProps) {
  return (
    <section className="status-view">
      <span className="status-view__code" aria-hidden="true">
        {code}
      </span>
      <h1 className="status-view__title">{title}</h1>
      <p className="status-view__text">{description}</p>
      <div className="status-view__actions">
        {action ?? (
          <LinkButton to="/" variant="primary">
            Back to home
          </LinkButton>
        )}
      </div>
    </section>
  );
}

export function ForbiddenView({ title, description }: { title: string; description: string }) {
  return <StatusView code="403" title={title} description={description} />;
}

export function NotFoundView({
  title = 'Page not found',
  description = 'The page you opened does not exist or has moved.',
}: {
  title?: string;
  description?: string;
}) {
  return <StatusView code="404" title={title} description={description} />;
}

export function RouteErrorView() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <div className="route-error">
      <StatusView
        code="Error"
        title="Something went wrong"
        description={`This page failed to load. ${detail}`}
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        }
      />
    </div>
  );
}
