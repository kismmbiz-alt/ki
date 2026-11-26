import Link from "next/link";
import { X } from "lucide-react";
import type { DictKind } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { Card, PageHeader, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { DICT_KINDS, DICT_LABEL, ensureDictionaries } from "@/lib/domain/dict";
import { addDictAction, deleteDictAction } from "../actions";

const HINT: Partial<Record<DictKind, string>> = {
  ORDER_TYPE: "Платный, гарантийный, повторный… Используется в фильтрах и отчётах.",
  MODEL: "Модели запоминаются сами, когда вы принимаете заказ.",
  DEFECT: "Типовые неисправности: выбираются при приёмке одним кликом.",
};

export default async function DictsPage({ searchParams }: { searchParams: Promise<{ k?: string; q?: string }> }) {
  const sp = await searchParams;
  const { db, company } = await requirePermission("settings");
  await ensureDictionaries({ db, companyId: company.id });
  const kind = (DICT_KINDS.includes(sp.k as DictKind) ? sp.k : "DEFECT") as DictKind;
  const [counts, items] = await Promise.all([
    db.dictItem.groupBy({ by: ["kind"], _count: true }),
    db.dictItem.findMany({
      where: { kind, ...(sp.q ? { value: { contains: sp.q, mode: "insensitive" } } : {}) },
      orderBy: [{ sort: "asc" }, { value: "asc" }],
      take: 1000,
    }),
  ]);
  const count = new Map(counts.map((c) => [c.kind, c._count]));

  return (
    <>
      <PageHeader title="Справочники" />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {DICT_KINDS.map((k) => (
            <Link
              key={k}
              href={`/settings/dicts?k=${k}`}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${k === kind ? "bg-blue-600 on-accent" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {DICT_LABEL[k]}
              <span className="ml-3 text-xs opacity-70">{count.get(k) ?? 0}</span>
            </Link>
          ))}
        </nav>
        <Card title={DICT_LABEL[kind]}>
          {HINT[kind] && <p className="mb-3 text-sm text-slate-500">{HINT[kind]}</p>}
          <form className="mb-3">
            <input type="hidden" name="k" value={kind} />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Поиск…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 sm:w-72"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            {items.map((i) => (
              <Form key={i.id} action={deleteDictAction} resetOnOk={false}>
                <input type="hidden" name="id" value={i.id} />
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 text-sm text-slate-800">
                  {i.value}
                  <button className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Удалить ${i.value}`}>
                    <X size={14} />
                  </button>
                </span>
              </Form>
            ))}
            {!items.length && <p className="text-sm text-slate-400">Пусто</p>}
          </div>
          <Form action={addDictAction} className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <input type="hidden" name="kind" value={kind} />
            <Textarea name="values" rows={3} placeholder="Новое значение. Можно сразу несколько, каждое с новой строки." required />
            <Submit>Добавить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
