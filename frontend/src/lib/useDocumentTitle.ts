import { useEffect } from 'react';
import { config } from '@/config';

export function useDocumentTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} | ${config.appName}` : config.appName;
  }, [title]);
}
