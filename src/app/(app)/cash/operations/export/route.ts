import { requirePermission } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { placesFor } from "@/lib/domain/places";
import { findTxs, type TxFilter } from "@/lib/domain/cash-list";

const PAY = { CASH: "Наличными", CARD: "Картой", TRANSFER: "Безналом" } as const;

/** Выгрузка транзакций с теми же фильтрами, что на экране. */
export async function GET(req: Request) {
  const ctx = await requirePermission("cash");
  const { cashboxes } = await placesFor({ db: ctx.db, companyId: ctx.company.id }, ctx.user.locationId ? ctx.location?.id : null, ctx.user);
  const f = Object.fromEntries(new URL(req.url).searchParams) as TxFilter;
  const { rows } = await findTxs(ctx.db, cashboxes.map((c) => c.id), f, 20000);
  const csv = toCsv(
    ["Документ", "Дата", "Сумма", "Оплата", "Статья", "Касса", "Остаток", "Сотрудник", "Получатель", "Примечание", "Дата события", "Статус"],
    rows.map((x) => [
      x.doc?.label ?? "",
      x.createdAt.toLocaleString("ru-RU"),
      x.shown / 100,
      PAY[x.method],
      x.category,
      x.cashbox.name,
      x.balance == null ? "" : x.balance / 100,
      x.user?.name ?? "",
      x.recipient?.label ?? "",
      x.comment ?? "",
      x.eventDate ? x.eventDate.toLocaleDateString("ru-RU") : "",
      x.deletedAt ? "удалена" : x.editedAt ? "изменена" : "",
    ]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
