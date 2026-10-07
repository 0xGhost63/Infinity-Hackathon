import { Check, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Loaders';

export type ComposeState = 'empty' | 'ready' | 'processing' | 'failed';
type StepState = 'pending' | 'next' | 'active' | 'done' | 'failed';

const STEPS = [
  { title: 'Paste the transcript', text: 'Include the whole meeting, especially the final recap.' },
  {
    title: 'Extract with AI',
    text: 'Projects, tasks, owners, deadlines, and hours are drafted from the final decisions. Rejected features are left out.',
  },
  {
    title: 'Check every field',
    text: 'People must exist in the directory, dates must be valid, and task deadlines must fall on or before the project deadline.',
  },
  { title: 'Save in one step', text: 'All projects and tasks are saved together. If anything fails, nothing is saved.' },
];

function statesFor(state: ComposeState): StepState[] {
  switch (state) {
    case 'empty':
      return ['next', 'pending', 'pending', 'pending'];
    case 'ready':
      return ['done', 'next', 'pending', 'pending'];
    case 'processing':
      return ['done', 'active', 'pending', 'pending'];
    case 'failed':
      return ['done', 'failed', 'pending', 'pending'];
  }
}

const STATE_LABEL: Record<StepState, string> = {
  pending: 'Not started',
  next: 'Next step',
  active: 'In progress',
  done: 'Done',
  failed: 'Failed',
};

export function ProcessRail({ state }: { state: ComposeState }) {
  const states = statesFor(state);
  return (
    <ol className="rail">
      {STEPS.map((step, index) => {
        const stepState = states[index];
        return (
          <li key={step.title} className="rail__step" data-state={stepState}>
            <span className="rail__marker" aria-hidden="true">
              {stepState === 'done' ? <Check /> : stepState === 'failed' ? <X /> : stepState === 'active' ? <Spinner /> : index + 1}
            </span>
            <div>
              <p className="rail__title">
                {step.title}
                <span className="sr-only">, {STATE_LABEL[stepState]}</span>
              </p>
              <p className="rail__text">{step.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
