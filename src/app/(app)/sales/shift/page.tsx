import Link from "next/link";
import { defaultCashboxId, placesFor } from "@/lib/domain/places";
import { requireLocation, requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput, rub } from "@/lib/money";
import { cashOnHand, currentShift, shiftSummary } from "@/lib/domain/sales";
import { closeShiftAction, openShiftAction } from "../actions";
import { SalesTabs } from "../_tabs";

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const t = { db: ctx.db, companyId: ctx.company.id };
  const { cashboxes } = await placesFor(t, loc.id, ctx.user);
  const defId = await defaultCashboxId(ctx.db, loc.id);
  const box = cashboxes.find((c) => c.id === sp.c) ?? cashboxes.find((c) => c.id === defId) ?? cashboxes[0];
  const place = { locationId: loc.id, cashboxId: box?.id };
  const [shift, cash, history] = await Promise.all([
    currentShift(t, place),
    cashOnHand(t, place),
    ctx.db.cashShift.findMany({ where: { cashboxId: box?.id, closedAt: { not: null } }, orderBy: { openedAt: "desc" }, take: 30 }),
  ]);
  const sum = shift ? await shiftSummary(t, { cashboxId: box?.id }, shift.openedAt, new Date(Date.now() + 1000)) : null;
  const names = new Map((await ctx.db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const rowsOf = (label: string, x: { CASH: number; CARD: number; TRANSFER: number; total: number }) => (
    <tr key={label}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right">{rub(x.CASH)}</td>
      <td className="px-3 py-2 text-right">{rub(x.CARD)}</td>
      <td className="px-3 py-2 text-right">{rub(x.TRANSFER)}</td>
      <td className="px-3 py-2 text-right font-medium">{rub(x.total)}</td>
    </tr>
  );

  return (
    <>
      <PageHeader title={`Смена · ${box?.name ?? loc.name}`} />
      <SalesTabs />
      {cashboxes.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Касса:</span>
          {cashboxes.map((c) => (
            <Link key={c.id} href={`/sales/shift?c=${c.id}`} className={`rounded-md px-3 py-1.5 ${c.id === box?.id ? "bg-blue-600 on-accent" : "text-slate-600 hover:bg-slate-100"}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}
      {!shift ? (
        <Card title="Смена закрыта">
          <p className="mb-3 text-sm text-slate-600">Наличных в кассе по учёту: {rub(cash)}</p>
          <Form action={openShiftAction} resetOnOk={false}>
            <input type="hidden" name="cashboxId" value={box?.id ?? ""} />
            <Submit variant="success">Открыть смену</Submit>
          </Form>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            <div className="text-sm text-slate-500">
              Открыта {dt(shift.openedAt)} ({names.get(shift.openedById ?? "") ?? "—"}), наличных на начало {rub(shift.openCash)}
            </div>
            <Table head={["", "Наличные", "Карта", "Перевод", "Всего"]}>
              {sum && [rowsOf("Продажи", sum.sales), rowsOf("Возвраты", sum.returns), rowsOf("Оплаты заказов", sum.orders), rowsOf("Прочие приходы и расходы", sum.other), rowsOf("Итого за смену", sum.all)]}
            </Table>
          </div>
          <Card title="Закрыть смену">
            <Form action={closeShiftAction} className="space-y-3" resetOnOk={false}>
              <input type="hidden" name="cashboxId" value={box?.id ?? ""} />
              <div className="text-sm text-slate-600">
                Наличных должно быть: <b>{rub(cash)}</b>
              </div>
              <Field label="Пересчитали фактически, ₽ *">
                <Input name="closeCash" inputMode="decimal" defaultValue={kopToInput(cash)} required />
              </Field>
              <Input name="comment" placeholder="Комментарий" />
              <Submit>Закрыть смену</Submit>
            </Form>
          </Card>
        </div>
      )}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Прошлые смены</h2>
      <Table head={["Открыта", "Закрыта", "Кто закрыл", "На начало", "По учёту", "Факт", "Расхождение"]} empty="Закрытых смен пока нет">
        {history.map((h) => {
          const diff = (h.closeCash ?? 0) - (h.expectedCash ?? 0);
          return (
            <tr key={h.id}>
              <td className="px-3 py-2 text-slate-500">{dt(h.openedAt)}</td>
              <td className="px-3 py-2 text-slate-500">{dt(h.closedAt)}</td>
              <td className="px-3 py-2">{names.get(h.closedById ?? "") ?? "—"}</td>
              <td className="px-3 py-2">{rub(h.openCash)}</td>
              <td className="px-3 py-2">{rub(h.expectedCash)}</td>
              <td className="px-3 py-2">{rub(h.closeCash)}</td>
              <td className={`px-3 py-2 font-medium ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-600" : "text-slate-400"}`}>{diff ? rub(diff) : "—"}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
