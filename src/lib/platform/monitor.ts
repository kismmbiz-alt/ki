import { prisma } from "../db";

const EVERY_MS = 60_000;
const KEEP_DAYS = 30;

const g = globalThis as unknown as { __crmMonitor?: NodeJS.Timeout };

/** Записать событие платформы (ошибку или запуск). Никогда не бросает исключений. */
export async function recordEvent(kind: "error" | "start", message: string, path?: string | null, detail?: string | null) {
  try {
    await prisma.platformEvent.create({
      data: {
        kind,
        message: message.slice(0, 1000),
        path: path?.slice(0, 500) ?? null,
        detail: detail?.slice(0, 4000) ?? null,
      },
    });
  } catch {
    // база недоступна — запись пропускаем
  }
}

/** Одна проверка: отвечает ли сайт и база, и за сколько. */
export async function sampleOnce(baseUrl: string) {
  let dbMs: number | null = null;
  let error: string | null = null;
  let ok = true;
  try {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbMs = Date.now() - t;
  } catch (e) {
    ok = false;
    error = "База данных не отвечает: " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  const t1 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/login`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      ok = false;
      error ??= `Сайт ответил с ошибкой ${res.status}`;
    }
  } catch (e) {
    ok = false;
    error ??= "Сайт не отвечает: " + (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  const ms = Date.now() - t1;
  try {
    await prisma.healthSample.create({ data: { ok, ms, dbMs, error } });
  } catch {
    // нет базы — нечего записывать
  }
  return { ok, ms, dbMs, error };
}

/** Запуск фоновой проверки раз в минуту и очистки старых записей. */
export function startMonitor() {
  if (g.__crmMonitor) return;
  const base = process.env.MONITOR_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  void recordEvent("start", "Приложение запущено", null, `node ${process.version}`);
  let n = 0;
  g.__crmMonitor = setInterval(async () => {
    await sampleOnce(base);
    if (n++ % 60 === 0) {
      const old = new Date(Date.now() - KEEP_DAYS * 864e5);
      await prisma.healthSample.deleteMany({ where: { at: { lt: old } } }).catch(() => {});
      await prisma.platformEvent.deleteMany({ where: { at: { lt: old } } }).catch(() => {});
    }
  }, EVERY_MS);
  g.__crmMonitor.unref?.();
}
