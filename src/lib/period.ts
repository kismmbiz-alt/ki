/** Разбор периода из адресной строки: from/to в формате ГГГГ-ММ-ДД, по умолчанию — текущий месяц. */
export function parseRange(sp: { from?: string; to?: string }, def: "today" | "month" = "month") {
  const now = new Date();
  const iso = (d: Date) => d.toLocaleDateString("sv-SE");
  const fromS = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : def === "today" ? iso(now) : iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const toS = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : iso(now);
  const from = new Date(fromS + "T00:00:00");
  const to = new Date(new Date(toS + "T00:00:00").getTime() + 864e5);
  return { fromS, toS, from, to };
}
