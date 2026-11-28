import { redirect } from "next/navigation";
import { getPendingSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform/admin";
import { hasAccess, pendingText } from "@/lib/platform/approval";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

/** Экран партнёра, пока заявка ждёт подтверждения главного администратора или оплаты. */
export default async function PendingPage() {
  const s = await getPendingSession();
  if (!s) redirect("/login");
  const company = s.user.company;
  if (hasAccess(company.approval) || (await isPlatformAdmin(s.user))) redirect("/dashboard");
  const t = pendingText(company.approval);
  return (
    <>
      <h1 className="mb-2 text-lg font-semibold">{t.title}</h1>
      <p className="mb-3 text-sm text-slate-600">{t.text}</p>
      <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Мастерская: <b>{company.name}</b>
        <br />
        Вход: {s.user.email}
      </p>
      <p className="mb-4 text-xs text-slate-500">Обновите страницу позже — как только доступ откроют, вы сразу попадёте в CRM.</p>
      <div className="flex gap-2">
        <a href="/pending" className="flex-1 rounded-lg bg-[#4f6bff] px-3 py-2 text-center text-sm font-medium text-[#fff] hover:bg-[#3d58ea]">
          Проверить ещё раз
        </a>
        <form action={logout}>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Выйти</button>
        </form>
      </div>
    </>
  );
}
