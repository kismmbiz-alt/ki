import { NavLink } from "@/components/nav-link";

export function SalesTabs() {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      <NavLink href="/sales" exact>
        Касса
      </NavLink>
      <NavLink href="/sales/history">История продаж</NavLink>
      <NavLink href="/sales/shift">Смена</NavLink>
    </div>
  );
}
