import type { ApprovalStatus } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, dt, PageHeader, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { APPROVAL_COLOR, APPROVAL_LABEL, APPROVAL_ORDER } from "@/lib/platform/approval";
import { setApprovalAction } from "../actions";
import { PlatformTabs } from "../tabs";

export const dynamic = "force-dynamic";

type SP = { s?: string };

/** Заявки партнёров: подтвердить, отказать, вести статус и заметки. */
export default async function PlatformRequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { admin } = await requirePlatformAdmin();
  const sp = await searchParams;
  const filter = sp.s === "all" ? undefined : sp.s && (APPROVAL_ORDER as string[]).includes(sp.s) ? (sp.s as ApprovalStatus) : "open";
  const where =
    filter === "open"
      ? { approval: { in: ["PENDING", "TALKING", "AWAITING_PAYMENT"] as ApprovalStatus[] } }
      : filter
        ? { approval: filter }
        : {};
  const [list, counts] = await Promise.all([
    prisma.company.findMany({
      where: { ...where, id: { not: admin.companyId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true, phone: true, telegram: true } } },
    }),
    prisma.company.groupBy({ by: ["approval"], where: { id: { not: admin.companyId } }, _count: { _all: true } }),
  ]);
  const consents = await prisma.consentLog.findMany({ where: { companyId: { in: list.map((c) => c.id) } }, orderBy: { at: "asc" } });
  const consentOf = new Map(consents.map((c) => [c.companyId, c]));
  const cnt = new Map(counts.map((c) => [c.approval, c._count._all]));
  const openCount = (cnt.get("PENDING") ?? 0) + (cnt.get("TALKING") ?? 0) + (cnt.get("AWAITING_PAYMENT") ?? 0);
  const chip = (s: string, label: string, n: number) => (
    <a
      key={s}
      href={`/platform/requests?s=${s}`}
      className={`rounded-full border px-3 py-1 text-sm ${(sp.s ?? "open") === s ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
    >
      {label} <span className="text-slate-400">{n}</span>
    </a>
  );

  return (
    <>
      <PageHeader title="Платформа" />
      <PlatformTabs />
      <div className="mb-4 flex flex-wrap gap-2">
        {chip("open", "Ждут решения", openCount)}
        {APPROVAL_ORDER.map((s) => chip(s, APPROVAL_LABEL[s], cnt.get(s) ?? 0))}
        {chip("all", "Все", [...cnt.values()].reduce((a, b) => a + b, 0))}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Доступ к CRM открыт только у заявок со статусом «Одобрена» или «Оплачено». Остальные видят экран «Заявка на рассмотрении».
      </p>
      <div className="space-y-3">
        {list.map((c) => {
          const o = c.users[0];
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge color={APPROVAL_COLOR[c.approval]}>{APPROVAL_LABEL[c.approval]}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {o?.name} · {o?.email}
                    {(o?.phone || c.phone) && <> · {o?.phone || c.phone}</>}
                    {o?.telegram && <> · Telegram: {o.telegram}</>}
                  </div>
                  <div className="text-xs text-slate-400">
                    Заявка от {dt(c.createdAt)}
                    {c.approvalAt && <> · статус изменён {dt(c.approvalAt)}</>}
                    {consentOf.get(c.id) ? (
                      <> · документы приняты {dt(consentOf.get(c.id)!.at)} (редакция {consentOf.get(c.id)!.version}, IP {consentOf.get(c.id)!.ip ?? "—"})</>
                    ) : (
                      <> · согласие с документами не записано</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.approval !== "APPROVED" && (
                    <Form action={setApprovalAction} resetOnOk={false}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="APPROVED" />
                      <Submit variant="success">Подтвердить</Submit>
                    </Form>
                  )}
                  {c.approval !== "REJECTED" && (
                    <Form action={setApprovalAction} resetOnOk={false}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="REJECTED" />
                      <Submit variant="danger">Отказать</Submit>
                    </Form>
                  )}
                </div>
              </div>
              <Form action={setApprovalAction} className="grid gap-2 md:grid-cols-[200px_1fr_auto] md:items-start" resetOnOk={false}>
                <input type="hidden" name="id" value={c.id} />
                <Select name="status" defaultValue={c.approval}>
                  {APPROVAL_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {APPROVAL_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Textarea name="note" rows={2} defaultValue={c.approvalNote ?? ""} placeholder="Заметки: о чём договорились, сумма, когда перезвонить" />
                <Submit variant="secondary">Сохранить</Submit>
              </Form>
            </div>
          );
        })}
        {!list.length && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Заявок нет</p>}
      </div>
    </>
  );
}
