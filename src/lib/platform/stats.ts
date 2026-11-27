import os from "os";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "../db";

const H = 3600_000;
const GAP_MS = 3 * 60_000; // нет проверок дольше 3 минут — сайт не работал

export type Outage = { from: Date; to: Date | null; reason: string };

/** Стабильность: доля успешных проверок, время ответа, сбои. */
export async function healthSummary() {
  const since7 = new Date(Date.now() - 7 * 24 * H);
  const since24 = new Date(Date.now() - 24 * H);
  const samples = await prisma.healthSample.findMany({
    where: { at: { gte: since7 } },
    orderBy: { at: "asc" },
    select: { at: true, ok: true, ms: true, error: true },
  });
  const last = samples[samples.length - 1] ?? null;
  const day = samples.filter((s) => s.at >= since24);

  const pct = (list: typeof samples) => (list.length ? (list.filter((s) => s.ok).length / list.length) * 100 : null);
  const okMs = day
    .filter((s) => s.ok)
    .map((s) => s.ms)
    .sort((a, b) => a - b);
  const avg = okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null;
  const p95 = okMs.length ? okMs[Math.min(okMs.length - 1, Math.floor(okMs.length * 0.95))] : null;

  // сбои: подряд неудачные проверки или перерыв в проверках (сервер или приложение не работали)
  const outages: Outage[] = [];
  let cur: Outage | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[i - 1];
    if (prev && s.at.getTime() - prev.at.getTime() > GAP_MS) {
      if (cur) {
        cur.to = prev.at;
        outages.push(cur);
        cur = null;
      }
      outages.push({
        from: prev.at,
        to: s.at,
        reason: "Сайт не работал (сервер или приложение были выключены или перезапускались)",
      });
    }
    if (!s.ok) {
      if (!cur) cur = { from: s.at, to: null, reason: s.error ?? "Ошибка" };
    } else if (cur) {
      cur.to = s.at;
      outages.push(cur);
      cur = null;
    }
  }
  if (cur) outages.push(cur);
  // если последней проверки давно нет — сайт, скорее всего, сейчас не работает
  const stale = !last || Date.now() - last.at.getTime() > GAP_MS;

  // график: среднее время ответа по часам за сутки
  const hours = Array.from({ length: 24 }, (_, i) => {
    const from = new Date(Date.now() - (24 - i) * H);
    const to = new Date(from.getTime() + H);
    const list = day.filter((s) => s.at >= from && s.at < to && s.ok);
    const v = list.length ? Math.round(list.reduce((a, s) => a + s.ms, 0) / list.length) : 0;
    const fails = day.filter((s) => s.at >= from && s.at < to && !s.ok).length;
    const label = from.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      label,
      value: v,
      hint: `${label}: ${v ? v + " мс" : "нет данных"}${fails ? `, ошибок: ${fails}` : ""}`,
    };
  });

  return {
    last,
    stale,
    uptime24: pct(day),
    uptime7: pct(samples),
    avg,
    p95,
    checks24: day.length,
    outages: outages.reverse().slice(0, 20),
    hours,
  };
}

/** Ошибки сервера и запуски приложения. */
export async function platformEvents() {
  const since24 = new Date(Date.now() - 24 * H);
  const [errors, errors24, starts] = await Promise.all([
    prisma.platformEvent.findMany({
      where: { kind: "error" },
      orderBy: { at: "desc" },
      take: 50,
    }),
    prisma.platformEvent.count({
      where: { kind: "error", at: { gte: since24 } },
    }),
    prisma.platformEvent.findMany({
      where: { kind: "start" },
      orderBy: { at: "desc" },
      take: 10,
    }),
  ]);
  return { errors, errors24, starts };
}

async function lastBackup() {
  const dir = process.env.BACKUP_DIR ?? "/var/backups/crm";
  try {
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".dump"));
    let best: { name: string; at: Date; size: number } | null = null;
    for (const name of names) {
      const st = await fs.stat(path.join(dir, name));
      if (!best || st.mtime > best.at) best = { name, at: st.mtime, size: st.size };
    }
    return { count: names.length, last: best };
  } catch {
    return null;
  }
}

/** Ресурсы сервера: процессор, память, диск, база, копии. */
export async function serverInfo() {
  let disk: { total: number; free: number } | null = null;
  try {
    const s = await fs.statfs("/");
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    disk = null;
  }
  let dbSize: number | null = null;
  try {
    const r = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    dbSize = Number(r[0]?.size ?? 0);
  } catch {
    dbSize = null;
  }
  return {
    cpus: os.cpus().length,
    load: os.loadavg(),
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    appMem: process.memoryUsage().rss,
    osUptime: os.uptime(),
    appUptime: process.uptime(),
    node: process.version,
    disk,
    dbSize,
    backup: await lastBackup(),
  };
}

/** Компании и их активность — только общие цифры, без содержимого. */
export async function companiesActivity() {
  const since30 = new Date(Date.now() - 30 * 24 * H);
  const [companies, users, seen, orders, orders30, sales, sales30, pays30, clients] = await Promise.all([
    prisma.company.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        supportUntil: true,
        supportWrite: true,
        blockedAt: true,
      },
    }),
    prisma.user.groupBy({
      by: ["companyId"],
      where: { isActive: true },
      _count: { _all: true },
    }),
    prisma.user.groupBy({ by: ["companyId"], _max: { lastSeenAt: true } }),
    prisma.order.groupBy({ by: ["companyId"], _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["companyId"],
      where: { createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.sale.groupBy({ by: ["companyId"], _count: { _all: true } }),
    prisma.sale.groupBy({
      by: ["companyId"],
      where: { createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.cashTransaction.groupBy({
      by: ["companyId"],
      where: { createdAt: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.client.groupBy({ by: ["companyId"], _count: { _all: true } }),
  ]);
  const cnt = (rows: { companyId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.companyId, r._count._all]));
  const mUsers = cnt(users),
    mOrders = cnt(orders),
    mOrders30 = cnt(orders30),
    mSales = cnt(sales),
    mSales30 = cnt(sales30),
    mPays30 = cnt(pays30),
    mClients = cnt(clients);
  const mSeen = new Map(seen.map((r) => [r.companyId, r._max.lastSeenAt]));
  const owners = await prisma.user.findMany({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { companyId: true, name: true, email: true },
  });
  const mOwner = new Map<string, { name: string; email: string }>();
  for (const o of owners) if (!mOwner.has(o.companyId)) mOwner.set(o.companyId, { name: o.name, email: o.email });
  const now = new Date();
  return companies.map((c) => ({
    ...c,
    owner: mOwner.get(c.id) ?? null,
    users: mUsers.get(c.id) ?? 0,
    lastSeenAt: mSeen.get(c.id) ?? null,
    orders: mOrders.get(c.id) ?? 0,
    orders30: mOrders30.get(c.id) ?? 0,
    sales: mSales.get(c.id) ?? 0,
    sales30: mSales30.get(c.id) ?? 0,
    pays30: mPays30.get(c.id) ?? 0,
    clients: mClients.get(c.id) ?? 0,
    supportOpen: !!c.supportUntil && c.supportUntil > now,
  }));
}
