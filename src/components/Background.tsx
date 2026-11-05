import { cycle } from './ui';

const BLOBS = [
  { x: '8%', y: '12%', s: '46vmax', drift: 'drift-a', d: '95s' },
  { x: '70%', y: '6%', s: '40vmax', drift: 'drift-b', d: '120s' },
  { x: '55%', y: '70%', s: '50vmax', drift: 'drift-c', d: '140s' },
  { x: '-6%', y: '68%', s: '38vmax', drift: 'drift-b', d: '110s' },
  { x: '30%', y: '35%', s: '30vmax', drift: 'drift-a', d: '160s' },
];

/** Slowly drifting, hue-cycling colour fields behind the glass. */
export function Background() {
  return (
    <div className="bg cycle" style={cycle('bg-base', 400, 700)} aria-hidden="true">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="bg-blob-pos"
          style={{ left: b.x, top: b.y, width: b.s, height: b.s, animation: `${b.drift} ${b.d} ease-in-out infinite alternate` }}
        >
          <div className="bg-blob cycle" style={cycle('blob' + i, 120, 400)} />
        </div>
      ))}
      <div className="bg-grain" />
    </div>
  );
}
