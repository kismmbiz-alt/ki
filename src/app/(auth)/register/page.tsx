import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { validInvite } from "@/lib/platform/invites";
import { register } from "../actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string; code?: string }> }) {
  const { invite: token, code } = await searchParams;
  const invite = await validInvite(token);
  // постоянная ссылка для партнёров: /register?code=<код приглашения>
  const linkCode = !invite && code && code === process.env.REGISTRATION_CODE ? code : null;
  const needCode = !invite && !linkCode && !!process.env.REGISTRATION_CODE;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Регистрация мастерской</h1>
      <p className="mb-4 text-sm text-slate-500">Создаётся отдельная компания. Её данные видят только её сотрудники.</p>
      {token && !invite && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Эта ссылка-приглашение уже использована или устарела. Попросите новую или введите код приглашения.
        </p>
      )}
      <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
        После регистрации заявку подтвердит главный администратор — тогда откроется доступ к CRM.
      </p>
      {invite && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Вас пригласили в ТехноСкупку. Заполните форму — код не нужен.</p>}
      <Form action={register} className="space-y-3" resetOnOk={false}>
        {invite && <input type="hidden" name="invite" value={invite.token} />}
        {linkCode && <input type="hidden" name="code" value={linkCode} />}
        {needCode && (
          <Field label="Код приглашения" hint="выдаёт владелец системы">
            <Input name="inviteCode" required />
          </Field>
        )}
        <Field label="Название мастерской">
          <Input name="companyName" required placeholder="Сервис «Ремонт у дома»" />
        </Field>
        <Field label="Первая точка">
          <Input name="locationName" placeholder="Основная точка" />
        </Field>
        <Field label="Телефон мастерской">
          <Input name="phone" type="tel" />
        </Field>
        <Field label="Ваше имя">
          <Input name="ownerName" required />
        </Field>
        <Field label="Email для входа">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Пароль" hint="не короче 8 символов">
          <Input name="password" type="password" required minLength={8} />
        </Field>
        <Field label="Повторите пароль">
          <Input name="password2" type="password" required minLength={8} />
        </Field>
        <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptTerms" value="1" required className="mt-0.5" />
            <span>
              Принимаю{" "}
              <a href="/legal/terms" target="_blank" className="text-blue-600 hover:underline">
                Пользовательское соглашение
              </a>{" "}
              (в том числе запрет передавать доступ и пригласительные ссылки третьим лицам) и{" "}
              <a href="/legal/dpa" target="_blank" className="text-blue-600 hover:underline">
                Поручение на обработку персональных данных клиентов
              </a>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptConsent" value="1" required className="mt-0.5" />
            <span>
              Даю{" "}
              <a href="/legal/consent" target="_blank" className="text-blue-600 hover:underline">
                согласие на обработку персональных данных
              </a>{" "}
              и ознакомлен(а) с{" "}
              <a href="/legal/privacy" target="_blank" className="text-blue-600 hover:underline">
                Политикой обработки персональных данных
              </a>
            </span>
          </label>
        </div>
        <Submit className="w-full">Создать мастерскую</Submit>
      </Form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Уже есть аккаунт? <Link href="/login" className="text-blue-600 hover:underline">Войти</Link>
      </p>
    </>
  );
}
