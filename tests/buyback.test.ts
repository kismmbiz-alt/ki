import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { addManualListing, buybackRating, buyListing, ingestPosts, rejectListing, releaseListing, takeListing } from "@/lib/domain/buyback";
import { createSale } from "@/lib/domain/sales";
import { cashBalance } from "@/lib/domain/cash";
import { extractPrice, makeTitle, matchesQuery } from "@/lib/collectors/text";
import { parseVkResponse, parseVkUrl } from "@/lib/collectors/vk";
import { parseTelegramHtml, parseTelegramUrl } from "@/lib/collectors/telegram";
import bcrypt from "bcryptjs";
const hashPassword = (p: string) => bcrypt.hash(p, 4);

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

async function setup() {
  const a = await createCompany({ companyName: "Мастерская А", ownerName: "Кирилл", email: `a-${uniq()}@test.ru`, password: "password123" });
  const b = await createCompany({ companyName: "Мастерская Б", ownerName: "Коллега", email: `b-${uniq()}@test.ru`, password: "password123" });
  const ta = tenant(a.company.id);
  const tb = tenant(b.company.id);
  const ivan = await ta.db.user.create({
    data: { companyId: a.company.id, email: `ivan-${uniq()}@test.ru`, name: "Иван", passwordHash: await hashPassword("password123"), role: "MANAGER" },
  });
  const petr = await ta.db.user.create({
    data: { companyId: a.company.id, email: `petr-${uniq()}@test.ru`, name: "Пётр", passwordHash: await hashPassword("password123"), role: "MASTER" },
  });
  const source = await ta.db.listingSource.create({
    data: { companyId: a.company.id, kind: "TELEGRAM", name: "Барахолка", url: `https://t.me/bar_${uniq()}`, keywords: "iphone, айфон", stopWords: "куплю" },
  });
  return { a, b, ta, tb, ivan, petr, source };
}

const post = (n: number, text: string, daysAgo = 0) => ({
  url: `https://t.me/bar/${n}-${uniq()}`,
  text,
  postedAt: new Date(Date.now() - daysAgo * 864e5),
  photoUrl: null,
});

describe("разбор текста объявлений", () => {
  it("находит цену в разных записях", () => {
    expect(extractPrice("Продам iPhone 13, 128 гб. 35 000 руб, торг")).toBe(3_500_000);
    expect(extractPrice("цена: 42000")).toBe(4_200_000);
    expect(extractPrice("Samsung S21 — 18.500₽")).toBe(1_850_000);
    expect(extractPrice("отдам за 25к")).toBe(2_500_000);
    expect(extractPrice("iPhone 15 Pro 256")).toBeNull();
    expect(extractPrice("скидка 5 р")).toBeNull();
    expect(extractPrice("за 30000р")).toBe(3_000_000);
    expect(extractPrice("3000 рабочий")).toBeNull();
  });

  it("ключевые и стоп-слова, без учёта регистра и ё", () => {
    expect(matchesQuery("Продам АЙФОН 12", "iphone, айфон", "")).toBe(true);
    expect(matchesQuery("Куплю айфон дорого", "айфон", "куплю")).toBe(false);
    expect(matchesQuery("Продам велосипед", "iphone", "")).toBe(false);
    expect(matchesQuery("Что угодно", "", "")).toBe(true);
    expect(matchesQuery("Самсунг, ёмкая батарея", "емкая", "")).toBe(true);
  });

  it("заголовок — первая строка", () => {
    expect(makeTitle("\n  Продам iPhone 12  \nв идеале")).toBe("Продам iPhone 12");
    expect(makeTitle("x".repeat(150))).toHaveLength(98);
  });
});

describe("ВКонтакте и Telegram", () => {
  it("разбирает ссылки", () => {
    expect(parseVkUrl("https://vk.com/baraholka_spb")).toEqual({ domain: "baraholka_spb" });
    expect(parseVkUrl("vk.com/club12345")).toEqual({ owner_id: "-12345" });
    expect(parseVkUrl("https://m.vk.com/public777/")).toEqual({ owner_id: "-777" });
    expect(() => parseVkUrl("https://avito.ru/x")).toThrow();
    expect(parseTelegramUrl("https://t.me/s/phones_msk")).toBe("phones_msk");
    expect(parseTelegramUrl("@phones_msk")).toBe("phones_msk");
    expect(() => parseTelegramUrl("https://t.me/joinchat/abcdef")).toThrow();
  });

  it("разбирает ответ API ВК и пропускает рекламу", () => {
    const posts = parseVkResponse({
      response: {
        items: [
          { id: 10, owner_id: -5, date: 1_700_000_000, text: "Продам iPhone 11 — 15000р", attachments: [{ type: "photo", photo: { sizes: [{ url: "s", width: 100 }, { url: "big", width: 800 }] } }] },
          { id: 11, owner_id: -5, date: 1_700_000_100, text: "Реклама", marked_as_ads: 1 },
          { id: 12, owner_id: -5, date: 1_700_000_200, text: "" },
        ],
      },
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ url: "https://vk.com/wall-5_10", photoUrl: "big" });
    expect(() => parseVkResponse({ error: { error_code: 15, error_msg: "Access denied" } })).toThrow("закрыта");
  });

  it("разбирает веб-версию Telegram-канала", () => {
    const html = `<div class="tgme_channel_info"></div>
      <div class="tgme_widget_message" data-post="phones/101">
        <a class="tgme_widget_message_photo_wrap" style="width:100px;background-image:url('https://cdn/p.jpg')"></a>
        <div class="tgme_widget_message_text">Продам <b>iPhone 12</b><br/>цена 30 000 руб</div>
        <a class="tgme_widget_message_date"><time datetime="2026-11-26T10:00:00+00:00"></time></a>
      </div>
      <div class="tgme_widget_message" data-post="phones/102"><div class="tgme_widget_message_text"></div></div>`;
    const posts = parseTelegramHtml(html, "phones");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://t.me/phones/101");
    expect(posts[0].text).toBe("Продам iPhone 12\nцена 30 000 руб");
    expect(posts[0].photoUrl).toBe("https://cdn/p.jpg");
    expect(posts[0].postedAt?.toISOString()).toBe("2026-11-26T10:00:00.000Z");
    expect(() => parseTelegramHtml("<html></html>", "nope")).toThrow();
  });
});

