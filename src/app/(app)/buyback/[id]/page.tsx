import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { Badge, Card, dt, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput, rub } from "@/lib/money";
import { PAY_LABEL } from "@/lib/domain/cash";
import { LISTING_STATUS_LABEL, SOURCE_KIND_LABEL } from "@/lib/domain/buyback";
import { buyAction, rejectAction, releaseAction, takeAction } from "../actions";

const STATUS_COLOR = { NEW: "#2563eb", IN_WORK: "#d97706", BOUGHT: "#16a34a", REJECTED: "#64748b" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const l = await ctx.db.listing.findUnique({ where: { id }, include: { source: true, assignee: true, product: true } });
  if (!l) notFound();
  const admin = can(ctx.user.role, "buybackSources");
  const mine = l.status === "IN_WORK" && l.assigneeId === ctx.user.id;
  const canAct = mine || (admin && l.status !== "BOUGHT");

  return (
    <>
      <PageHeader title={l.title} back="/buyback">
        <Badge color={STATUS_COLOR[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Объявление" className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            {l.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.photoUrl} alt="" className="max-h-64 rounded-md object-contain sm:w-64" referrerPolicy="no-referrer" />
            )}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div className="text-lg font-semibold">{l.price ? rub(l.price) : "Цена не указана"}</div>
              <p className="whitespace-pre-wrap text-slate-700">{l.text || "Без описания"}</p>
              <div className="text-xs text-slate-500">
                {l.source ? `${SOURCE_KIND_LABEL[l.source.kind]} · ${l.source.name}` : "Добавлено вручную"} · {dt(l.postedAt ?? l.createdAt)}
              </div>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-block text-blue-600 hover:underline">
                Открыть объявление и написать продавцу ↗
              </a>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {l.status === "NEW" && (
            <Card title="Свободно">
              <p className="mb-3 text-sm text-slate-600">Возьмите объявление, чтобы другие сотрудники не звонили этому продавцу.</p>
              <Form action={takeAction} resetOnOk={false}>
                <input type="hidden" name="id" value={l.id} />
                <Submit>Беру в работу</Submit>
              </Form>
            </Card>
          )}

          {l.status !== "NEW" && l.assignee && (
            <Card title="Сотрудник">
              <p className="text-sm">
                {l.assignee.name}
                {l.takenAt && <span className="text-slate-500"> · взял {dt(l.takenAt)}</span>}
              </p>
              {l.status === "REJECTED" && l.rejectReason && <p className="mt-1 text-sm text-slate-500">Причина отказа: {l.rejectReason}</p>}
            </Card>
          )}

          {l.status === "BOUGHT" && (
            <Card title="Выкуплено">
              <p className="text-sm">
                {dt(l.boughtAt)} за <b>{rub(l.buyPrice)}</b>
              </p>
              {l.product && (
                <Link href={`/stock/${l.product.id}`} className="mt-2 inline-block text-sm text-blue-600 hover:underline">
                  На складе: {l.product.name}
                </Link>
              )}
            </Card>
          )}

          {canAct && (
            <Card title="Выкупил">
              <Form action={buyAction} className="space-y-3" resetOnOk={false}>
                <input type="hidden" name="id" value={l.id} />
                <Field label="За сколько выкупили, ₽ *">
                  <Input name="buyPrice" inputMode="decimal" required defaultValue={kopToInput(l.price)} />
                </Field>
                <Field label="Название для склада *">
                  <Input name="productName" required defaultValue={l.title.slice(0, 80)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Продавать за, ₽">
                    <Input name="salePrice" inputMode="decimal" />
                  </Field>
                  <Field label="Оплата">
                    <Select name="method" defaultValue="CASH">
                      {Object.entries(PAY_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <p className="text-xs text-slate-500">Техника встанет на склад точки «{ctx.location?.name}», сумма уйдёт расходом из кассы.</p>
                <Submit>Записать выкуп</Submit>
              </Form>
            </Card>
          )}

          {canAct && (
            <Card title="Не получилось">
              <Form action={rejectAction} className="space-y-2" resetOnOk={false}>
                <input type="hidden" name="id" value={l.id} />
                <Input name="reason" placeholder="Причина: дорого, продали, не отвечает…" />
                <Submit variant="secondary">Не подошло</Submit>
              </Form>
              {l.status !== "NEW" && (
                <Form action={releaseAction} className="mt-2" resetOnOk={false}>
                  <input type="hidden" name="id" value={l.id} />
                  <Submit variant="secondary">Вернуть в общую ленту</Submit>
                </Form>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
