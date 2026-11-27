import Link from "next/link";
import type { ListingStatus, Prisma } from "@prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { btn, Card, dt, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { SOURCE_KIND_LABEL } from "@/lib/domain/buyback";
import { BuybackTabs } from "./tabs";
import { addManualAction, takeAction } from "./actions";

const VIEWS = {
  new: { label: "Новые", where: { status: "NEW" } },
  mine: { label: "Мои в работе", where: { status: "IN_WORK" } },
  work: { label: "Все в работе", where: { status: "IN_WORK" } },
  bought: { label: "Выкуплено", where: { status: "BOUGHT" } },
  rejected: { label: "Отказ", where: { status: "REJECTED" } },
} satisfies Record<string, { label: string; where: { status: ListingStatus } }>;
type View = keyof typeof VIEWS;

export default async function BuybackPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("buyback");
  const view: View = sp.v && sp.v in VIEWS ? (sp.v as View) : "new";
  const where: Prisma.ListingWhereInput = { ...VIEWS[view].where };
  if (view === "mine") where.assigneeId = ctx.user.id;
  if (sp.q?.trim()) where.OR = [{ title: { contains: sp.q.trim(), mode: "insensitive" } }, { text: { contains: sp.q.trim(), mode: "insensitive" } }];

  const [listings, counts, mine] = await Promise.all([
    ctx.db.listing.findMany({
      where,
      include: { source: true, assignee: true },
      orderBy: view === "bought" ? { boughtAt: "desc" } : [{ postedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 100,
    }),
    ctx.db.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    ctx.db.listing.count({ where: { status: "IN_WORK", assigneeId: ctx.user.id } }),
  ]);
  const count = (s: ListingStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const viewCount: Record<View, number> = { new: count("NEW"), mine, work: count("IN_WORK"), bought: count("BOUGHT"), rejected: count("REJECTED") };
  const admin = can(ctx.user, "buybackSources");

  return (
    <>
      <PageHeader title="Скупка техники">
        <form className="flex gap-2">
          <input type="hidden" name="v" value={view} />
          <Input name="q" defaultValue={sp.q} placeholder="Поиск: iphone 13, s23…" className="w-56" />
          <button className={btn("secondary")}>Найти</button>
        </form>
      </PageHeader>
      <BuybackTabs admin={admin} />
      <div className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/buyback?v=${v}`}
            className={`rounded-full border px-3 py-1 text-sm ${v === view ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {VIEWS[v].label} <span className="opacity-70">{viewCount[v]}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {listings.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {view === "new" ? (
                <>
                  Новых объявлений пока нет.{" "}
                  {admin ? (
                    <Link href="/buyback/sources" className="text-blue-600 hover:underline">
                      Добавьте группы ВК и Telegram-каналы
                    </Link>
                  ) : (
                    "Попросите администратора добавить источники"
                  )}{" "}
                  или внесите объявление вручную справа.
                </>
              ) : (
                "Здесь пока пусто"
              )}
            </div>
          )}
          {listings.map((l) => (
            <div key={l.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
              {l.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/buyback/${l.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {l.title}
                  </Link>
                  <span className="whitespace-nowrap font-semibold text-slate-900">{l.price ? rub(l.price) : "цена не указана"}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{l.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{l.source ? `${SOURCE_KIND_LABEL[l.source.kind]} · ${l.source.name}` : "Добавлено вручную"}</span>
                  <span>{dt(l.postedAt ?? l.createdAt)}</span>
                  {l.assignee && <span className="text-blue-700">👤 {l.assignee.name}</span>}
                  {l.status === "BOUGHT" && <span className="text-green-700">выкуплено за {rub(l.buyPrice)}</span>}
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Открыть объявление ↗
                  </a>
                </div>
              </div>
              {l.status === "NEW" && (
                <Form action={takeAction} className="shrink-0 self-center" resetOnOk={false}>
                  <input type="hidden" name="id" value={l.id} />
                  <Submit>Беру</Submit>
                </Form>
              )}
              {l.status === "IN_WORK" && l.assigneeId === ctx.user.id && (
                <Link href={`/buyback/${l.id}`} className={`${btn("primary")} shrink-0 self-center`}>
                  Выкупил?
                </Link>
              )}
            </div>
          ))}
        </div>
        <Card title="Нашли объявление сами?">
          <Form action={addManualAction} className="space-y-3">
            <Field label="Ссылка на объявление *">
              <Input name="url" required placeholder="https://www.avito.ru/…" />
            </Field>
            <Field label="Что продают">
              <Input name="title" placeholder="iPhone 13 128 ГБ" />
            </Field>
            <Field label="Цена в объявлении, ₽">
              <Input name="price" inputMode="decimal" />
            </Field>
            <Field label="Описание">
              <Textarea name="text" rows={2} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="take" value="1" defaultChecked /> Сразу взять в работу
            </label>
            <Submit>Добавить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
