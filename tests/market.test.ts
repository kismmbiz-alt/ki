import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { prisma, tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { bonusFor, buybackResults, buyListing, ingestPosts, takeListing } from "@/lib/domain/buyback";
import { createSale } from "@/lib/domain/sales";
import { parseDevice } from "@/lib/market/device";
import { estimate, marketTable, priceStats, pricesByCondition, snapshotCompany, suggestedBuyPrice } from "@/lib/market/prices";
import { parseAvitoDate, parseAvitoHtml, parseAvitoUrl } from "@/lib/collectors/avito";

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("распознавание техники в объявлении", () => {
  it("модель, память, АКБ и комплект", () => {
    const d = parseDevice("Продам iPhone 13 Pro 256gb, акб 87%, полный комплект, без царапин");
    expect(d).toMatchObject({ model: "iPhone 13 Pro", memoryGb: 256, batteryPct: 87, defects: [], replacements: [] });
    expect(d.kit).toContain("Полный комплект");
  });

  it("дефекты и замены, слабая батарея", () => {
    const d = parseDevice("айфон 11 64 гб. Есть сколы на корпусе, менялся экран. Аккумулятор 76%");
    expect(d.model).toBe("iPhone 11");
    expect(d.memoryGb).toBe(64);
    expect(d.defects.join()).toMatch(/Сколы/);
    expect(d.replacements.join()).toMatch(/экран/i);
    expect(d.defects.join() + d.replacements.join()).toMatch(/АКБ 76%/);
  });

  it("Pro Max не путается с Pro, 1 ТБ распознаётся", () => {
    expect(parseDevice("iphone 15 pro max 1tb").model).toBe("iPhone 15 Pro Max");
    expect(parseDevice("iphone 15 pro max 1tb").memoryGb).toBe(1024);
  });
});

describe("состояние и цвет, как в оценке Авито", () => {
  it("определяет состояние по тексту", () => {
    expect(parseDevice("iPhone 13 128 запечатанный, не активирован").condition).toBe("NEW");
    expect(parseDevice("iPhone 13 128, как новый, идеал").condition).toBe("EXCELLENT");
    expect(parseDevice("iPhone 13 128, есть потертости").condition).toBe("GOOD");
    expect(parseDevice("iPhone 13 128").condition).toBe("GOOD");
    expect(parseDevice("iPhone 13 128, скол на рамке").condition).toBe("FAIR");
    expect(parseDevice("iPhone 13 128 менялся экран, идеал").condition).toBe("FAIR");
    expect(parseDevice("iPhone 13 128 разбит экран").condition).toBe("REPAIR");
    expect(parseDevice("iPhone 13 на запчасти").condition).toBe("REPAIR");
    expect(parseDevice("iPhone 13, новый аккумулятор, идеал").condition).toBe("EXCELLENT");
  });

  it("определяет цвет и не путает похожие слова", () => {
    expect(parseDevice("iPhone 13 Pro Sierra Blue").color).toBe("голубой");
    expect(parseDevice("айфон 13 про графит").color).toBe("серый");
    expect(parseDevice("iPhone 12 черный").color).toBe("черный");
    expect(parseDevice("iPhone 12, серийный номер чистый, сервис").color).toBeNull();
  });

  it("цена по состояниям: где мало объявлений — пересчёт от соседних", () => {
    const rows = [30_000, 31_000, 32_000, 33_000].map((p) => ({ price: p * 100, condition: "GOOD" as const, color: null }));
    const r = pricesByCondition(rows);
    expect(r.GOOD).toMatchObject({ derived: false, stats: { median: 3_150_000, count: 4 } });
    expect(r.REPAIR.derived).toBe(true);
    expect(r.REPAIR.stats!.median).toBe(1_730_000); // 31 500 × 0.55
    expect(r.EXCELLENT.stats!.median).toBeGreaterThan(r.GOOD.stats!.median);
  });
});

describe("цена рынка", () => {
  it("медиана без выбросов и предложенная цена", () => {
    const s = priceStats([100, 4_000_000, 4_200_000, 4_400_000, 4_500_000, 9_900_000])!;
    expect(s.count).toBe(4);
    expect(s.median).toBe(4_300_000);
    expect(suggestedBuyPrice(s.median, 500_000)).toBe(3_800_000);
    expect(suggestedBuyPrice(4_321_000, 500_000)).toBe(3_800_000); // вниз до 500 ₽
    expect(priceStats([])).toBeNull();
  });

  it("таблица рынка берёт только чистые объявления своей компании, снимок сохраняется", async () => {
    const a = await createCompany({ companyName: "А", ownerName: "Кирилл", email: `m-${uniq()}@test.ru`, password: "password123" });
    const b = await createCompany({ companyName: "Б", ownerName: "Коллега", email: `n-${uniq()}@test.ru`, password: "password123" });
    const ta = tenant(a.company.id);
    const tb = tenant(b.company.id);
    const src = await ta.db.listingSource.create({ data: { companyId: a.company.id, kind: "TELEGRAM", name: "x", url: `https://t.me/x_${uniq()}` } });
    const p = (text: string) => ({ url: `https://t.me/x/${uniq()}`, text, postedAt: new Date(), photoUrl: null });
    await ingestPosts(ta, src, [
      p("iPhone 12 128гб 30000р"),
      p("iPhone 12 128 гб 32000р"),
      p("iPhone 12 128gb 34000р"),
      p("iPhone 12 128 разбит экран 10000р"),
    ]);
    const cells = await marketTable(ta);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ model: "iPhone 12", memoryGb: 128, median: 3_200_000, count: 3 });
    expect(await marketTable(tb)).toHaveLength(0);
    expect(await snapshotCompany(a.company.id)).toBe(1);
    const est = await estimate(ta, "iPhone 12", 128, { condition: "REPAIR" });
    expect(est.counts.listings).toBe(4);
    expect(est.picked).toMatchObject({ derived: true });
    expect(est.byCondition.GOOD.stats!.median).toBe(3_200_000);
    expect(est.example?.title).toMatch(/разбит/);
    expect(await ta.db.marketSnapshot.count()).toBe(1);
    expect(await tb.db.marketSnapshot.count()).toBe(0);
  });
});

