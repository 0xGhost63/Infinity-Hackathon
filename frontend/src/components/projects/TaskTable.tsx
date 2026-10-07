import type { Task } from '@/api/types';
import { Person } from '@/components/ui/Avatar';
import { compareIsoDates } from '@/lib/dates';
import { formatHours, sumBy } from '@/lib/format';
import { DueDate } from './DueDate';

export function TaskTable({ tasks, showAssignee = true }: { tasks: Task[]; showAssignee?: boolean }) {
  const rows = [...tasks].sort((a, b) => compareIsoDates(a.deadline, b.deadline) || a.title.localeCompare(b.title));
  const total = sumBy(rows, (task) => task.estimatedHours);
  const columnCount = showAssignee ? 4 : 3;

  return (
    <div className="table-scroll">
      <table className="table table--stack">
        <thead>
          <tr>
            <th scope="col">Task</th>
            {showAssignee && <th scope="col">Assignee</th>}
            <th scope="col">Deadline</th>
            <th scope="col" className="is-numeric">
              Estimate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => (
            <tr key={task.id}>
              <td data-label="Task">
                <div className="task-cell">
                  <span className="task-cell__title">{task.title}</span>
                  {task.description && <span className="task-cell__desc">{task.description}</span>}
                </div>
              </td>
              {showAssignee && (
                <td data-label="Assignee">
                  <Person person={task.assignee} />
                </td>
              )}
              <td data-label="Deadline">
                <DueDate date={task.deadline} />
              </td>
              <td data-label="Estimate" className="is-numeric">
                {formatHours(task.estimatedHours)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columnCount - 1}>Total estimate</td>
            <td className="is-numeric">{formatHours(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
