import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dt, PageHeader, Table } from "@/components/ui";
import { dur, PlatformTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Журнал входов поддержки в данные мастерских (152-ФЗ). */
export default async function PlatformSupportLogPage() {
  await requirePlatformAdmin();
  const list = await prisma.supportLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 500,
    include: { company: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title="Платформа" />
      <PlatformTabs />
      <p className="mb-3 text-sm text-slate-500">
        Каждый вход в данные мастерской. Мастерская видит эти же записи у себя: Финансы → Журнал действий, раздел «Поддержка».
      </p>
      <Table head={["Начало", "Конец", "Мастерская", "Кто", "Режим", "Причина"]} empty="Входов не было">
        {list.map((l) => (
          <tr key={l.id}>
            <td className="whitespace-nowrap px-3 py-2">{dt(l.startedAt)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">
              {l.endedAt ? `${dt(l.endedAt)} (${dur((l.endedAt.getTime() - l.startedAt.getTime()) / 1000)})` : "сейчас внутри"}
            </td>
            <td className="px-3 py-2">{l.company.name}</td>
            <td className="px-3 py-2">{l.adminName}</td>
            <td className="px-3 py-2 text-slate-500">{l.write ? "просмотр и изменения" : "только просмотр"}</td>
            <td className="px-3 py-2">{l.reason}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
