// Разбор текста объявлений: поиск по ключевым словам, цена, заголовок.

export const normalize = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** "iphone, айфон ,  samsung" → ["iphone", "айфон", "samsung"] */
export function splitWords(csv: string): string[] {
  return csv
    .split(/[,;\n]/)
    .map((w) => normalize(w.trim()))
    .filter(Boolean);
}

/** Подходит ли пост: есть хотя бы одно ключевое слово (если они заданы) и нет стоп-слов. */
export function matchesQuery(text: string, keywords: string, stopWords: string): boolean {
  const t = normalize(text);
  const stop = splitWords(stopWords);
  if (stop.some((w) => t.includes(w))) return false;
  const keys = splitWords(keywords);
  return keys.length === 0 || keys.some((w) => t.includes(w));
}

const MIN_RUB = 300;
const MAX_RUB = 1_000_000;
const toNum = (s: string) => Number(s.replace(/[\s .]/g, "").replace(",", "."));
const inRange = (rub: number) => Number.isFinite(rub) && rub >= MIN_RUB && rub <= MAX_RUB;

/** Цена из текста объявления в копейках: «15 000 р», «15000₽», «15к», «цена: 15000». */
export function extractPrice(text: string): number | null {
  const t = text.replace(/ /g, " ");
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/(\d{1,3}(?:[ .]\d{3})+|\d{3,7})\s*(?:₽|руб|р(?![а-яё])|rub)/i, (m) => toNum(m[1])],
    [/цен[аы][^\d\n]{0,12}(\d{1,3}(?:[ .]\d{3})+|\d{3,7})/i, (m) => toNum(m[1])],
    [/(\d{1,3}(?:[.,]\d)?)\s*(?:к|k|тыс)(?![а-яa-z])/i, (m) => Math.round(toNum(m[1]) * 1000)],
  ];
  for (const [re, conv] of patterns) {
    const m = t.match(re);
    if (m) {
      const rub = conv(m);
      if (inRange(rub)) return rub * 100;
    }
  }
  return null;
}

/** Первая непустая строка, не длиннее 100 символов. */
export function makeTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "Без текста";
  return line.length > 100 ? line.slice(0, 97) + "…" : line;
}

/** Найденное объявление, общий вид для всех источников. */
export type FoundPost = { url: string; text: string; postedAt: Date | null; photoUrl: string | null };
