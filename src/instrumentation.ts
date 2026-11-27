// Запускается один раз при старте сервера Next.js.
export async function register() {
  // Часовой пояс мастерской: все даты показываются и вводятся в нём.
  // По умолчанию Екатеринбургское время (UTC+5, Башкортостан); поменять можно переменной TZ в .env.
  if (!process.env.TZ) process.env.TZ = "Asia/Yekaterinburg";
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE === "phase-production-build") return;
  // Панель владельца платформы: проверка сайта раз в минуту
  if (process.env.MONITOR !== "off") {
    const { startMonitor } = await import("./lib/platform/monitor");
    startMonitor();
  }
  if (process.env.COLLECTOR === "off") return;
  const { startCollector } = await import("./lib/collectors");
  startCollector();
}

// Любая ошибка сервера попадает в панель владельца платформы.
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType?: string; routePath?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err as Error & { digest?: string };
  // redirect() и notFound() — не ошибки
  if (typeof e?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(e.digest)) return;
  const { recordEvent } = await import("./lib/platform/monitor");
  await recordEvent(
    "error",
    e?.message || String(err),
    `${request.method} ${request.path}`,
    [
      context.routeType && `тип: ${context.routeType}`,
      context.routePath && `маршрут: ${context.routePath}`,
      e?.digest && `код: ${e.digest}`,
      e?.stack,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
