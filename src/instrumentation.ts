// Запускается один раз при старте сервера Next.js.
export async function register() {
  // Часовой пояс мастерской: все даты показываются и вводятся в нём.
  // По умолчанию Екатеринбургское время (UTC+5, Башкортостан); поменять можно переменной TZ в .env.
  if (!process.env.TZ) process.env.TZ = "Asia/Yekaterinburg";
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.COLLECTOR === "off" || process.env.NODE_ENV === "test") return;
  const { startCollector } = await import("./lib/collectors");
  startCollector();
}
