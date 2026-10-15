// Деньги в базе хранятся в копейках.
export function toKop(input: FormDataEntryValue | string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  const s = String(input).replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("Некорректная сумма");
  return Math.round(n * 100);
}

export function rub(kop: number | null | undefined): string {
  const v = (kop ?? 0) / 100;
  return v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " ₽";
}

export function kopToInput(kop: number | null | undefined): string {
  if (kop === null || kop === undefined) return "";
  return String(kop / 100);
}
