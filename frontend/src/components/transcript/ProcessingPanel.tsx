import { useEffect, useState } from 'react';

export function ProcessingPanel({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="processing" role="status" aria-live="polite">
      <div className="processing__row">
        <p className="processing__title">Reading the transcript</p>
        <span className="processing__time" aria-label={`${elapsed} seconds elapsed`}>
          {clock}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress__bar" />
      </div>
      <p className="processing__text">
        The AI is applying the final decisions and matching people to the team directory. Nothing is saved until the
        whole result passes validation. This usually takes under a minute.
      </p>
    </div>
  );
}
