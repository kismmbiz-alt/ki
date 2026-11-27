import { NavLink } from "@/components/nav-link";

export function SalesTabs() {
  return (
    <div className="tabbar mb-4 flex-wrap">
      <NavLink href="/sales" exact>
        Касса
      </NavLink>
      <NavLink href="/sales/history">История продаж</NavLink>
      <NavLink href="/sales/shift">Смена</NavLink>
    </div>
  );
}
