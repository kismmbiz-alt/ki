import type { StockDocType } from "@prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { DOC_LABEL } from "@/lib/domain/stock";
import { findDocs } from "@/lib/domain/stock-docs";

/** Выгрузка списка складских документов с теми же фильтрами, что на экране. */
export async function GET(req: Request) {
  const { db, location, user } = await requirePermission("stock");
  const u = new URL(req.url).searchParams;
  const types = (u.get("types") ?? "").split(",").filter((t): t is StockDocType => t in DOC_LABEL);
  const docs = await findDocs(db, types, location?.id, { q: u.get("q") ?? "", from: u.get("from") ?? "", to: u.get("to") ?? "", wh: u.get("wh") ?? "" }, 5000);
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const showCost = can(user, "cost");
  const k = (v: number) => v / 100;
  const csv = toCsv(
    ["№", "Дата", "Документ", "Склад", "Поставщик / клиент / куда", "Вход. документ", "Позиций", ...(showCost ? ["Сумма", "Оплачено"] : []), "Комментарий", "Кто"],
    docs.map((d) => [
      d.number,
      d.createdAt.toLocaleString("ru-RU"),
      DOC_LABEL[d.type],
      d.warehouse.name,
      d.supplier?.name ?? d.client?.name ?? d.toWarehouse?.name ?? "",
      d.inDocNo ?? "",
      d._count.items,
      ...(showCost ? [k(d.total), k(d.paid)] : []),
      d.comment ?? "",
      d.userId ? (users.get(d.userId) ?? "") : "",
    ]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="docs-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