describe("бонусы за выкуп", () => {
  it("фиксированный бонус + процент от прибыли после продажи", async () => {
    expect(bonusFor(50_000, 600_000, 10)).toBe(110_000);
    expect(bonusFor(50_000, -100_000, 10)).toBe(50_000);

    const a = await createCompany({ companyName: "А", ownerName: "Кирилл", email: `k-${uniq()}@test.ru`, password: "password123" });
    await prisma.company.update({ where: { id: a.company.id }, data: { bonusFixed: 50_000, bonusPercent: 10 } });
    const ta = tenant(a.company.id);
    const src = await ta.db.listingSource.create({ data: { companyId: a.company.id, kind: "TELEGRAM", name: "x", url: `https://t.me/y_${uniq()}` } });
    await ingestPosts(ta, src, [{ url: `https://t.me/y/${uniq()}`, text: "iPhone 13 128 35000р", postedAt: new Date(), photoUrl: null }]);
    const l = await ta.db.listing.findFirstOrThrow();
    await takeListing(ta, l.id, a.owner.id);
    const actor = { userId: a.owner.id, isAdmin: true };
    const bought = await buyListing(ta, { id: l.id, actor, locationId: a.location.id, buyPrice: 1_400_000, productName: "iPhone 13", salePrice: 2_000_000, method: "CASH" });
    expect(bought.bonus).toBe(50_000);

    const from = new Date(Date.now() - 864e5);
    const to = new Date(Date.now() + 864e5);
    let r = await buybackResults(ta, from, to);
    expect(r.total).toMatchObject({ bought: 1, sold: 0, bonus: 50_000 });

    await createSale(ta, { locationId: a.location.id, userId: a.owner.id, method: "CARD", items: [{ productId: bought.productId!, qty: 1 }] });
    r = await buybackResults(ta, from, to);
    expect(r.total).toMatchObject({ bought: 1, sold: 1, profit: 600_000, bonus: 110_000 });
    expect(r.items[0]).toMatchObject({ model: "iPhone 13", memoryGb: 128, userId: a.owner.id, bonus: 110_000 });
  });
});

describe("Авито", () => {
  it("ссылки", () => {
    expect(parseAvitoUrl("avito.ru/moskva/telefony?q=iphone")).toBe("https://www.avito.ru/moskva/telefony?q=iphone&s=104");
    expect(() => parseAvitoUrl("https://youla.ru/x")).toThrow("Авито");
  });

  it("даты", () => {
    const now = new Date("2026-11-27T12:00:00");
    expect(parseAvitoDate("2 часа назад", now)?.getTime()).toBe(now.getTime() - 2 * 36e5);
    expect(parseAvitoDate("вчера", now)?.getTime()).toBe(now.getTime() - 864e5);
    expect(parseAvitoDate("12 ноября", now)?.getDate()).toBe(12);
  });

  it("страница поиска и блокировка", () => {
    const html = `<html><head><title>Купить iPhone</title></head><body>
      <div data-marker="item"><a data-marker="item-title" href="/moskva/telefony/iphone_13_128_123?context=x" title="iPhone 13, 128 ГБ"></a>
      <meta itemprop="price" content="38000"><meta itemprop="description" content="АКБ 90%, коробка"><div data-marker="item-date">3 часа назад</div></div>
      </body></html>`;
    const [p] = parseAvitoHtml(html);
    expect(p).toMatchObject({ url: "https://www.avito.ru/moskva/telefony/iphone_13_128_123", title: "iPhone 13, 128 ГБ", price: 3_800_000 });
    expect(p.text).toMatch(/АКБ 90%/);
    expect(() => parseAvitoHtml("<html><head><title>Доступ ограничен: проблема с IP</title></head></html>")).toThrow("заблокировал");
  });
});
