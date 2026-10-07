import { NotFoundView } from '@/components/feedback/StatusViews';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return <NotFoundView />;
}
