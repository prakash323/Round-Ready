import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

/**
 * A focus timer.
 *
 * Deliberately does nothing except count down. It does not mark a study task
 * complete, award a streak day or touch the planner — opening a timer is not
 * evidence that work happened, and a tool that treated it as such would make
 * the streak meaningless and the completion figures a lie.
 *
 * The countdown is computed from a wall-clock deadline rather than by
 * decrementing on a tick, so a backgrounded tab (where browsers throttle
 * timers to once a minute) resumes showing the right number instead of
 * however many ticks it managed to fire.
 */

const PRESETS = [15, 25, 50];

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FocusTimer() {
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  /** When the current run should end, in epoch ms. */
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (endsAt.current === null) return;
      const left = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        endsAt.current = null;
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running]);

  function start() {
    endsAt.current = Date.now() + remaining * 1000;
    setRunning(true);
  }

  function pause() {
    setRunning(false);
    endsAt.current = null;
  }

  function reset(toMinutes = minutes) {
    setRunning(false);
    endsAt.current = null;
    setMinutes(toMinutes);
    setRemaining(toMinutes * 60);
  }

  const done = remaining === 0;

  return (
    <div className="rounded-xl border border-edge bg-raised p-4">
      <h2 className="text-sm font-semibold">Focus session</h2>
      <p className="mt-0.5 text-2xs text-faint">Just a timer — it marks nothing complete</p>

      <p
        className="tabular mt-3 text-center text-4xl font-semibold"
        role="timer"
        aria-live="off"
        aria-label={`${mmss(remaining)} remaining`}
      >
        {mmss(remaining)}
      </p>

      {done && (
        <p className="mt-1 text-center text-2xs text-ok" role="status">
          Session finished. Tick the task off yourself if you did it.
        </p>
      )}

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {running ? (
          <button type="button" onClick={pause} className="btn-ghost btn-sm">
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={remaining === 0}
            className="btn-primary btn-sm"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Start
          </button>
        )}
        <button
          type="button"
          onClick={() => reset()}
          aria-label="Reset the timer"
          className="btn-quiet h-8 w-8 p-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => reset(preset)}
            aria-pressed={minutes === preset}
            className={`rounded-md px-2 py-1 text-2xs transition-colors ${
              minutes === preset ? "bg-accent/15 text-accent" : "text-faint hover:text-ink"
            }`}
          >
            {preset}m
          </button>
        ))}
      </div>
    </div>
  );
}
