import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Проверка для внешних сервисов мониторинга: 200 — всё работает, 503 — база не отвечает. */
export async function GET() {
  const t = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, dbMs: Date.now() - t });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
