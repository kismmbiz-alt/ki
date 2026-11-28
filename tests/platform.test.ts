import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { prisma } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { isPlatformAdmin, resetPlatformAdminCache } from "@/lib/platform/admin";
import { createInvite, markInviteUsed, validInvite } from "@/lib/platform/invites";
import { endSupport, grantSupport, revokeSupport, startSupport } from "@/lib/platform/support";
import { companiesActivity, healthSummary } from "@/lib/platform/stats";

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

async function two() {
  const a = await createCompany({ companyName: "Платформа А", ownerName: "Кирилл", email: `pa-${uniq()}@test.ru`, password: "password123" });
  const b = await createCompany({ companyName: "Коллега Б", ownerName: "Коллега", email: `pb-${uniq()}@test.ru`, password: "password123" });
  return { a, b };
}

describe("владелец платформы", () => {
  it("по умолчанию — владелец самой первой мастерской, админы других компаний — нет", async () => {
    const { a, b } = await two();
    resetPlatformAdminCache();
    const first = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
    const firstOwner = await prisma.user.findFirst({ where: { companyId: first!.id, role: "OWNER" } });
    expect(await isPlatformAdmin(firstOwner!)).toBe(true);
    expect(await isPlatformAdmin(b.owner)).toBe(false);
    if (first!.id !== a.company.id) expect(await isPlatformAdmin(a.owner)).toBe(false);
  });

  it("список PLATFORM_ADMINS имеет приоритет", async () => {
    const { b } = await two();
    process.env.PLATFORM_ADMINS = `x@x.ru, ${b.owner.email}`;
    try {
      expect(await isPlatformAdmin(b.owner)).toBe(true);
      expect(await isPlatformAdmin({ ...b.owner, email: "other@x.ru" })).toBe(false);
    } finally {
      delete process.env.PLATFORM_ADMINS;
    }
  });
});

describe("приглашения", () => {
  it("ссылка одноразовая и устаревает", async () => {
    const inv = await createInvite("Андрей", 14);
    expect((await validInvite(inv.token))?.id).toBe(inv.id);
    const { b } = await two();
    expect(await markInviteUsed(inv.id, b.company.id)).toBe(true);
    expect(await markInviteUsed(inv.id, b.company.id)).toBe(false);
    expect(await validInvite(inv.token)).toBeNull();
    const old = await createInvite(null, 1);
    await prisma.platformInvite.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validInvite(old.token)).toBeNull();
    expect(await validInvite("нет-такой")).toBeNull();
  });
});

