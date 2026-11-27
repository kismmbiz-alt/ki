import { NavLink } from "@/components/nav-link";

export function SalaryTabs() {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      <NavLink href="/cash/salary" exact>
        Начисления
      </NavLink>
      <NavLink href="/cash/salary/stats">Статистика</NavLink>
      <NavLink href="/cash/salary/settings">Настройка периодов</NavLink>
    </div>
  );
}
