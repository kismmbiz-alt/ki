import { can, requireUser } from "@/lib/auth";

/** Отдаёт файл заказа только сотрудникам этой же компании. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await requireUser();
  const f = await db.orderFile.findUnique({ where: { id }, include: { order: { select: { masterId: true } } } });
  if (!f || (!can(user, "allOrders") && f.order.masterId !== user.id)) return new Response("Не найдено", { status: 404 });
  const inline = /^(image\/(png|jpeg|webp|gif|heic|heif)|application\/pdf)$/.test(f.mime);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
