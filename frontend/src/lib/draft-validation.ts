import type { Draft, DraftIssue, User } from '@/api/types';
import { isValidIsoDate } from './dates';

type DirectoryEntry = Pick<User, 'id' | 'name' | 'role'>;

/**
 * Same rules the backend applies before saving (see docs/api-contract.md).
 * Runs live in the review screen so the admin sees what still blocks saving.
 */
export function validateDraft(draft: Draft, directory: readonly DirectoryEntry[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const people = new Map(directory.map((person) => [person.id, person]));

  if (draft.projects.length === 0) {
    issues.push({ path: 'projects', message: 'The draft does not contain any projects.' });
  }

  draft.projects.forEach((project, p) => {
    const at = (field: string) => `projects.${p}.${field}`;

    if (!project.name.trim()) issues.push({ path: at('name'), message: 'Enter the project name.' });
    if (!project.clientName.trim()) issues.push({ path: at('clientName'), message: 'Enter the client name.' });

    const manager = project.managerId ? people.get(project.managerId) : undefined;
    if (!manager) {
      issues.push({
        path: at('managerId'),
        message: project.managerName
          ? `${project.managerName} is not in the team directory. Choose a project manager.`
          : 'Choose a project manager.',
      });
    } else if (manager.role !== 'MANAGER') {
      issues.push({ path: at('managerId'), message: `${manager.name} is not a project manager. Choose a project manager.` });
    }

    const projectDeadline = isValidIsoDate(project.deadline) ? project.deadline : null;
    if (!projectDeadline) issues.push({ path: at('deadline'), message: 'Enter a valid project deadline.' });

    project.tasks.forEach((task, t) => {
      const taskAt = (field: string) => `projects.${p}.tasks.${t}.${field}`;

      if (!task.title.trim()) issues.push({ path: taskAt('title'), message: 'Enter the task title.' });

      const assignee = task.assigneeId ? people.get(task.assigneeId) : undefined;
      if (!assignee) {
        issues.push({
          path: taskAt('assigneeId'),
          message: task.assigneeName
            ? `${task.assigneeName} is not in the team directory. Assign an agent.`
            : 'Assign this task to an agent.',
        });
      } else if (assignee.role !== 'AGENT') {
        issues.push({ path: taskAt('assigneeId'), message: `${assignee.name} is not an agent. Tasks can only go to agents.` });
      }

      const taskDeadline = isValidIsoDate(task.deadline) ? task.deadline : null;
      if (!taskDeadline) {
        issues.push({ path: taskAt('deadline'), message: 'Enter a valid task deadline.' });
      } else if (projectDeadline && taskDeadline > projectDeadline) {
        issues.push({ path: taskAt('deadline'), message: 'This is after the project deadline.' });
      }

      const hours = task.estimatedHours;
      if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        issues.push({ path: taskAt('estimatedHours'), message: 'Enter a positive number of hours.' });
      }
    });
  });

  return issues;
}
