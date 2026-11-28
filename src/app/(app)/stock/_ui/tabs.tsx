import { NavLink } from "@/components/nav-link";

export function StockTabs() {
  const tabs = [
    { href: "/stock", label: "Остатки" },
    { href: "/stock/receipts", label: "Поступления" },
    { href: "/stock/transfers", label: "Перемещения" },
    { href: "/stock/returns", label: "Возвраты от клиентов" },
    { href: "/stock/supplier-returns", label: "Возвраты поставщикам" },
    { href: "/stock/inventory", label: "Инвентаризации" },
    { href: "/stock/writeoffs", label: "Списания" },
    { href: "/stock/suppliers", label: "Поставщики" },
    { href: "/stock/import", label: "Загрузка из Excel" },
    { href: "/stock/settings", label: "Настройки склада" },
  ];
  return (
    <div className="tabbar scroll-thin mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.href === "/stock"}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
