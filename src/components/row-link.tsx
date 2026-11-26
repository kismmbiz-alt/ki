"use client";

import { useRouter } from "next/navigation";

/** Строка таблицы, по которой можно кликнуть целиком. */
export function RowLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select")) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
      className={`cursor-pointer hover:bg-slate-100/60 ${className}`}
    >
      {children}
    </tr>
  );
}
