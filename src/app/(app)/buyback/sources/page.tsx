import { requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SOURCE_KIND_LABEL } from "@/lib/domain/buyback";
import { CHECK_EVERY_MIN } from "@/lib/collectors";
import { BuybackTabs } from "../tabs";
import { checkSourceAction, createSourceAction, deleteSourceAction, updateSourceAction } from "../actions";

export default async function SourcesPage() {
  const ctx = await requirePermission("buybackSources");
  const sources = await ctx.db.listingSource.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { listings: true } } },
  });
  const noVkKey = !process.env.VK_SERVICE_TOKEN;

  return (
    <>
      <PageHeader title="Скупка техники" />
      <BuybackTabs admin />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm text-slate-600">
            CRM проверяет каждый источник раз в {CHECK_EVERY_MIN} минут и добавляет в ленту новые посты с вашими ключевыми словами. Телефоны продавцов не
            сохраняются — в ленте только ссылка на пост.
          </p>
          {noVkKey && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Для групп ВКонтакте на сервере нужен сервисный ключ ВК (VK_SERVICE_TOKEN). Как его получить — в инструкции. Telegram работает без ключа.
            </p>
          )}
          {sources.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Источников пока нет. Добавьте первую группу или канал справа.
            </div>
          )}
          {sources.map((s) => (
            <Card
              key={s.id}
              title={
                <span>
                  <span className="text-slate-500">{SOURCE_KIND_LABEL[s.kind]} ·</span> {s.name}
                  {!s.isActive && <span className="ml-2 text-xs text-slate-400">(выключен)</span>}
                </span>
              }
              actions={
                <Form action={checkSourceAction} resetOnOk={false}>
                  <input type="hidden" name="id" value={s.id} />
                  <Submit variant="secondary">Проверить сейчас</Submit>
                </Form>
              }
            >
              <div className="mb-3 text-xs text-slate-500">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {s.url}
                </a>{" "}
                · всего объявлений: {s._count.listings}
                {s.lastCheckedAt && (
                  <>
                    {" "}
                    · проверен {dt(s.lastCheckedAt)}
                    {!s.lastError && <>, новых: {s.lastFound}</>}
                  </>
                )}
              </div>
              {s.lastError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Ошибка: {s.lastError}</p>}
              <Form action={updateSourceAction} className="grid gap-2 sm:grid-cols-2" resetOnOk={false}>
                <input type="hidden" name="id" value={s.id} />
                <Field label="Название">
                  <Input name="name" defaultValue={s.name} required />
                </Field>
                <Field label="Состояние">
                  <Select name="isActive" defaultValue={s.isActive ? "1" : "0"}>
                    <option value="1">Включён</option>
                    <option value="0">Выключен</option>
                  </Select>
                </Field>
                <Field label="Ключевые слова" hint="через запятую; пусто — все посты">
                  <Input name="keywords" defaultValue={s.keywords} />
                </Field>
                <Field label="Стоп-слова" hint="такие посты пропускаем">
                  <Input name="stopWords" defaultValue={s.stopWords} />
                </Field>
                <div className="sm:col-span-2">
                  <Submit variant="secondary">Сохранить</Submit>
                </div>
              </Form>
              <Form action={deleteSourceAction} className="mt-2" resetOnOk={false}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="name" value={s.name} />
                <Submit variant="danger">Удалить источник</Submit>
              </Form>
            </Card>
          ))}
        </div>
        <Card title="Новый источник">
          <Form action={createSourceAction} className="space-y-3">
            <Field label="Ссылка на группу ВК или Telegram-канал *" hint="Авито и Юла — на следующем этапе">
              <Input name="url" required placeholder="https://vk.com/baraholka_spb" />
            </Field>
            <Field label="Название">
              <Input name="name" placeholder="Барахолка СПб" />
            </Field>
            <Field label="Ключевые слова" hint="через запятую">
              <Input name="keywords" placeholder="iphone, айфон, samsung, ноутбук" />
            </Field>
            <Field label="Стоп-слова" hint="например: куплю, ремонт, чехол">
              <Input name="stopWords" defaultValue="куплю, ремонт, чехол" />
            </Field>
            <Submit>Добавить и проверить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
