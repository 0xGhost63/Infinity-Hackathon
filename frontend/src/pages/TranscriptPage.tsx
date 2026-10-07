import { useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Eraser, FileText, RotateCcw } from 'lucide-react';
import { api } from '@/api';
import { type ApiError, toApiError } from '@/api/errors';
import type { Draft, DraftIssue, TranscriptCreated, TranscriptResult } from '@/api/types';
import { ErrorState, PageLoader } from '@/components/feedback/StatusViews';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreatedResult } from '@/components/transcript/CreatedResult';
import { DirectoryPanel } from '@/components/transcript/DirectoryPanel';
import { DraftReview } from '@/components/transcript/DraftReview';
import { ProcessRail, type ComposeState } from '@/components/transcript/ProcessRail';
import { ProcessingPanel } from '@/components/transcript/ProcessingPanel';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Panel, PanelBody, PanelFooter, PanelHeader } from '@/components/ui/Panel';
import { config } from '@/config';
import { countWords, pluralize } from '@/lib/format';
import { SAMPLE_TRANSCRIPT } from '@/lib/sample-transcript';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useResource } from '@/lib/useResource';

type Phase =
  | { kind: 'compose' }
  | { kind: 'processing'; startedAt: number }
  | { kind: 'failed'; error: ApiError }
  | { kind: 'review'; draft: Draft; issues: DraftIssue[]; version: number; saving: boolean; saveError: string | null }
  | { kind: 'created'; result: TranscriptCreated };

const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const PLACEHOLDER = `Paste the full meeting transcript here, including the final recap.

09:00-09:04 | Opening
Ayesha: Good morning. We have three client engagements to plan today...`;

export function TranscriptPage() {
  useDocumentTitle('Create from Transcript');
  const team = useResource((signal) => api.team.list({ signal }), []);
  const [transcript, setTranscript] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' });
  const inFlight = useRef(false);
  const reviewVersion = useRef(0);

  const applyResult = useCallback((result: TranscriptResult) => {
    if (result.status === 'created') {
      setPhase({ kind: 'created', result });
      return;
    }
    reviewVersion.current += 1;
    setPhase({ kind: 'review', draft: result.draft, issues: result.issues, version: reviewVersion.current, saving: false, saveError: null });
  }, []);

  const convert = useCallback(async () => {
    // The ref blocks double submits even before React re-renders the disabled button.
    if (inFlight.current || !transcript.trim()) return;
    inFlight.current = true;
    setPhase({ kind: 'processing', startedAt: Date.now() });
    try {
      applyResult(await api.transcripts.convert(transcript));
    } catch (error) {
      setPhase({ kind: 'failed', error: toApiError(error) });
    } finally {
      inFlight.current = false;
    }
  }, [transcript, applyResult]);

  const commit = useCallback(
    async (draft: Draft) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPhase((current) => (current.kind === 'review' ? { ...current, saving: true, saveError: null } : current));
      try {
        applyResult(await api.transcripts.commit(draft));
      } catch (error) {
        const message = toApiError(error).message;
        setPhase((current) => (current.kind === 'review' ? { ...current, saving: false, saveError: message } : current));
      } finally {
        inFlight.current = false;
      }
    },
    [applyResult],
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void convert();
    }
  }

  function startOver() {
    setTranscript('');
    setPhase({ kind: 'compose' });
    window.scrollTo({ top: 0 });
  }

  const words = useMemo(() => countWords(transcript), [transcript]);
  const processing = phase.kind === 'processing';
  const hasText = transcript.trim().length > 0;

  if (phase.kind === 'created') {
    return (
      <>
        <PageHeader title="Create from Transcript" />
        <CreatedResult result={phase.result} onReset={startOver} />
      </>
    );
  }

  if (phase.kind === 'review') {
    return (
      <>
        <PageHeader
          title="Review the draft"
          description="Some required details could not be matched to the team directory or the calendar. Correct them here and everything is saved in one step."
        />
        {team.status === 'error' && team.error ? (
          <ErrorState error={team.error} onRetry={team.reload} title="The team directory could not be loaded" />
        ) : !team.data ? (
          <PageLoader label="Loading the team directory" />
        ) : (
          <DraftReview
            key={phase.version}
            draft={phase.draft}
            issues={phase.issues}
            directory={team.data}
            saving={phase.saving}
            saveError={phase.saveError}
            onSave={commit}
            onDiscard={() => setPhase({ kind: 'compose' })}
          />
        )}
      </>
    );
  }

  const railState: ComposeState = processing ? 'processing' : phase.kind === 'failed' ? 'failed' : hasText ? 'ready' : 'empty';

  return (
    <>
      <PageHeader
        title="Create from Transcript"
        description="Paste a meeting transcript. The AI drafts projects, tasks, owners, deadlines, and estimated hours from the team directory, then everything is saved in one step."
      />
      {config.apiMode === 'mock' && (
        <Alert tone="info" title="Mock API mode" className="page-alert">
          Extraction is simulated by a local parser that reads the final recap only. Run against the backend to use the
          AI extractor.
        </Alert>
      )}
      <div className="compose">
        <div className="compose__main">
          {phase.kind === 'failed' && (
            <Alert
              tone="error"
              title="The transcript was not converted"
              action={
                <Button size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={convert}>
                  Try again
                </Button>
              }
            >
              {phase.error.message} Nothing was saved.
            </Alert>
          )}
          <Panel className="editor" aria-labelledby="editor-title">
            <PanelHeader
              id="editor-title"
              title="Meeting transcript"
              actions={
                <>
                  <Button size="sm" icon={<FileText aria-hidden="true" />} onClick={() => setTranscript(SAMPLE_TRANSCRIPT)} disabled={processing}>
                    Insert sample transcript
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Eraser aria-hidden="true" />} onClick={() => setTranscript('')} disabled={processing || !transcript}>
                    Clear
                  </Button>
                </>
              }
            />
            <label className="sr-only" htmlFor="transcript">
              Meeting transcript
            </label>
            <textarea
              id="transcript"
              className="editor__textarea"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              onKeyDown={handleKeyDown}
              readOnly={processing}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              aria-describedby="transcript-meta"
            />
            {phase.kind === 'processing' && <ProcessingPanel startedAt={phase.startedAt} />}
            <PanelFooter>
              <p className="editor__meta" id="transcript-meta">
                <span>{pluralize(words, 'word')}</span>
                <span className="editor__shortcut">
                  <kbd className="kbd">{IS_APPLE ? 'Cmd' : 'Ctrl'}</kbd>
                  <span aria-hidden="true">+</span>
                  <kbd className="kbd">Enter</kbd>
                  <span>to create</span>
                </span>
              </p>
              <Button variant="primary" size="lg" onClick={convert} loading={processing} disabled={!hasText}>
                {processing ? 'Creating' : 'Create from Transcript'}
              </Button>
            </PanelFooter>
          </Panel>
        </div>
        <aside className="compose__aside">
          <Panel aria-labelledby="steps-title">
            <PanelHeader id="steps-title" title="What happens next" />
            <PanelBody>
              <ProcessRail state={railState} />
            </PanelBody>
          </Panel>
          <DirectoryPanel resource={team} />
        </aside>
      </div>
    </>
  );
}
