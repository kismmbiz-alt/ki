import { unstable_rethrow } from "next/navigation";

export type ActionState = { error?: string; ok?: string } | undefined;

/** Оборачивает server action: ошибки превращаются в текст для формы, redirect пробрасывается. */
export function safe(fn: (fd: FormData) => Promise<void | string>) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    try {
      const ok = await fn(fd);
      return ok ? { ok } : {};
    } catch (e) {
      unstable_rethrow(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/Unique constraint/i.test(msg)) return { error: "Такая запись уже существует" };
      if (/Foreign key|No record|not found|Record to update/i.test(msg)) return { error: "Запись не найдена или недоступна" };
      return { error: msg.length > 300 ? "Ошибка сохранения" : msg };
    }
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const int = (fd: FormData, k: string, def = 0) => {
  const v = str(fd, k);
  if (!v) return def;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error("Некорректное число");
  return n;
};
