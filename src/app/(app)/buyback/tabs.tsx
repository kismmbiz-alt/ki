import { NavLink } from "@/components/nav-link";

export function BuybackTabs({ admin }: { admin: boolean }) {
  const tabs = [
    { href: "/buyback", label: "Лента объявлений" },
    { href: "/buyback/rating", label: "Рейтинг" },
    ...(admin ? [{ href: "/buyback/sources", label: "Источники" }] : []),
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
