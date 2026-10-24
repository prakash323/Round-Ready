import type { Proficiency, SkillGap } from "../lib/types";

/**
 * Current proficiency against the target, as a radar.
 *
 * Drawn as inline SVG rather than pulled from a charting library: the whole
 * chart is about sixty lines of trigonometry, and a dependency would bring a
 * canvas renderer, its own colour handling and a theme system that has to be
 * taught about ours. Inline SVG inherits the design tokens directly, so it is
 * correct in both themes without a second palette to keep in step.
 *
 * Two rules shape what it will and will not draw:
 *
 *  - An unrated skill is left out entirely. Plotting it at zero would draw a
 *    student who has not assessed themselves as a student with no ability, and
 *    the dent in the shape would be indistinguishable from a real weakness.
 *  - The axis always runs the full scale, 0 to advanced. Cropping it to the
 *    student's own range would turn a one-step gap into a dramatic notch.
 */

const RANK: Record<Proficiency, number> = {
  none: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const MAX = 3;
/** Beyond this, the labels around the perimeter start colliding. */
const MAX_AXES = 8;

const LEVEL_LABEL: Record<Proficiency, string> = {
  none: "Not started",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

interface Axis {
  label: string;
  current: number;
  target: number;
  currentLabel: string;
  targetLabel: string;
}

function pointOn(cx: number, cy: number, radius: number, index: number, count: number) {
  // Start at twelve o'clock and run clockwise, which is how a radar is read.
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
}

function polygon(axes: Axis[], pick: (a: Axis) => number, cx: number, cy: number, r: number) {
  return axes
    .map((axis, i) => {
      const [x, y] = pointOn(cx, cy, (pick(axis) / MAX) * r, i, axes.length);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function SkillRadar({ gaps }: { gaps: SkillGap[] }) {
  // Only rated skills can be plotted. Ranked by priority so that when there
  // are more than fit, the ones shown are the ones that matter.
  const rated = gaps.filter((g) => g.level !== null);
  const omitted = gaps.length - rated.length;
  const shown = [...rated].sort((a, b) => b.priority - a.priority).slice(0, MAX_AXES);
  const truncated = rated.length - shown.length;

  const axes: Axis[] = shown.map((g) => ({
    label: g.skill.label,
    current: RANK[g.level as Proficiency],
    target: RANK[g.target],
    currentLabel: LEVEL_LABEL[g.level as Proficiency],
    targetLabel: LEVEL_LABEL[g.target],
  }));

  if (axes.length < 3) {
    return (
      <div className="panel-flush flex min-h-[16rem] flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium">Not enough rated skills to chart</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
          A radar needs at least three axes to be a shape rather than a line. Rate{" "}
          {3 - axes.length} more skill{3 - axes.length === 1 ? "" : "s"} below and it will appear
          here.
        </p>
      </div>
    );
  }

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  // Leaves room for the labels, which sit outside the outermost ring.
  const r = size / 2 - 58;

  /**
   * The chart's text alternative.
   *
   * A screen reader gets the same comparison in words rather than "graphic".
   * This is the content, not a caption for it.
   */
  const summary = axes
    .map((a) => `${a.label}: ${a.currentLabel}, target ${a.targetLabel}`)
    .join(". ");

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-[20rem]"
        role="img"
        aria-label={`Your proficiency against the target for ${axes.length} skills. ${summary}`}
      >
        {/* Rings, one per proficiency step, so the scale is countable. */}
        {[1, 2, 3].map((ring) => (
          <polygon
            key={ring}
            points={polygon(axes, () => ring, cx, cy, r)}
            className="fill-none stroke-edge"
            strokeWidth={1}
          />
        ))}

        {/* Spokes */}
        {axes.map((axis, i) => {
          const [x, y] = pointOn(cx, cy, r, i, axes.length);
          return (
            <line
              key={axis.label}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              className="stroke-edge"
              strokeWidth={1}
            />
          );
        })}

        {/* Target: outline only, so it reads as a line to reach rather than
            an achievement already banked. */}
        <polygon
          points={polygon(axes, (a) => a.target, cx, cy, r)}
          className="fill-none stroke-muted"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {/* Current */}
        <polygon
          points={polygon(axes, (a) => a.current, cx, cy, r)}
          className="fill-accent/20 stroke-accent"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {axes.map((axis, i) => {
          const [x, y] = pointOn(cx, cy, (axis.current / MAX) * r, i, axes.length);
          return <circle key={axis.label} cx={x} cy={y} r={3} className="fill-accent" />;
        })}

        {/* Labels, nudged outside the outer ring and anchored by which side
            of the circle they fall on so they never overlap the shape. */}
        {axes.map((axis, i) => {
          const [x, y] = pointOn(cx, cy, r + 18, i, axes.length);
          const anchor = x > cx + 4 ? "start" : x < cx - 4 ? "end" : "middle";
          return (
            <text
              key={axis.label}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-muted text-[0.6rem] font-medium"
            >
              {axis.label.length > 14 ? `${axis.label.slice(0, 13)}…` : axis.label}
            </text>
          );
        })}
      </svg>

      {/* Legend. Shape and line style carry the meaning as well as colour, so
          it survives both themes and colour-blind readers. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-2.5 w-2.5 rounded-sm border-2 border-accent bg-accent/20" />
          Your level
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-0 w-4 border-t-2 border-dashed border-muted" />
          Suggested target
        </span>
      </div>

      {(omitted > 0 || truncated > 0) && (
        <p className="mt-2 max-w-xs text-center text-2xs leading-relaxed text-faint">
          {omitted > 0 && (
            <>
              {omitted} unrated skill{omitted === 1 ? " is" : "s are"} not plotted — an unrated
              skill has no level, and drawing it at zero would look like a weakness.
            </>
          )}
          {omitted > 0 && truncated > 0 && " "}
          {truncated > 0 && (
            <>
              Showing the {MAX_AXES} highest-priority of {rated.length} rated skills, so the labels
              stay readable.
            </>
          )}
        </p>
      )}
    </div>
  );
}
