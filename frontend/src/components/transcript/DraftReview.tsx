import { useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, Trash2 } from 'lucide-react';
import type { Draft, DraftIssue, DraftProject, DraftTask, User } from '@/api/types';
import { Alert } from '@/components/ui/Alert';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, describedBy } from '@/components/ui/Field';
import { cx } from '@/lib/cx';
import { isValidIsoDate } from '@/lib/dates';
import { validateDraft } from '@/lib/draft-validation';
import { formatHours, pluralize, sumBy } from '@/lib/format';
import { accentClass } from '@/lib/palette';
import { ROLE_LABEL } from '@/lib/roles';

interface EditableTask extends DraftTask {
  key: string;
}

interface EditableProject extends Omit<DraftProject, 'tasks'> {
  key: string;
  tasks: EditableTask[];
}

interface EditableDraft {
  projects: EditableProject[];
}

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `draft-${keySeed}`;
}

function toEditable(draft: Draft): EditableDraft {
  return {
    projects: draft.projects.map((project) => ({
      ...project,
      key: nextKey(),
      tasks: project.tasks.map((task) => ({ ...task, key: nextKey() })),
    })),
  };
}

function toDraft(editable: EditableDraft): Draft {
  return {
    projects: editable.projects.map((project) => ({
      name: project.name,
      clientName: project.clientName,
      description: project.description,
      managerId: project.managerId,
      managerName: project.managerName ?? null,
      deadline: project.deadline,
      tasks: project.tasks.map((task) => ({
        title: task.title,
        description: task.description,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName ?? null,
        deadline: task.deadline,
        estimatedHours: task.estimatedHours,
      })),
    })),
  };
}

const FIELD_SUFFIX: Record<string, string> = {
  name: 'name',
  clientName: 'client',
  managerId: 'manager',
  deadline: 'deadline',
  title: 'title',
  assigneeId: 'assignee',
  estimatedHours: 'hours',
};

/** Turns "projects.2.tasks.1.assigneeId" into a readable location and the id of the field to focus. */
function locateIssue(path: string, draft: EditableDraft): { label: string; fieldId: string | null } {
  const match = /^projects\.(\d+)(?:\.tasks\.(\d+))?\.(\w+)$/.exec(path);
  const project = match ? draft.projects[Number(match[1])] : undefined;
  if (!match || !project) return { label: 'Draft', fieldId: null };
  const projectLabel = project.name.trim() || `Project ${Number(match[1]) + 1}`;
  const suffix = FIELD_SUFFIX[match[3]];
  if (match[2] === undefined) return { label: projectLabel, fieldId: suffix ? `${project.key}-${suffix}` : null };
  const task = project.tasks[Number(match[2])];
  if (!task) return { label: projectLabel, fieldId: null };
  const taskLabel = task.title.trim() || `task ${Number(match[2]) + 1}`;
  return { label: `${projectLabel}, ${taskLabel}`, fieldId: suffix ? `${task.key}-${suffix}` : null };
}

function focusField(fieldId: string) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  field.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  field.focus({ preventScroll: true });
}

/** Label for the empty option of a person picker whose current value is not usable. */
function unresolvedLabel(id: string | null, rawName: string | null | undefined, directory: User[], roleNoun: string): string {
  const person = id ? directory.find((candidate) => candidate.id === id) : undefined;
  if (person) return `${person.name} (${ROLE_LABEL[person.role].toLowerCase()}, choose a ${roleNoun})`;
  if (rawName) return `${rawName} (not in directory)`;
  return `Choose a ${roleNoun}`;
}

interface DraftReviewProps {
  draft: Draft;
  issues: DraftIssue[];
  directory: User[];
  saving: boolean;
  saveError: string | null;
  onSave: (draft: Draft) => void;
  onDiscard: () => void;
}

