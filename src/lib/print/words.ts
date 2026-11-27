// Сумма прописью: 1234.50 → «Одна тысяча двести тридцать четыре рубля 50 копеек».

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function triad(n: number, female: boolean) {
  const out: string[] = [];
  out.push(HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    out.push(TENS[Math.floor(r / 10)]);
    out.push((female ? ONES_F : ONES_M)[r % 10]);
  }
  return out.filter(Boolean).join(" ");
}

export function numberWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "ноль";
  const parts: string[] = [];
  const groups: [number, boolean, [string, string, string] | null][] = [
    [Math.floor(n / 1e9) % 1000, false, ["миллиард", "миллиарда", "миллиардов"]],
    [Math.floor(n / 1e6) % 1000, false, ["миллион", "миллиона", "миллионов"]],
    [Math.floor(n / 1e3) % 1000, true, ["тысяча", "тысячи", "тысяч"]],
    [n % 1000, false, null],
  ];
  for (const [g, female, names] of groups) {
    if (!g) continue;
    parts.push(triad(g, female));
    if (names) parts.push(plural(g, ...names));
  }
  return parts.join(" ");
}

export function rubWords(kop: number) {
  const sign = kop < 0 ? "минус " : "";
  const rub = Math.floor(Math.abs(kop) / 100);
  const k = Math.abs(kop) % 100;
  const s = `${sign}${numberWords(rub)} ${plural(rub, "рубль", "рубля", "рублей")} ${String(k).padStart(2, "0")} ${plural(k, "копейка", "копейки", "копеек")}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
