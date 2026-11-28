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
  ShieldCheck,
  ShoppingCart,
  Sun,
  Gift,
  Wallet,
  Wrench,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requireUser, ROLE_LABEL } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { switchLocation, toggleTheme } from "./actions";
import { endSupportAction } from "./platform/actions";
import { SideNav, type SubItem } from "@/components/side-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, company, locations, location, platformAdmin, support } = await requireUser();
  const pendingRequests = platformAdmin && !support ? await prisma.company.count({ where: { approval: "PENDING" } }) : 0;
  const dark = (await cookies()).get("theme")?.value !== "light";
  const role = user.role;
  const I = { size: 18, strokeWidth: 1.8 };
  const has = (p: Parameters<typeof can>[1]) => can(user, p);
  const sub = (list: (SubItem & { show?: boolean })[]) => list.filter((x) => x.show !== false);
  const nav = [
    { href: "/dashboard", label: "Главная", icon: <House {...I} />, show: true },
    {
      href: "/sales",
      label: "Продажи",
      icon: <ShoppingCart {...I} />,
      show: has("sales"),
      children: sub([
        { href: "/sales", label: "Касса", exact: true },
        { href: "/sales/history", label: "История продаж" },
        { href: "/sales/shift", label: "Смена" },
      ]),
    },
    { href: "/orders", label: "Заказы", icon: <Wrench {...I} />, show: true },
    {
      href: "/clients",
      label: "Бонусы",
      icon: <Gift {...I} />,
      show: true,
      children: sub([
        { href: "/clients", label: "Клиенты", exact: true },
        { href: "/clients/new", label: "Регистрация клиента" },
        { href: "/settings/bonus", label: "Условия бонусов", show: has("settings") },
      ]),
    },
    {
      href: "/stock",
      label: "Склад",
      icon: <Package {...I} />,
      show: has("stock"),
      children: sub([
        { href: "/stock", label: "Остатки", exact: true },
        { href: "/stock/receipts", label: "Поступления" },
        { href: "/stock/transfers", label: "Перемещения" },
        { href: "/stock/returns", label: "Возвраты от клиентов" },
        { href: "/stock/supplier-returns", label: "Возвраты поставщикам" },
        { href: "/stock/inventory", label: "Инвентаризации" },
        { href: "/stock/writeoffs", label: "Списания" },
        { href: "/stock/suppliers", label: "Поставщики" },
        { href: "/stock/import", label: "Загрузка из Excel", show: has("stockDocs") },
        { href: "/stock/settings", label: "Настройки склада" },
      ]),
    },
    {
      href: "/market",
      label: "Рынок",
      icon: <HandCoins {...I} />,
      show: has("buyback") || has("marketSummary"),
      children: sub([
        { href: "/market", label: "Оценка", exact: true, show: has("buyback") },
        { href: "/market/search", label: "Поиск", show: has("buyback") },
        { href: "/market/results", label: "Результаты", show: has("buyback") },
        { href: "/market/summary", label: "Сводка", show: has("marketSummary") },
        { href: "/market/sources", label: "Источники", show: has("buybackSources") },
        { href: "/market/settings", label: "Настройки", show: has("buybackSources") },
      ]),
    },
    {
      href: has("cash") ? "/cash" : has("journal") ? "/cash/journal" : "/cash/salary",
      label: "Финансы",
      icon: <Wallet {...I} />,
      show: has("cash") || has("journal") || has("users"),
      match: ["/cash"],
      children: sub([
        { href: "/cash", label: "Кассы", exact: true, show: has("cash") },
        { href: "/cash/operations", label: "Транзакции", show: has("cash") },
        { href: "/cash/salary", label: "Зарплата", show: has("cash") || has("users") },
        { href: "/cash/journal", label: "Журнал действий", show: has("journal") },
      ]),
    },
    {
      href: "/reports",
      label: "Аналитика",
      icon: <ChartColumn {...I} />,
      show: has("reports"),
      children: sub([
        { href: "/reports", label: "Отчёты", exact: true },
        { href: "/reports/products", label: "Продажи товаров" },
      ]),
    },
    { href: "/settings/dicts", label: "Справочники", icon: <BookOpen {...I} />, show: has("settings") },
    {
      href: "/settings",
      label: "Настройки",
      icon: <Settings {...I} />,
      show: true,
      children: sub([
        { href: "/settings", label: "Общие", exact: true },
        { href: "/settings/locations", label: "Точки и план", show: has("settings") },
        { href: "/settings/places", label: "Склады и кассы", show: has("settings") },
        { href: "/settings/users", label: "Сотрудники", show: has("users") },
        { href: "/settings/positions", label: "Должности и права", show: has("users") },
        { href: "/settings/statuses", label: "Статусы", show: has("settings") },
        { href: "/settings/prices", label: "Цены", show: has("settings") },
        { href: "/settings/bonus", label: "Бонусная система", show: has("settings") },
        { href: "/settings/prints", label: "Печатные формы", show: has("settings") },
        { href: "/settings/catalog", label: "Прайс и источники", show: has("settings") },
      ]),
    },
    {
      href: "/platform",
      label: pendingRequests ? `Платформа (${pendingRequests})` : "Платформа",
      icon: <ShieldCheck {...I} />,
      show: platformAdmin && !support,
      children: [
        { href: "/platform", label: "Стабильность", exact: true },
        { href: "/platform/requests", label: pendingRequests ? `Заявки (${pendingRequests})` : "Заявки" },
        { href: "/platform/companies", label: "Компании" },
        { href: "/platform/invites", label: "Приглашения" },
        { href: "/platform/support", label: "Журнал поддержки" },
      ],
    },
  ]
    .filter((n) => n.show)
    .map(({ show: _show, ...n }) => n);

  return (
    <div className={`min-h-screen md:flex ${dark ? "theme-dark" : ""}`}>
      <aside className="no-print border-r border-[#262a31] bg-[#1a1d23] text-[#e4e7ec] md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
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
          <SideNav items={nav} />
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
      <main className="min-w-0 flex-1 bg-[var(--page)] p-4 md:p-6">
        {support && (
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>
              <b>Режим поддержки:</b> вы внутри мастерской «{support.companyName}» —{" "}
              {support.write ? "можно вносить изменения" : "только просмотр"}. Доступ до{" "}
              {support.until.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. Вход записан в журнал.
            </span>
            <form action={endSupportAction}>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-[#fff] hover:bg-red-700">Выйти из мастерской</button>
            </form>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