export function DraftReview({ draft: initialDraft, issues: serverIssues, directory, saving, saveError, onSave, onDiscard }: DraftReviewProps) {
  const [draft, setDraft] = useState<EditableDraft>(() => toEditable(initialDraft));
  const [edited, setEdited] = useState(false);

  const issues = useMemo(() => validateDraft(draft, directory), [draft, directory]);
  const issueMap = useMemo(() => new Map(issues.map((issue) => [issue.path, issue.message])), [issues]);
  // Server findings the local rules do not cover stay visible until the admin edits something.
  const serverOnly = edited ? [] : serverIssues.filter((issue) => !issueMap.has(issue.path));
  const managers = useMemo(() => directory.filter((person) => person.role === 'MANAGER'), [directory]);
  const agents = useMemo(() => directory.filter((person) => person.role === 'AGENT'), [directory]);

  const taskCount = sumBy(draft.projects, (project) => project.tasks.length);
  const hours = sumBy(draft.projects, (project) => sumBy(project.tasks, (task) => task.estimatedHours ?? 0));
  const blocked = issues.length > 0 || serverOnly.length > 0;

  function update(mutate: (projects: EditableProject[]) => EditableProject[]) {
    setEdited(true);
    setDraft((current) => ({ projects: mutate(current.projects) }));
  }

  const updateProject = (projectKey: string, patch: Partial<EditableProject>) =>
    update((projects) => projects.map((project) => (project.key === projectKey ? { ...project, ...patch } : project)));

  const updateTask = (projectKey: string, taskKey: string, patch: Partial<EditableTask>) =>
    update((projects) =>
      projects.map((project) =>
        project.key === projectKey
          ? { ...project, tasks: project.tasks.map((task) => (task.key === taskKey ? { ...task, ...patch } : task)) }
          : project,
      ),
    );

  const removeTask = (projectKey: string, taskKey: string) =>
    update((projects) =>
      projects.map((project) =>
        project.key === projectKey ? { ...project, tasks: project.tasks.filter((task) => task.key !== taskKey) } : project,
      ),
    );

  const removeProject = (projectKey: string) => update((projects) => projects.filter((project) => project.key !== projectKey));

  return (
    <div className="review">
      <Alert tone="warning" title="Nothing has been saved yet">
        <p>
          The AI could not resolve every required detail. Fix the fields below, then save. You can also remove a task or
          project the meeting did not agree on.
        </p>
        {issues.length > 0 && (
          <ul className="issue-list">
            {issues.map((issue) => {
              const location = locateIssue(issue.path, draft);
              const fieldId = location.fieldId;
              return (
                <li key={issue.path}>
                  {fieldId ? (
                    <a
                      href={`#${fieldId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        focusField(fieldId);
                      }}
                    >
                      {location.label}
                    </a>
                  ) : (
                    <strong>{location.label}</strong>
                  )}
                  : {issue.message}
                </li>
              );
            })}
          </ul>
        )}
      </Alert>
      {saveError && (
        <Alert tone="error" title="The draft was not saved">
          {saveError}
        </Alert>
      )}
      {serverOnly.length > 0 && (
        <Alert tone="error" title="The server reported more problems">
          <ul>
            {serverOnly.map((issue) => (
              <li key={issue.path}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {draft.projects.map((project, index) => (
        <DraftProjectEditor
          key={project.key}
          project={project}
          index={index}
          total={draft.projects.length}
          issueMap={issueMap}
          managers={managers}
          agents={agents}
          directory={directory}
          onChange={(patch) => updateProject(project.key, patch)}
          onTaskChange={(taskKey, patch) => updateTask(project.key, taskKey, patch)}
          onTaskRemove={(taskKey) => removeTask(project.key, taskKey)}
          onRemove={draft.projects.length > 1 ? () => removeProject(project.key) : undefined}
        />
      ))}

      <div className="review__bar">
        <div className="review__summary">
          <span className={cx('review__status', blocked ? 'review__status--blocked' : 'review__status--ready')}>
            {blocked ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            {issues.length > 0 ? `${pluralize(issues.length, 'field')} to fix` : blocked ? 'Resolve the problems above' : 'Ready to save'}
          </span>
          <span className="review__totals">
            {pluralize(draft.projects.length, 'project')}, {pluralize(taskCount, 'task')}, {formatHours(hours)}
          </span>
        </div>
        <div className="review__actions">
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>
            Back to transcript
          </Button>
          <Button variant="primary" onClick={() => onSave(toDraft(draft))} disabled={issues.length > 0} loading={saving}>
            Save projects and tasks
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DraftProjectEditorProps {
  project: EditableProject;
  index: number;
  total: number;
  issueMap: Map<string, string>;
  managers: User[];
  agents: User[];
  directory: User[];
  onChange: (patch: Partial<EditableProject>) => void;
  onTaskChange: (taskKey: string, patch: Partial<EditableTask>) => void;
  onTaskRemove: (taskKey: string) => void;
  onRemove?: () => void;
}

function DraftProjectEditor({
  project,
  index,
  total,
  issueMap,
  managers,
  agents,
  directory,
  onChange,
  onTaskChange,
  onTaskRemove,
  onRemove,
}: DraftProjectEditorProps) {
  const path = `projects.${index}`;
  const idBase = project.key;
  const issue = (field: string) => issueMap.get(`${path}.${field}`) ?? null;
  const managerValid = managers.some((manager) => manager.id === project.managerId);
  const projectHours = sumBy(project.tasks, (task) => task.estimatedHours ?? 0);
  const ids = {
    name: `${idBase}-name`,
    client: `${idBase}-client`,
    manager: `${idBase}-manager`,
    deadline: `${idBase}-deadline`,
    description: `${idBase}-description`,
  };

  return (
    <section className={cx('draft', accentClass(managerValid ? project.managerId : null))} aria-labelledby={`${idBase}-title`}>
      <header className="draft__head">
        <h2 className="draft__label" id={`${idBase}-title`}>
          Project {index + 1} of {total}
          {project.name ? `: ${project.name}` : ''}
        </h2>
        {onRemove && (
          <IconButton size="sm" label="Remove this project from the draft" onClick={onRemove}>
            <Trash2 aria-hidden="true" />
          </IconButton>
        )}
      </header>

      <div className="draft__fields">
        <Field id={ids.name} label="Project name" error={issue('name')}>
          <Input
            id={ids.name}
            value={project.name}
            invalid={Boolean(issue('name'))}
            aria-describedby={describedBy(ids.name, issue('name'))}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field id={ids.client} label="Client" error={issue('clientName')}>
          <Input
            id={ids.client}
            value={project.clientName}
            invalid={Boolean(issue('clientName'))}
            aria-describedby={describedBy(ids.client, issue('clientName'))}
            onChange={(event) => onChange({ clientName: event.target.value })}
          />
        </Field>
        <Field id={ids.manager} label="Project manager" error={issue('managerId')}>
          <Select
            id={ids.manager}
            value={managerValid ? (project.managerId ?? '') : ''}
            invalid={Boolean(issue('managerId'))}
            aria-describedby={describedBy(ids.manager, issue('managerId'))}
            onChange={(event) => onChange({ managerId: event.target.value || null })}
          >
            {!managerValid && <option value="">{unresolvedLabel(project.managerId, project.managerName, directory, 'manager')}</option>}
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}, {manager.specialization}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={ids.deadline} label="Project deadline" error={issue('deadline')}>
          <Input
            id={ids.deadline}
            type="date"
            value={isValidIsoDate(project.deadline) ? project.deadline : ''}
            invalid={Boolean(issue('deadline'))}
            aria-describedby={describedBy(ids.deadline, issue('deadline'))}
            onChange={(event) => onChange({ deadline: event.target.value || null })}
          />
        </Field>
        <Field id={ids.description} label="Description" optional className="span-all">
          <Textarea
            id={ids.description}
            rows={2}
            value={project.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      </div>

      <div className="draft__tasks-head">
        <h3 className="draft__tasks-title">Tasks</h3>
        <span className="draft__tasks-meta">
          {pluralize(project.tasks.length, 'task')}, {formatHours(projectHours)}
        </span>
      </div>
      {project.tasks.length === 0 ? (
        <p className="draft__empty">This project has no tasks.</p>
      ) : (
        project.tasks.map((task, taskIndex) => (
          <DraftTaskEditor
            key={task.key}
            task={task}
            path={`${path}.tasks.${taskIndex}`}
            issueMap={issueMap}
            agents={agents}
            directory={directory}
            onChange={(patch) => onTaskChange(task.key, patch)}
            onRemove={() => onTaskRemove(task.key)}
          />
        ))
      )}
    </section>
  );
}

interface DraftTaskEditorProps {
  task: EditableTask;
  path: string;
  issueMap: Map<string, string>;
  agents: User[];
  directory: User[];
  onChange: (patch: Partial<EditableTask>) => void;
  onRemove: () => void;
}

function DraftTaskEditor({ task, path, issueMap, agents, directory, onChange, onRemove }: DraftTaskEditorProps) {
  const issue = (field: string) => issueMap.get(`${path}.${field}`) ?? null;
  const assigneeValid = agents.some((agent) => agent.id === task.assigneeId);
  const hasIssue = ['title', 'assigneeId', 'deadline', 'estimatedHours'].some((field) => issue(field));
  const ids = {
    title: `${task.key}-title`,
    description: `${task.key}-description`,
    assignee: `${task.key}-assignee`,
    deadline: `${task.key}-deadline`,
    hours: `${task.key}-hours`,
  };

  return (
    <div className={cx('draft-task', hasIssue && 'draft-task--invalid')}>
      <div className="draft-task__main">
        <Field id={ids.title} label="Task" error={issue('title')}>
          <Input
            id={ids.title}
            value={task.title}
            invalid={Boolean(issue('title'))}
            aria-describedby={describedBy(ids.title, issue('title'))}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>
        <Field id={ids.description} label="Description" optional>
          <Input id={ids.description} value={task.description} onChange={(event) => onChange({ description: event.target.value })} />
        </Field>
      </div>
      <Field id={ids.assignee} label="Assignee" error={issue('assigneeId')}>
        <Select
          id={ids.assignee}
          value={assigneeValid ? (task.assigneeId ?? '') : ''}
          invalid={Boolean(issue('assigneeId'))}
          aria-describedby={describedBy(ids.assignee, issue('assigneeId'))}
          onChange={(event) => onChange({ assigneeId: event.target.value || null })}
        >
          {!assigneeValid && <option value="">{unresolvedLabel(task.assigneeId, task.assigneeName, directory, 'agent')}</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}, {agent.specialization}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={ids.deadline} label="Deadline" error={issue('deadline')}>
        <Input
          id={ids.deadline}
          type="date"
          value={isValidIsoDate(task.deadline) ? task.deadline : ''}
          invalid={Boolean(issue('deadline'))}
          aria-describedby={describedBy(ids.deadline, issue('deadline'))}
          onChange={(event) => onChange({ deadline: event.target.value || null })}
        />
      </Field>
      <Field id={ids.hours} label="Hours" error={issue('estimatedHours')}>
        <Input
          id={ids.hours}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          value={task.estimatedHours ?? ''}
          invalid={Boolean(issue('estimatedHours'))}
          aria-describedby={describedBy(ids.hours, issue('estimatedHours'))}
          onChange={(event) => onChange({ estimatedHours: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </Field>
      <IconButton size="sm" className="draft-task__remove" label={`Remove task ${task.title || 'without a title'}`} onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </IconButton>
    </div>
  );
}
