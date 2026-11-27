import { NavLink } from "@/components/nav-link";

export function ReportsTabs() {
  return (
    <div className="tabbar mb-4 flex-wrap">
      <NavLink href="/reports" exact>
        Отчёты
      </NavLink>
      <NavLink href="/reports/products">Продажи товаров</NavLink>
    </div>
  );
}
