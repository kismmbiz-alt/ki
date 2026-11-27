import { NavLink } from "@/components/nav-link";
import { can, requireUser } from "@/lib/auth";

export async function CashTabs() {
  const { user } = await requireUser();
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {can(user, "cash") && (
        <>
          <NavLink href="/cash" exact>
            Кассы
          </NavLink>
          <NavLink href="/cash/operations">Транзакции</NavLink>
        </>
      )}
      {(can(user, "cash") || can(user, "users")) && <NavLink href="/cash/salary">Зарплата</NavLink>}
      {can(user, "journal") && <NavLink href="/cash/journal">Журнал действий</NavLink>}
    </div>
  );
}
