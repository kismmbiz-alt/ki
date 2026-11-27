import { NavLink } from "@/components/nav-link";

export function ReportsTabs() {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      <NavLink href="/reports" exact>
        Отчёты
      </NavLink>
      <NavLink href="/reports/products">Продажи товаров</NavLink>
    </div>
  );
}