describe("лента и выкуп", () => {
  it("в ленту попадают только свежие подходящие посты, без дублей", async () => {
    const { ta, source } = await setup();
    const p1 = post(1, "Продам iPhone 12 за 30000р");
    const added = await ingestPosts(ta, source, [p1, post(2, "Куплю айфон"), post(3, "Продам диван"), post(4, "айфон 8", 10)]);
    expect(added).toBe(1);
    expect(await ingestPosts(ta, source, [p1])).toBe(0);
    const [l] = await ta.db.listing.findMany();
    expect(l).toMatchObject({ title: "Продам iPhone 12 за 30000р", price: 3_000_000, status: "NEW" });
  });

  it("объявление берёт только один сотрудник", async () => {
    const { ta, ivan, petr, source } = await setup();
    await ingestPosts(ta, source, [post(1, "iphone 13")]);
    const l = await ta.db.listing.findFirstOrThrow();
    const results = await Promise.allSettled([takeListing(ta, l.id, ivan.id), takeListing(ta, l.id, petr.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const owner = (await ta.db.listing.findUniqueOrThrow({ where: { id: l.id } })).assigneeId!;
    const other = owner === ivan.id ? petr.id : ivan.id;
    await expect(rejectListing(ta, l.id, { userId: other, isAdmin: false }, "")).rejects.toThrow("другого сотрудника");
    await releaseListing(ta, l.id, { userId: owner, isAdmin: false });
    expect((await ta.db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("NEW");
  });

  it("выкуп: техника на склад, расход из кассы, место в рейтинге и прибыль после продажи", async () => {
    const { a, ta, ivan, petr, source } = await setup();
    await ingestPosts(ta, source, [post(1, "iphone 13 128 — 35000р"), post(2, "iphone 11 — 15000р")]);
    const [l1, l2] = await ta.db.listing.findMany({ orderBy: { title: "asc" } });
    await takeListing(ta, l1.id, ivan.id);
    await takeListing(ta, l2.id, ivan.id);
    const actor = { userId: ivan.id, isAdmin: false };
    const bought = await buyListing(ta, { id: l1.id, actor, locationId: a.location.id, buyPrice: 1_400_000, productName: "iPhone 11", salePrice: 2_000_000, method: "CASH" });
    await expect(buyListing(ta, { id: l1.id, actor, locationId: a.location.id, buyPrice: 1, productName: "x", method: "CASH" })).rejects.toThrow("уже выкуплено");

    const stock = await ta.db.stock.findFirstOrThrow({ where: { productId: bought.productId! } });
    expect(stock.qty).toBe(1);
    expect((await cashBalance(ta, a.location.id)).CASH).toBe(-1_400_000);

    await createSale(ta, { locationId: a.location.id, userId: ivan.id, method: "CARD", items: [{ productId: bought.productId!, qty: 1 }] });
    await rejectListing(ta, l2.id, actor, "дорого");

    const now = new Date();
    const rating = await buybackRating(ta, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1));
    expect(rating[0]).toMatchObject({ userId: ivan.id, bought: 1, spent: 1_400_000, sold: 1, profit: 600_000 });
    expect(rating.find((r) => r.userId === petr.id)).toMatchObject({ bought: 0 });
  });

  it("ручное добавление и защита от дублей", async () => {
    const { ta, ivan } = await setup();
    const l = await addManualListing(ta, { url: "https://www.avito.ru/item_1", text: "Продам Samsung S22\n20 000 ₽", userId: ivan.id, take: true });
    expect(l).toMatchObject({ title: "Продам Samsung S22", price: 2_000_000, status: "IN_WORK", assigneeId: ivan.id });
    await expect(addManualListing(ta, { url: "https://www.avito.ru/item_1", userId: ivan.id })).rejects.toThrow("уже есть");
    await expect(addManualListing(ta, { url: "просто текст", userId: ivan.id })).rejects.toThrow("ссылку");
  });

  it("другая компания не видит и не может взять чужие объявления и источники", async () => {
    const { b, ta, tb, source } = await setup();
    await ingestPosts(ta, source, [post(1, "iphone x")]);
    const l = await ta.db.listing.findFirstOrThrow();
    expect(await tb.db.listing.findMany()).toHaveLength(0);
    expect(await tb.db.listingSource.findMany()).toHaveLength(0);
    await expect(takeListing(tb, l.id, b.owner.id)).rejects.toThrow();
    await expect(buyListing(tb, { id: l.id, actor: { userId: b.owner.id, isAdmin: true }, locationId: b.location.id, buyPrice: 100, productName: "x", method: "CASH" })).rejects.toThrow();
    // объявление нельзя привязать к чужому источнику
    await expect(ingestPosts(tb, source, [post(2, "iphone y")])).rejects.toThrow();
    expect((await ta.db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("NEW");
  });
});
