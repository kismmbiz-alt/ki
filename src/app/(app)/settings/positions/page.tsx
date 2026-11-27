import { requirePermission } from "@/lib/auth";
import { btn, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { BASE_ROLE_LABEL, PERMS, type Permission } from "@/lib/perms";
import { ensurePositions } from "@/lib/domain/places";
import { SettingsTabs } from "../tabs";
import { savePositionAction } from "../actions";

const GROUPS = [...new Set(PERMS.map((p) => p.group))];

function PermBoxes({ on }: { on: readonly string[] }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</div>
          {PERMS.filter((p) => p.group === g).map((p) => (
            <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm text-slate-700">
              <input type="checkbox" name="perms" value={p.key} defaultChecked={on.includes(p.key)} className="mt-0.5" />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

const roleOptions = (Object.keys(BASE_ROLE_LABEL) as (keyof typeof BASE_ROLE_LABEL)[]).map((r) => (
  <option key={r} value={r}>
    {BASE_ROLE_LABEL[r]}
  </option>
));

export default async function PositionsPage() {
  const ctx = await requirePermission("users");
  await ensurePositions({ db: ctx.db, companyId: ctx.company.id });
  const [positions, counts] = await Promise.all([
    ctx.db.position.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    ctx.db.user.groupBy({ by: ["positionId"], where: { isActive: true }, _count: true }),
  ]);
  const countBy = new Map(counts.map((c) => [c.positionId, c._count]));
  const newDefaults: Permission[] = ["stock"];

  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs />
      <p className="mb-4 max-w-3xl text-sm text-slate-500">
        Отметьте, что может делать каждая должность. Владелец всегда может всё. «Мастер» в типе доступа значит, что сотрудник попадает в список мастеров в заказе. Изменения действуют сразу.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {positions.map((p) => (
          <Card key={p.id} title={p.name} actions={<span className="text-sm text-slate-500">сотрудников: {countBy.get(p.id) ?? 0}</span>}>
            <Form action={savePositionAction} className="space-y-3" resetOnOk={false}>
              <input type="hidden" name="id" value={p.id} />
              <div className="grid grid-cols-[1fr_1fr_70px] gap-2">
                <Field label="Название">
                  <Input name="name" defaultValue={p.name} />
                </Field>
                <Field label="Тип доступа">
                  <Select name="baseRole" defaultValue={p.baseRole === "OWNER" ? "ADMIN" : p.baseRole}>
                    {roleOptions}
                  </Select>
                </Field>
                <Field label="Порядок">
                  <Input name="sort" defaultValue={String(p.sort)} inputMode="numeric" />
                </Field>
              </div>
              <PermBoxes on={p.perms} />
              <div className="flex gap-2 border-t border-slate-100 pt-3">
                <Submit variant="secondary">Сохранить</Submit>
                {!countBy.get(p.id) && (
                  <button name="delete" value="1" className={btn("danger")} formNoValidate>
                    Удалить
                  </button>
                )}
              </div>
            </Form>
          </Card>
        ))}
        <Card title="Новая должность">
          <Form action={savePositionAction} className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_70px] gap-2">
              <Field label="Название *">
                <Input name="name" required placeholder="Например: Старший мастер" />
              </Field>
              <Field label="Тип доступа">
                <Select name="baseRole" defaultValue="MANAGER">
                  {roleOptions}
                </Select>
              </Field>
              <Field label="Порядок">
                <Input name="sort" defaultValue={String(positions.length)} inputMode="numeric" />
              </Field>
            </div>
            <PermBoxes on={newDefaults} />
            <Submit>Добавить должность</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
