// Простые графики без библиотек: рисуются на сервере, подсказка — при наведении (title).

type Bar = { label: string; value: number; text: string; hint?: string };

/** Горизонтальные полосы: сравнение сотрудников, категорий расходов и т.п. */
export function HBars({ rows, empty = "Нет данных" }: { rows: Bar[]; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max <= 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} title={r.hint ?? `${r.label}: ${r.text}`}>
          <div className="mb-0.5 flex justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.text}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(2, (Math.max(0, r.value) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Столбики по дням. */
export function Columns({ data, empty = "Нет данных" }: { data: { label: string; value: number; hint: string }[]; empty?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max <= 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div>
      <div className="flex h-40 items-end gap-px">
        {data.map((d, i) => (
          <div key={i} className="group flex h-full flex-1 flex-col justify-end" title={d.hint}>
            <div className="rounded-t-sm bg-blue-600 group-hover:bg-blue-700" style={{ height: d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : "0" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

type Point = { day: Date; median: number; low: number; high: number; count: number };

/** Линия средней цены по дням и коридор «обычно продают за». Деньги — в копейках. */
export function PriceLine({ points, format }: { points: Point[]; format: (kop: number) => string }) {
  if (points.length < 2) return <p className="text-sm text-slate-500">График появится, когда наберётся хотя бы 2 дня наблюдений.</p>;
  const W = 600,
    H = 200,
    P = 8;
  const lo = Math.min(...points.map((p) => p.low));
  const hi = Math.max(...points.map((p) => p.high));
  const span = hi - lo || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.median).toFixed(1)}`).join(" ");
  const band =
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.high).toFixed(1)}`).join(" ") +
    " " +
    [...points]
      .reverse()
      .map((p, j) => `L${x(points.length - 1 - j).toFixed(1)},${y(p.low).toFixed(1)}`)
      .join(" ") +
    " Z";
  const d = (p: Point) => p.day.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full text-blue-600" preserveAspectRatio="none" role="img" aria-label="График цены">
        <path d={band} fill="currentColor" opacity={0.12} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.median)} r={4} fill="currentColor" vectorEffect="non-scaling-stroke">
            <title>{`${d(p)}: ~${format(p.median)} (обычно ${format(p.low)} – ${format(p.high)}, ${p.count} объявл.)`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{d(points[0])}</span>
        <span>
          от {format(lo)} до {format(hi)}
        </span>
        <span>{d(points[points.length - 1])}</span>
      </div>
    </div>
  );
}
