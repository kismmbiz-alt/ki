import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { btn, Input, PageHeader, Select } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { salarySheet } from "@/lib/domain/salary";
import { SalaryTabs } from "./_tabs";
import { salaryCtx } from "./_shared";

/** Зарплата → Начисления: сотрудники за выбранный период, начислено и к выплате. */
export default async function SalaryPage({ searchParams }: { searchParams: Promise<{ q?: string; loc?: string; p?: string }> }) {
  const sp = await searchParams;
  const { db, company, periods } = await salaryCtx();
  const period = periods.find((p) => p.key === sp.p) ?? periods[0];
  const [staff, locations] = await Promise.all([
    db.user.findMany({ where: { isActive: true, ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const sheets = period ? (await Promise.all(staff.map((u) => salarySheet(db, company, u.id, period.from, period.to, sp.loc || null)))).filter((x) => !!x) : [];
  const shown = sheets.filter((s) => s.total || s.paid || s.due);
  const keep = new URLSearchParams({ ...(sp.p ? { p: sp.p } : {}), ...(sp.loc ? { loc: sp.loc } : {}) }).toString();

  return (
    <>
      <PageHeader title="Зарплата" />
      <SalaryTabs />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Сотрудник…" className="w-56" />
        {locations.length > 1 && (
          <Select name="loc" defaultValue={sp.loc ?? ""} className="w-48">
            <option value="">Все локации</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="p" defaultValue={period?.key} className="w-48">
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.short}
              {p.from.getFullYear() !== new Date().getFullYear() ? ` ${p.from.getFullYear()}` : ""}
            </option>
          ))}
        </Select>
        <button className={btn("secondary")}>Показать</button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Сотрудник</th>
              <th className="px-4 py-3 text-right font-medium">Начислено</th>
              <th className="px-4 py-3 text-right font-medium">К выплате</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(shown.length ? shown : sheets).map((s) => (
              <RowLink key={s.user.id} href={`/cash/salary/${s.user.id}${keep ? `?${keep}` : ""}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{s.user.name}</td>
                <td className="px-4 py-3 text-right">{rub(s.total)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${s.due > 0 ? "text-amber-700" : s.due < 0 ? "text-red-600" : "text-slate-500"}`}>{rub(s.due)}</td>
                <td className="pr-3 text-slate-300">
                  <ChevronRight size={16} />
                </td>
              </RowLink>
            ))}
            {!sheets.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Сотрудников не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {period && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-x-10 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <span className="text-slate-600">Итого к выплате за {period.label}:</span>
          <span className="text-xl">{rub(sheets.reduce((a, s) => a + s.total, 0))}</span>
          <span className="text-xl font-semibold">{rub(sheets.reduce((a, s) => a + s.due, 0))}</span>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Начисления считаются сами по правилам в карточке сотрудника: за продажи и за выполненные заказы. Поменяли правило — суммы пересчитаются.{" "}
        <Link href="/settings/users" className="text-blue-600 hover:underline">
          Правила сотрудников
        </Link>
      </p>
    </>
  );
}
