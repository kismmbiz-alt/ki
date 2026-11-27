import { headers } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, dt, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { CopyButton } from "@/components/copy-button";
import { createInviteAction, deleteInviteAction } from "../actions";
import { PlatformTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Ссылки-приглашения: коллега открывает ссылку и сам регистрирует свою мастерскую, без кода. */
export default async function PlatformInvitesPage() {
  await requirePlatformAdmin();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "texnoskupka.ru";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const base = `${proto}://${host}`;
  const [invites, companies] = await Promise.all([
    prisma.platformInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);
  const name = new Map(companies.map((c) => [c.id, c.name]));
  const now = new Date();
  const code = process.env.REGISTRATION_CODE;

  return (
    <>
      <PageHeader title="Платформа" />
      <PlatformTabs />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Пригласить коллегу">
          <Form action={createInviteAction} className="space-y-3">
            <Field label="Кому (для себя)" hint="например: Андрей, сервис на Ленина">
              <Input name="note" />
            </Field>
            <Field label="Ссылка действует">
              <Select name="days" defaultValue="14">
                <option value="3">3 дня</option>
                <option value="14">14 дней</option>
                <option value="60">60 дней</option>
              </Select>
            </Field>
            <Submit>Создать ссылку</Submit>
          </Form>
        </Card>
        <Card title="Как это работает">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Нажмите «Создать ссылку» и затем «Копировать».</li>
            <li>Отправьте ссылку коллеге в Telegram или WhatsApp.</li>
            <li>Коллега открывает ссылку, вводит название мастерской, email и пароль — и сразу попадает в свою CRM.</li>
            <li>Его мастерская полностью отдельная: он не видит ваши данные, вы — его.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Одна ссылка — одна мастерская.{" "}
            {code ? (
              <>
                Общий код приглашения тоже работает: <b>{code}</b>
              </>
            ) : (
              "Регистрация без кода открыта для всех."
            )}
          </p>
        </Card>
      </div>
      <Table head={["Создана", "Кому", "Ссылка", "Статус", ""]} empty="Приглашений пока нет">
        {invites.map((i) => {
          const url = `${base}/register?invite=${i.token}`;
          const state = i.usedAt
            ? `Использована ${dt(i.usedAt)}: ${name.get(i.companyId ?? "") ?? "компания удалена"}`
            : i.expiresAt < now
              ? "Устарела"
              : `Действует до ${dt(i.expiresAt)}`;
          return (
            <tr key={i.id}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(i.createdAt)}</td>
              <td className="px-3 py-2">{i.note}</td>
              <td className="px-3 py-2">
                {!i.usedAt && i.expiresAt >= now ? (
                  <div className="flex items-center gap-2">
                    <code className="break-all text-xs">{url}</code>
                    <CopyButton text={url} />
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className={`px-3 py-2 text-sm ${i.usedAt ? "text-green-700" : "text-slate-500"}`}>{state}</td>
              <td className="px-3 py-2">
                {!i.usedAt && (
                  <Form action={deleteInviteAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <Submit variant="danger" className="!px-2 !py-1 text-xs">
                      Удалить
                    </Submit>
                  </Form>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
