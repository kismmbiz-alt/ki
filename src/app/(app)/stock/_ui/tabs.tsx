import { NavLink } from "@/components/nav-link";

export function StockTabs() {
  const tabs = [
    { href: "/stock", label: "Остатки" },
    { href: "/stock/receipts", label: "Поступления" },
    { href: "/stock/transfers", label: "Перемещения" },
    { href: "/stock/writeoffs", label: "Списания" },
    { href: "/stock/returns", label: "Возвраты" },
    { href: "/stock/inventory", label: "Инвентаризация" },
    { href: "/stock/suppliers", label: "Поставщики" },
    { href: "/stock/import", label: "Загрузка из Excel" },
  ];
  return (
    <div className="scroll-thin mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.href === "/stock"}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
