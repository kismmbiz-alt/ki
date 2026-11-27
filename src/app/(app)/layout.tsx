import { cookies } from "next/headers";
import {
  BookOpen,
  ChartColumn,
  HandCoins,
  House,
  LogOut,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { can, requireUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { switchLocation, toggleTheme } from "./actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, locations, location } = await requireUser();
  const dark = (await cookies()).get("theme")?.value !== "light";
  const role = user.role;
  const I = { size: 18, strokeWidth: 1.8 };
  const nav = [
    { href: "/dashboard", label: "Главная", icon: <House {...I} />, show: true },
    { href: "/orders", label: "Заказы", icon: <Wrench {...I} />, show: true },
    { href: "/clients", label: "Клиенты", icon: <Users {...I} />, show: true },
    { href: "/buyback", label: "Скупка", icon: <HandCoins {...I} />, show: can(user, "buyback") },
    { href: "/sales", label: "Продажи", icon: <ShoppingCart {...I} />, show: can(user, "sales") },
    { href: "/stock", label: "Склад", icon: <Package {...I} />, show: can(user, "stock") },
    { href: can(user, "cash") ? "/cash" : "/cash/journal", label: "Финансы", icon: <Wallet {...I} />, show: can(user, "cash") || can(user, "journal") },
    { href: "/reports", label: "Аналитика", icon: <ChartColumn {...I} />, show: can(user, "reports") },
    { href: "/settings/dicts", label: "Справочники", icon: <BookOpen {...I} />, show: can(user, "settings") },
    { href: "/settings", label: "Настройки", icon: <Settings {...I} />, show: true },
  ].filter((n) => n.show);

  return (
    <div className={`min-h-screen md:flex ${dark ? "theme-dark" : ""}`}>
      <aside className="no-print bg-[#15171c] text-[#e4e7ec] md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f6bff] to-[#7c4dff] text-sm font-bold text-[#fff]">
              {company.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#fff]">{company.name}</div>
              <div className="truncate text-xs text-[#7d8494]">{location?.name ?? "нет точки"}</div>
            </div>
          </div>
        </div>
        {locations.length > 1 && !user.locationId && (
          <form action={switchLocation} className="hidden px-4 pb-3 md:flex md:gap-1">
            <select
              name="locationId"
              defaultValue={location?.id}
              className="min-w-0 flex-1 rounded-md border border-[#31353e] bg-[#1f2228] px-2 py-1 text-xs text-[#e4e7ec]"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button className="rounded-md border border-[#31353e] px-2 py-1 text-xs text-[#aab1bf] hover:text-[#fff]">Ок</button>
          </form>
        )}
        <nav className="scroll-thin flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-y-auto">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} icon={n.icon} variant="side">
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-[#262a31] px-3 py-3 md:block">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2e36] text-xs font-semibold text-[#cfd4dc]">
              {user.name
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-[#e4e7ec]">{user.name}</div>
              <div className="text-xs text-[#7d8494]">{role === "OWNER" ? "Владелец" : (user.position?.name ?? ROLE_LABEL[role])}</div>
            </div>
          </div>
          <div className="flex gap-1">
            <form action={toggleTheme} className="flex-1">
              <button className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#aab1bf] hover:bg-[#ffffff0d] hover:text-[#fff]">
                {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? "Светлая" : "Тёмная"}
              </button>
            </form>
            <form action={logout} className="flex-1">
              <button className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#aab1bf] hover:bg-[#ffffff0d] hover:text-[#fff]">
                <LogOut size={14} /> Выйти
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-slate-50 p-4 md:p-6">{children}</main>
    </div>
  );
}
