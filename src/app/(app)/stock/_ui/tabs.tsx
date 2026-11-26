import { NavLink } from "@/components/nav-link";

export function StockTabs() {
  const tabs = [
    { href: "/stock", label: "Остатки" },
    { href: "/stock/docs", label: "Документы" },
    { href: "/stock/suppliers", label: "Поставщики" },
    { href: "/stock/import", label: "Загрузка из Excel" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.href === "/stock"}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
