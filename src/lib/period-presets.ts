// Быстрые периоды для выбора дат (общие для сервера и браузера).

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null);
export const ru = (s?: string | null) => (s ? s.split("-").reverse().join(".") : "");

export type Preset = { key: string; label: string; range: () => [Date, Date] };

/** Быстрые периоды. Неделя начинается с понедельника. */
export function presets(now = new Date()): Preset[] {
  const d = (y: number, m: number, day: number) => new Date(y, m, day);
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = d(y, m, now.getDate());
  const add = (x: Date, n: number) => d(x.getFullYear(), x.getMonth(), x.getDate() + n);
  const monday = add(today, -((today.getDay() + 6) % 7));
  return [
    { key: "today", label: "Сегодня", range: () => [today, today] },
    { key: "yesterday", label: "Вчера", range: () => [add(today, -1), add(today, -1)] },
    { key: "7days", label: "7 дней", range: () => [add(today, -6), today] },
    { key: "30days", label: "30 дней", range: () => [add(today, -29), today] },
    { key: "thisWeek", label: "Эта неделя", range: () => [monday, add(monday, 6)] },
    { key: "lastWeek", label: "Прошлая неделя", range: () => [add(monday, -7), add(monday, -1)] },
    { key: "thisMonth", label: "Этот месяц", range: () => [d(y, m, 1), d(y, m + 1, 0)] },
    { key: "lastMonth", label: "Прошлый месяц", range: () => [d(y, m - 1, 1), d(y, m, 0)] },
    { key: "thisYear", label: "Этот год", range: () => [d(y, 0, 1), d(y, 11, 31)] },
    { key: "lastYear", label: "Прошлый год", range: () => [d(y - 1, 0, 1), d(y - 1, 11, 31)] },
  ];
}

/** Название периода для подписи: «Прошлый месяц» или «01.10.2026 – 31.10.2026». */
export function periodLabel(from?: string | null, to?: string | null, now = new Date()) {
  const p = presets(now).find((x) => {
    const [a, b] = x.range();
    return iso(a) === from && iso(b) === to;
  });
  if (p) return p.label;
  if (from && to) return from === to ? ru(from) : `${ru(from)} – ${ru(to)}`;
  if (from) return `с ${ru(from)}`;
  if (to) return `по ${ru(to)}`;
  return "";
}

