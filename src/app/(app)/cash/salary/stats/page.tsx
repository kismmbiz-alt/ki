import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { salarySheet } from "@/lib/domain/salary";
import { SalaryTabs } from "../_tabs";
import { salaryCtx } from "../_shared";

const n2 = (k: number) => (k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Зарплата → Статистика: начислено и к выплате по всем сотрудникам за каждый период. */
export default async function SalaryStatsPage() {
  const { db, company, periods } = await salaryCtx();
  const staff = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
  const list = [...periods].reverse().slice(-12);
  const cols = await Promise.all(
    list.map(async (p) => {
      const sheets = (await Promise.all(staff.map((u) => salarySheet(db, company, u.id, p.from, p.to)))).filter((x) => !!x);
      return { p, total: sheets.reduce((a, s) => a + s.total, 0), due: sheets.reduce((a, s) => a + s.due, 0) };
    }),
  );
  const tones = ["bg-rose-50", "bg-amber-50", "bg-emerald-50", "bg-sky-50"];
  return (
    <>
      <PageHeader title="Зарплата" />
      <SalaryTabs />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-48 px-4 py-3 text-left align-bottom">
                  <div className="text-lg font-semibold text-slate-900">Статистика</div>
                  <div className="text-xs font-normal text-slate-500">
                    Период: {company.salaryPeriodCount} {company.salaryPeriodType === "WEEK" ? "нед." : "мес."}
                  </div>
                </th>
                {cols.map(({ p }, i) => (
                  <th key={p.key} className={`min-w-28 border-l border-slate-200 px-3 py-2 text-center font-medium ${tones[Math.floor((p.from.getMonth() % 12) / 3)] ?? ""}`}>
                    <div>{p.short}</div>
                    <div className="text-xs font-normal text-slate-500">
                      {i + 1 + periods.length - cols.length} период
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-3 font-medium">Начислено</td>
                {cols.map((c) => (
                  <td key={c.p.key} className="border-l border-slate-100 px-3 py-3 text-right">
                    <Link href={`/cash/salary?p=${c.p.key}`} className="hover:text-blue-600">
                      {n2(c.total)}
                    </Link>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium">К выплате</td>
                {cols.map((c) => (
                  <td key={c.p.key} className={`border-l border-slate-100 px-3 py-3 text-right font-semibold ${c.due < 0 ? "text-red-600" : c.due > 0 ? "text-amber-700" : ""}`}>
                    {n2(c.due)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
