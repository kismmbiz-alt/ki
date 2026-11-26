// Запускается один раз при старте сервера Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.COLLECTOR === "off" || process.env.NODE_ENV === "test") return;
  const { startCollector } = await import("./lib/collectors");
  startCollector();
}