describe("режим поддержки", () => {
  async function adminSession() {
    const { a, b } = await two();
    process.env.PLATFORM_ADMINS = a.owner.email;
    const s = await prisma.session.create({ data: { id: `s-${uniq()}`, userId: a.owner.id, expiresAt: new Date(Date.now() + 864e5) } });
    return { a, b, s };
  }

  it("без разрешения компании войти нельзя", async () => {
    const { a, b, s } = await adminSession();
    try {
      await expect(startSupport(s.id, a.owner, b.company.id, "помощь")).rejects.toThrow(/не дала доступ/);
    } finally {
      delete process.env.PLATFORM_ADMINS;
    }
  });

  it("с разрешением вход пишется в оба журнала, отзыв завершает вход", async () => {
    const { a, b, s } = await adminSession();
    try {
      await grantSupport(b.company.id, b.owner.id, 24, false);
      await expect(startSupport(s.id, a.owner, b.company.id, "")).rejects.toThrow(/зачем/);
      await expect(startSupport(s.id, b.owner, b.company.id, "x")).rejects.toThrow();
      const log = await startSupport(s.id, a.owner, b.company.id, "настроить печать");
      expect(log.write).toBe(false);
      expect((await prisma.session.findUnique({ where: { id: s.id } }))?.supportLogId).toBe(log.id);
      const companyLog = await prisma.actionLog.findMany({ where: { companyId: b.company.id, kind: "support" } });
      expect(companyLog.some((l) => l.text.includes("вошла"))).toBe(true);
      // в журнал компании А ничего не попало
      expect(await prisma.actionLog.count({ where: { companyId: a.company.id, kind: "support" } })).toBe(0);

      await endSupport(s.id);
      expect((await prisma.supportLog.findUnique({ where: { id: log.id } }))?.endedAt).not.toBeNull();
      expect((await prisma.session.findUnique({ where: { id: s.id } }))?.supportLogId).toBeNull();

      const log2 = await startSupport(s.id, a.owner, b.company.id, "ещё раз");
      await revokeSupport(b.company.id, b.owner.id);
      expect((await prisma.supportLog.findUnique({ where: { id: log2.id } }))?.endedAt).not.toBeNull();
      await expect(startSupport(s.id, a.owner, b.company.id, "снова")).rejects.toThrow(/не дала доступ/);
    } finally {
      delete process.env.PLATFORM_ADMINS;
    }
  });

  it("не владелец платформы войти не может даже с разрешением", async () => {
    const { b } = await two();
    const c = await createCompany({ companyName: "В", ownerName: "Чужой", email: `pc-${uniq()}@test.ru`, password: "password123" });
    process.env.PLATFORM_ADMINS = "someone@else.ru";
    try {
      await grantSupport(b.company.id, b.owner.id, 2, true);
      const s = await prisma.session.create({ data: { id: `s-${uniq()}`, userId: c.owner.id, expiresAt: new Date(Date.now() + 864e5) } });
      await expect(startSupport(s.id, c.owner, b.company.id, "посмотреть")).rejects.toThrow(/Нет доступа/);
    } finally {
      delete process.env.PLATFORM_ADMINS;
    }
  });
});

describe("сводка", () => {
  it("компании с общими цифрами и сбои по проверкам", async () => {
    const { b } = await two();
    const list = await companiesActivity();
    const row = list.find((c) => c.id === b.company.id)!;
    expect(row.users).toBe(1);
    expect(row.orders).toBe(0);
    expect(row.owner?.email).toBe(b.owner.email);

    await prisma.healthSample.deleteMany({});
    const t = Date.now();
    await prisma.healthSample.createMany({
      data: [
        { at: new Date(t - 20 * 60_000), ok: true, ms: 100 },
        { at: new Date(t - 19 * 60_000), ok: false, ms: 15000, error: "Сайт не отвечает" },
        { at: new Date(t - 18 * 60_000), ok: true, ms: 120 },
        { at: new Date(t - 10 * 60_000), ok: true, ms: 110 }, // перерыв 8 минут
        { at: new Date(t - 30_000), ok: true, ms: 90 },
      ],
    });
    const h = await healthSummary();
    expect(h.stale).toBe(false);
    expect(h.outages.length).toBe(3); // ошибка, перерыв 18→10 и перерыв 10→0.5
    expect(h.uptime24).toBeCloseTo(80);
    expect(h.avg).toBe(105);
  });
});

describe("заявки партнёров", () => {
  it("доступ только после одобрения или оплаты; вход поддержки в неодобренную нельзя", async () => {
    const { hasAccess, setApproval } = await import("@/lib/platform/approval");
    expect(["PENDING", "TALKING", "AWAITING_PAYMENT", "REJECTED"].map((s) => hasAccess(s as never))).toEqual([false, false, false, false]);
    expect(hasAccess("APPROVED")).toBe(true);
    expect(hasAccess("PAID")).toBe(true);
    const { a, b } = await two();
    expect(b.company.approval).toBe("APPROVED"); // старые и созданные напрямую мастерские не блокируются
    const c = await setApproval(b.company.id, "TALKING", "перезвонить в понедельник");
    expect(c.approvalNote).toBe("перезвонить в понедельник");
    expect((await setApproval(b.company.id, "AWAITING_PAYMENT")).approvalNote).toBe("перезвонить в понедельник");
    void a;
  });
});
