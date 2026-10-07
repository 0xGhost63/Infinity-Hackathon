import type { Draft, DraftProject, User } from '../types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const PROJECT_LINE =
  /([A-Z][\w&' -]*?),\s*client\s+([^,\n]+?),\s*manager\s+([A-Z][A-Za-z]*),\s*deadline\s+(\d{1,2})\s+([A-Za-z]+)/g;
const TASK_LINE =
  /\b([A-Z][A-Za-z]*)\s+owns\s+([^:\n]+?):\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b,?\s*(?:due\s+)?(\d{1,2})\s+([A-Za-z]+)/g;

function detectYear(text: string): number {
  const dated = /Date:\s*\d{1,2}\s+[A-Za-z]+\s+(\d{4})/.exec(text);
  if (dated) return Number(dated[1]);
  const anyYear = /\b(20\d{2})\b/.exec(text);
  return anyYear ? Number(anyYear[1]) : new Date().getFullYear();
}

function toIsoDate(year: number, monthName: string, dayText: string): string | null {
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
  const day = Number(dayText);
  if (month < 0 || !Number.isInteger(day)) return null;
  const date = new Date(year, month, day);
  if (date.getMonth() !== month || date.getDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findPerson(name: string, directory: readonly User[]): User | undefined {
  const target = name.trim().toLowerCase();
  const exact = directory.find((person) => person.name.toLowerCase() === target);
  if (exact) return exact;
  const byFirstName = directory.filter((person) => person.name.split(/\s+/)[0].toLowerCase() === target);
  return byFirstName.length === 1 ? byFirstName[0] : undefined;
}

interface Match {
  index: number;
  kind: 'project' | 'task';
  groups: string[];
}

/**
 * Mock stand-in for the LLM, for frontend development only. It reads the final recap lines,
 * for example "UrbanCart Website, client UrbanCart Clothing, manager Ayesha, deadline 20 October."
 * and "Ali owns Product catalog UI: 12 hours, 12 October." Descriptions are left empty.
 * The real backend sends the whole transcript and the team directory to the model.
 */
export function extractDraftFromTranscript(transcript: string, directory: readonly User[]): Draft {
  const year = detectYear(transcript);
  const recapStart = transcript.toLowerCase().lastIndexOf('final recap');
  const source = recapStart >= 0 ? transcript.slice(recapStart) : transcript;

  const matches: Match[] = [];
  for (const match of source.matchAll(PROJECT_LINE)) {
    matches.push({ index: match.index ?? 0, kind: 'project', groups: match.slice(1) });
  }
  for (const match of source.matchAll(TASK_LINE)) {
    matches.push({ index: match.index ?? 0, kind: 'task', groups: match.slice(1) });
  }
  matches.sort((a, b) => a.index - b.index);

  const projects: DraftProject[] = [];
  for (const match of matches) {
    if (match.kind === 'project') {
      const [name, clientName, managerName, day, month] = match.groups;
      projects.push({
        name: name.trim(),
        clientName: clientName.trim(),
        description: '',
        managerId: findPerson(managerName, directory)?.id ?? null,
        managerName,
        deadline: toIsoDate(year, month, day),
        tasks: [],
      });
      continue;
    }

    const [ownerName, title, hours, day, month] = match.groups;
    if (projects.length === 0) {
      projects.push({ name: '', clientName: '', description: '', managerId: null, managerName: null, deadline: null, tasks: [] });
    }
    projects[projects.length - 1].tasks.push({
      title: title.trim(),
      description: '',
      assigneeId: findPerson(ownerName, directory)?.id ?? null,
      assigneeName: ownerName,
      deadline: toIsoDate(year, month, day),
      estimatedHours: Number(hours),
    });
  }

  return { projects };
}
