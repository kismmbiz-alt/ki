"use server";

import { revalidatePath } from "next/cache";
import { requireUser, setSessionLocation } from "@/lib/auth";

export async function switchLocation(fd: FormData) {
  const ctx = await requireUser();
  const id = String(fd.get("locationId") ?? "");
  if (ctx.user.locationId) return;
  // точка должна принадлежать компании пользователя
  const loc = await ctx.db.location.findUnique({ where: { id } });
  if (loc) await setSessionLocation(ctx.session.id, loc.id);
  revalidatePath("/", "layout");
}

export async function toggleTheme() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const next = jar.get("theme")?.value === "light" ? "dark" : "light";
  jar.set("theme", next, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
