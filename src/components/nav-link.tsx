"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, icon, variant = "tab", exact = false }: { href: string; children: React.ReactNode; icon?: React.ReactNode; variant?: "tab" | "side"; exact?: boolean }) {
  const path = usePathname();
  const active =
    path === href ||
    (variant === "side" && path.startsWith(href + "/") && !(href === "/settings" && path.startsWith("/settings/dicts"))) ||
    (variant === "tab" && !exact && href !== "/settings" && path.startsWith(href + "/"));
  if (variant === "side")
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
          active ? "bg-[#4f6bff]/20 font-medium text-[#fff] ring-1 ring-[#4f6bff]/50" : "text-[#aab1bf] hover:bg-[#ffffff0d] hover:text-[#fff]"
        }`}
      >
        <span className={active ? "text-[#8ea0ff]" : "text-[#7d8494]"}>{icon}</span>
        {children}
      </Link>
    );
  return (
    <Link
      href={href}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${active ? "border-blue-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      {children}
    </Link>
  );
}
