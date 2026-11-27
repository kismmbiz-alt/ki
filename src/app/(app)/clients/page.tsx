import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { btn, dOnly, Input, PageHeader, Stat } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { normalizePhone } from "@/lib/domain/orders";
import { maskPhone } from "@/lib/domain/bonus";
import { clientStats } from "@/lib/domain/client-stats";

const balls = (k: number) => (k / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Бонусы: клиенты, их визиты, покупки и баллы. Контакты видит только владелец. */
export default async function BonusClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db, user, company } = await requireUser();
  const contacts = can(user, "clientContacts");
  const where: Prisma.ClientWhereInput = {};
  if (q?.trim()) {
    const phone = normalizePhone(q);
    where.OR = [{ name: { contains: q.trim(), mode: "insensitive" } }, ...(phone.length > 4 ? [{ phone: { contains: phone.slice(-7) } }] : [])];
  }
  const clients = await db.client.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
  const stats = await clientStats(db, clients.map((c) => c.id));
  const totalBalls = [...stats.values()].reduce((s, x) => s + Math.max(x.balance, 0), 0);

  return (
    <>
      <PageHeader title="Бонусы">
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="ФИО или телефон" className="w-64" />
          <button className={btn("secondary")}>Найти</button>
        </form>
        <Link href="/clients/new" className={btn()}>
          <UserPlus size={16} /> Новый клиент
        </Link>
      </PageHeader>
      {!company.bonusEnabled && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Бонусная система выключена. Включите и настройте её в{" "}
          <Link href="/settings/bonus" className="underline">
            Настройки → Бонусная система
          </Link>
          .
        </p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Клиентов" value={clients.length} sub={q ? "по запросу" : undefined} />
        <Stat label="Баллов у клиентов" value={balls(totalBalls)} />
        <Stat label="Начисление" value={company.bonusEnabled ? `${company.bonusSalePct / 100}% с продаж` : "выключено"} sub={company.bonusEnabled ? `${company.bonusOrderPct / 100}% с заказов` : undefined} />
      </div>
      <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">ФИО</th>
              <th className="px-3 py-2.5 font-medium">Телефон</th>
              <th className="px-3 py-2.5 text-right font-medium">Визитов</th>
              <th className="px-3 py-2.5 text-right font-medium">Покупок на</th>
              <th className="px-3 py-2.5 text-right font-medium">Баллы</th>
              <th className="px-3 py-2.5 font-medium">Последний визит</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((c) => {
              const s = stats.get(c.id)!;
              return (
                <RowLink key={c.id} href={`/clients/${c.id}`}>
                  <td className="px-3 py-2 text-slate-900">{c.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{contacts ? c.phone : maskPhone(c.phone)}</td>
                  <td className="px-3 py-2 text-right">{s.visits}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rub(s.spent)}</td>
                  <td className="px-3 py-2 text-right font-medium text-amber-700">{balls(s.balance)}</td>
                  <td className="px-3 py-2 text-slate-500">{s.lastVisit ? dOnly(s.lastVisit) : "—"}</td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
        {!clients.length && <p className="p-10 text-center text-sm text-slate-400">Клиентов не найдено</p>}
      </div>
    </>
  );
}
