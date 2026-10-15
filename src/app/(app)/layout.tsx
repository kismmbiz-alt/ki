import { can, requireUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { switchLocation } from "./actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, locations, location } = await requireUser();
  const role = user.role;
  const nav = [
    { href: "/orders", label: "Заказы", show: true },
    { href: "/clients", label: "Клиенты", show: true },
    { href: "/sales", label: "Продажи", show: can(role, "sales") },
    { href: "/stock", label: "Склад", show: can(role, "stock") },
    { href: "/cash", label: "Касса", show: can(role, "cash") },
    { href: "/reports", label: "Отчёты", show: can(role, "reports") },
    { href: "/settings", label: "Настройки", show: true },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:block">
          <div>
            <div className="truncate text-sm font-semibold text-slate-900">{company.name}</div>
            <div className="truncate text-xs text-slate-500">
              {user.name} · {ROLE_LABEL[role]}
            </div>
          </div>
          {locations.length > 1 && !user.locationId ? (
            <form action={switchLocation} className="md:mt-3">
              <select
                name="locationId"
                defaultValue={location?.id}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs">Сменить точку</button>
            </form>
          ) : (
            <div className="text-xs text-slate-500 md:mt-2">📍 {location?.name ?? "нет точки"}</div>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <form action={logout} className="hidden px-4 py-4 md:absolute md:bottom-0 md:block">
          <button className="text-xs text-slate-500 hover:text-slate-800">Выйти</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
