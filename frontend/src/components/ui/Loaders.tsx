import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('spinner', className)} aria-hidden="true" />;
}

export function NotesLoader() {
  return (
    <span className="loader-notes" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  className?: string;
}

export function Skeleton({ width = '100%', height = 14, className }: SkeletonProps) {
  return <span className={cx('skeleton', className)} style={{ width, height }} aria-hidden="true" />;
}
