/**
 * The page background: grid, dots and corner glows (CSS, .ui-backdrop), plus faint circuit
 * traces with light running along them, after the original Arwes sites (soulextract.com).
 * No script: the traces are one static SVG and the light streaks are CSS transforms, which
 * the browser animates off the main thread. (The animated Arwes canvas this replaced cost
 * ~1.5 s of phone main-thread time and failed the M2 Lighthouse gate.) The streaks stop with
 * motion off or in reading mode, and the circuit isn't drawn on small screens.
 */

// Traces in a 1440×900 box stretched to the window: mostly horizontal, with 45° bends.
const TRACES = [
  'M0 60H420L470 30H1100',
  'M0 160H700L760 220H1440',
  'M0 300H300L360 360H980',
  'M520 430H1440',
  'M0 520H180L240 580H860L900 540H1300',
  'M0 700H640L700 760H1440',
  'M0 840H520L560 800H1200',
];
// Trace ends, away from the left edge where page text starts.
const NODES: [number, number][] = [
  [1100, 30],
  [980, 360],
  [520, 430],
  [1300, 540],
  [1200, 800],
];
// Straight stretches the light runs along: x from, x to, y (same 1440×900 box).
const STREAKS: [number, number, number][] = [
  [0, 420, 60],
  [470, 1100, 30],
  [760, 1440, 220],
  [520, 1440, 430],
  [240, 860, 580],
  [700, 1440, 760],
];

export function Backdrop() {
  return (
    <div className="ui-backdrop" data-testid="backdrop" aria-hidden="true">
      <svg className="ui-circuit" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
        {TRACES.map((d) => (
          <path key={d} d={d} />
        ))}
        {NODES.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
      </svg>
      {STREAKS.map(([x1, x2, y], i) => (
        <span
          key={i}
          className="ui-streak"
          style={
            {
              left: `${(x1 / 1440) * 100}%`,
              width: `${((x2 - x1) / 1440) * 100}%`,
              top: `${(y / 900) * 100}%`,
              // Read by the streak animation (globals.css): each runs at its own pace.
              '--delay': `${i * 1.7}s`,
              '--duration': `${7 + (i % 3) * 2}s`,
            } as React.CSSProperties
          }
        >
          <i />
        </span>
      ))}
    </div>
  );
}
