"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SubItem = { href: string; label: string; exact?: boolean };
export type SideItem = { href: string; label: string; icon: React.ReactNode; match?: string[]; children?: SubItem[] };

const under = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Подпункт активен по самому точному совпадению адреса среди соседей. */
function activeChild(path: string, children: SubItem[]) {
  const hits = children.filter((c) => (c.exact ? path === c.href : under(path, c.href)));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Левое меню: у раздела раскрывается подменю, как в LiveSklad. */
export function SideNav({ items }: { items: SideItem[] }) {
  const path = usePathname();
  const owner = (it: SideItem) => [it.href, ...(it.match ?? []), ...(it.children ?? []).map((c) => c.href)];
  // раздел, к которому относится текущая страница: самое длинное совпадение адреса
  const current = items
    .flatMap((it) => owner(it).filter((h) => under(path, h)).map((h) => ({ it, len: h.length })))
    .sort((a, b) => b.len - a.len)[0]?.it.href;
  const [open, setOpen] = useState<string | null>(current ?? null);
  useEffect(() => setOpen(current ?? null), [current]);

  return (
    <>
      {items.map((it) => {
        const active = current === it.href;
        const expanded = !!it.children?.length && open === it.href;
        const sub = it.children ? activeChild(path, it.children) : undefined;
        return (
          <div key={it.href} className="shrink-0">
            <div
              className={`flex items-center rounded-lg text-sm transition ${
                active ? "bg-[#4f6bff] font-semibold text-[#fff] shadow-md shadow-[#4f6bff]/30" : "text-[#aab1bf] hover:bg-[#ffffff0d] hover:text-[#fff]"
              }`}
            >
              <Link href={it.href} onClick={() => setOpen(it.href)} className="flex flex-1 items-center gap-3 px-3 py-2 whitespace-nowrap">
                <span className={active ? "text-[#fff]" : "text-[#7d8494]"}>{it.icon}</span>
                {it.label}
              </Link>
              {!!it.children?.length && (
                <button
                  type="button"
                  aria-label={expanded ? "Свернуть" : "Развернуть"}
                  onClick={() => setOpen(expanded ? null : it.href)}
                  className="hidden px-2 py-2 text-[#7d8494] hover:text-[#fff] md:block"
                >
                  <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {expanded && (
              <div className="mt-0.5 mb-1 hidden space-y-0.5 md:block">
                {it.children!.map((c) => {
                  const on = c.href === sub;
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={`flex items-center gap-2 rounded-md py-1.5 pr-2 pl-10 text-[13px] whitespace-nowrap ${
                        on ? "bg-[#4f6bff]/20 font-medium text-[#fff]" : "text-[#9aa1ae] hover:bg-[#ffffff0a] hover:text-[#fff]"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-[#8ea0ff]" : "bg-[#4a4f5a]"}`} />
                      <span className="truncate">{c.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
