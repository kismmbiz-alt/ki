import { requirePlatformAdmin } from "@/lib/auth";
import { healthSummary, platformEvents, serverInfo } from "@/lib/platform/stats";
import { Card, dt, PageHeader, Stat, Table } from "@/components/ui";
import { Columns } from "@/components/charts";
import { ago, bytes, dur, PlatformTabs } from "./tabs";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${v >= 99.95 ? "100" : v.toFixed(1)}%`);

/** Панель владельца платформы: работает ли сайт, как быстро, какие были сбои и ошибки. */
export default async function PlatformPage() {
  await requirePlatformAdmin();
  const [h, ev, srv] = await Promise.all([healthSummary(), platformEvents(), serverInfo()]);
  const up = h.last && !h.stale && h.last.ok;
  const tone = !h.last ? "border-slate-200 bg-white" : up ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50";
  const memUsed = srv.memTotal - srv.memFree;
  const diskUsed = srv.disk ? srv.disk.total - srv.disk.free : null;
  const diskLow = srv.disk && srv.disk.free / srv.disk.total < 0.1;
  const backupOld = !srv.backup?.last || Date.now() - srv.backup.last.at.getTime() > 2 * 864e5;

  return (
    <>
      <PageHeader title="Платформа" />
      <PlatformTabs />
      <div className={`mb-4 rounded-xl border p-4 ${tone}`}>
        <div className={`text-lg font-semibold ${!h.last ? "text-slate-700" : up ? "text-green-700" : "text-red-700"}`}>
          {!h.last ? "Проверки ещё не начались — первая будет через минуту" : up ? "Сайт работает" : "Есть проблема"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {h.last && (
            <>
              Последняя проверка {ago(h.last.at)}: {h.last.ok ? `ответ за ${h.last.ms} мс` : h.last.error}
              {h.stale && " — проверок давно не было, приложение могло зависнуть"}
            </>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Доступность за сутки" value={pct(h.uptime24)} sub={`проверок: ${h.checks24} (раз в минуту)`} />
        <Stat label="Доступность за 7 дней" value={pct(h.uptime7)} sub={`сбоев: ${h.outages.length}`} />
        <Stat
          label="Время ответа за сутки"
          value={h.avg != null ? `${h.avg} мс` : "—"}
          sub={h.p95 != null ? `медленные запросы до ${h.p95} мс` : undefined}
        />
        <Stat label="Ошибки сервера за сутки" value={ev.errors24} sub={ev.errors24 ? "смотрите список ниже" : "ошибок нет"} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Время ответа по часам, мс">
          <Columns data={h.hours} empty="Пока нет данных — график появится через час" />
        </Card>
        <Card title="Сервер">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Нагрузка процессора</dt>
            <dd className={srv.load[0] > srv.cpus ? "text-red-600" : ""}>
              {Math.round((srv.load[0] / srv.cpus) * 100)}% ({srv.cpus} ядра)
            </dd>
            <dt className="text-slate-500">Память</dt>
            <dd className={memUsed / srv.memTotal > 0.9 ? "text-red-600" : ""}>
              {bytes(memUsed)} из {bytes(srv.memTotal)} (CRM: {bytes(srv.appMem)})
            </dd>
            <dt className="text-slate-500">Диск</dt>
            <dd className={diskLow ? "text-red-600" : ""}>{srv.disk ? `занято ${bytes(diskUsed)} из ${bytes(srv.disk.total)}` : "—"}</dd>
            <dt className="text-slate-500">База данных</dt>
            <dd>{bytes(srv.dbSize)}</dd>
            <dt className="text-slate-500">Резервная копия</dt>
            <dd className={backupOld ? "text-red-600" : ""}>
              {srv.backup?.last ? `${dt(srv.backup.last.at)}, ${bytes(srv.backup.last.size)} (всего ${srv.backup.count})` : "не найдена"}
            </dd>
            <dt className="text-slate-500">CRM работает без перезапуска</dt>
            <dd>{dur(srv.appUptime)}</dd>
            <dt className="text-slate-500">Сервер включён</dt>
            <dd>{dur(srv.osUptime)}</dd>
          </dl>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Сбои за 7 дней">
          {h.outages.length ? (
            <ul className="space-y-2 text-sm">
              {h.outages.map((o, i) => (
                <li key={i}>
                  <span className="font-medium">{dt(o.from)}</span>
                  {o.to ? ` — ${dt(o.to)} (${dur(Math.max(60, (o.to.getTime() - o.from.getTime()) / 1000))})` : " — продолжается"}
                  <div className="text-slate-500">{o.reason}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Сбоев не было</p>
          )}
        </Card>
        <Card title="Запуски приложения">
          <p className="mb-2 text-xs text-slate-500">Запуск бывает после обновления. Частые запуски без обновления — признак падений.</p>
          <ul className="space-y-1 text-sm">
            {ev.starts.map((s) => (
              <li key={s.id}>
                {dt(s.at)} <span className="text-slate-400">{s.detail}</span>
              </li>
            ))}
            {!ev.starts.length && <li className="text-slate-500">Пока нет</li>}
          </ul>
        </Card>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Последние ошибки сервера</h2>
      <Table head={["Когда", "Где", "Ошибка"]} empty="Ошибок нет">
        {ev.errors.map((e) => (
          <tr key={e.id} className="align-top">
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(e.at)}</td>
            <td className="px-3 py-2 text-slate-500">{e.path}</td>
            <td className="px-3 py-2">
              <details>
                <summary className="cursor-pointer">{e.message}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{e.detail}</pre>
              </details>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
