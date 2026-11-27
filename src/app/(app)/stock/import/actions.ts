"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { importClients, importProducts, readTable, type ImportReport } from "@/lib/domain/import";
import { importHistory, type HistoryData, type HistoryReport } from "@/lib/domain/history-import";

export type ImportState = { error?: string; report?: ImportReport; dryRun?: boolean } | undefined;

const MAX = 15 * 1024 * 1024;

export async function importAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const kind = String(fd.get("kind"));
    const ctx = await requirePermission(kind === "clients" ? "settings" : "stock");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Выберите файл" };
    if (file.size > MAX) return { error: "Файл больше 15 МБ" };
    const dryRun = fd.get("dryRun") === "1";
    const table = await readTable(file);
    const t = { db: ctx.db, companyId: ctx.company.id };
    const report =
      kind === "clients"
        ? await importClients(t, table, { dryRun })
        : await importProducts(t, table, { dryRun, locationId: requireLocation(ctx).id, userId: ctx.user.id });
    if (!dryRun) {
      revalidatePath("/stock");
      revalidatePath("/clients");
    }
    return { report, dryRun };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type HistoryState = { error?: string; report?: HistoryReport; dryRun?: boolean } | undefined;

/** Перенос заказов и продаж с датами из LiveSklad (JSON). Только владелец и администратор. */
export async function historyAction(_prev: HistoryState, fd: FormData): Promise<HistoryState> {
  try {
    const ctx = await requirePermission("settings");
    const file = fd.get("file");
    let text = String(fd.get("json") ?? "").trim();
    if (!text && file instanceof File && file.size) {
      if (file.size > MAX) return { error: "Файл больше 15 МБ" };
      text = await file.text();
    }
    if (!text) return { error: "Вставьте данные или выберите файл .json" };
    let data: HistoryData;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: "Не получилось прочитать данные: это не JSON" };
    }
    const dryRun = fd.get("dryRun") === "1";
    const report = await importHistory({ db: ctx.db, companyId: ctx.company.id }, data, { dryRun, locationId: requireLocation(ctx).id, userId: ctx.user.id });
    if (!dryRun) for (const p of ["/orders", "/sales/history", "/dashboard", "/reports", "/clients", "/cash"]) revalidatePath(p);
    return { report, dryRun };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
