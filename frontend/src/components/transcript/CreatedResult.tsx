import { useEffect, useRef } from 'react';
import type { TranscriptCreated } from '@/api/types';
import { ProjectBoard } from '@/components/board/ProjectBoard';
import { Button, LinkButton } from '@/components/ui/Button';
import { config } from '@/config';
import { formatHoursLong, pluralize, sumBy } from '@/lib/format';

export function CreatedResult({ result, onReset }: { result: TranscriptCreated; onReset: () => void }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const totals = result.totals ?? {
    projects: result.projects.length,
    tasks: sumBy(result.projects, (project) => project.tasks.length),
    hours: sumBy(result.projects, (project) => sumBy(project.tasks, (task) => task.estimatedHours)),
  };

  useEffect(() => {
    bannerRef.current?.focus();
  }, []);

  return (
    <div className="result">
      <div className="result__banner" ref={bannerRef} tabIndex={-1} role="status">
        <div>
          <h2 className="result__title">
            {pluralize(totals.projects, 'project')} and {pluralize(totals.tasks, 'task')} created
          </h2>
          <p className="result__text">
            Every project and task passed validation and was saved together, {formatHoursLong(totals.hours)} in total.
            {config.apiMode === 'mock' ? ' In mock mode they are stored in this browser.' : ''}
          </p>
        </div>
        <div className="result__actions">
          <LinkButton to="/projects" variant="primary">
            View all projects
          </LinkButton>
          <Button onClick={onReset}>Convert another transcript</Button>
        </div>
      </div>
      <ProjectBoard projects={result.projects} viewer="all" reveal />
    </div>
  );
}
