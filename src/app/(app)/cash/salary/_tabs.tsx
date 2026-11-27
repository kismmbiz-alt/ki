import { NavLink } from "@/components/nav-link";

export function SalaryTabs() {
  return (
    <div className="tabbar mb-4 flex-wrap">
      <NavLink href="/cash/salary" exact>
        Начисления
      </NavLink>
      <NavLink href="/cash/salary/stats">Статистика</NavLink>
      <NavLink href="/cash/salary/settings">Настройка периодов</NavLink>
    </div>
  );
}
