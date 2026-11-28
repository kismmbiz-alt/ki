import { NavLink } from "@/components/nav-link";
import { can } from "@/lib/auth";
import type { Permission } from "@/lib/perms";

type U = { role: Parameters<typeof can>[0]["role"]; perms?: readonly string[] };

/** Вкладки раздела «Рынок». «Сводка» видна только тем, у кого есть право marketSummary. */
export function MarketTabs({ user }: { user: U }) {
  const has = (p: Permission) => can(user, p);
  const tabs = [
    { href: "/market", label: "Оценка", exact: true, show: has("buyback") },
    { href: "/market/search", label: "Поиск", exact: false, show: has("buyback") },
    { href: "/market/results", label: "Результаты", exact: false, show: has("buyback") },
    { href: "/market/summary", label: "Сводка", exact: false, show: has("marketSummary") },
    { href: "/market/sources", label: "Источники", exact: false, show: has("buybackSources") },
    { href: "/market/settings", label: "Настройки", exact: false, show: has("buybackSources") },
  ].filter((t) => t.show);
  return (
    <div className="tabbar mb-4 flex-wrap">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.exact}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
