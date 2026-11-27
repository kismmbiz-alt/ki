import { can, requireUser } from "@/lib/auth";
import { totals } from "@/lib/domain/orders";
import { hiddenStatusIds, orderWhere, type OrderFilter } from "@/lib/domain/order-filter";
import { toCsv } from "@/lib/csv";

/** Выгрузка списка заказов в CSV, который открывается в Excel. */
export async function GET(req: Request) {
  const { db, user, location } = await requireUser();
  const sp = Object.fromEntries(new URL(req.url).searchParams) as OrderFilter;
  const where = orderWhere(sp, { locationId: location?.id, onlyMasterId: can(user, "allOrders") ? undefined : user.id, hideStatusIds: await hiddenStatusIds(db, user) });
  const list = await db.order.findMany({
    where,
    include: { client: true, status: true, master: true, manager: true, items: true, payments: { select: { amount: true } } },
    orderBy: { number: "desc" },
    take: 20000,
  });
  const d = (x: Date | null) => (x ? x.toLocaleString("ru-RU") : "");
  const rows = list.map((o) => {
    const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0), o);
    return [
      o.number,
      d(o.createdAt),
      o.status.name,
      o.orderType,
      o.client.name,
      o.client.phone,
      o.deviceType,
      o.brand ?? "",
      o.model ?? "",
      o.color ?? "",
      o.serial ?? "",
      o.problem,
      o.manager?.name ?? "",
      o.master?.name ?? "",
      d(o.dueDate),
      t.total / 100,
      t.paid / 100,
      t.due / 100,
      d(o.closedAt),
    ];
  });
  const csv = toCsv(
    ["№", "Принят", "Статус", "Тип заказа", "Клиент", "Телефон", "Тип устройства", "Марка", "Модель", "Цвет", "Серийный номер", "Неисправность", "Менеджер", "Мастер", "Крайний срок", "Сумма", "Оплачено", "Долг", "Выдан"],
    rows,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
