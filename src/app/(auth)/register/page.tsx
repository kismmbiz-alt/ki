import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { validInvite } from "@/lib/platform/invites";
import { register } from "../actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite: token } = await searchParams;
  const invite = await validInvite(token);
  const needCode = !invite && !!process.env.REGISTRATION_CODE;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Регистрация мастерской</h1>
      <p className="mb-4 text-sm text-slate-500">Создаётся отдельная компания. Её данные видят только её сотрудники.</p>
      {token && !invite && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Эта ссылка-приглашение уже использована или устарела. Попросите новую или введите код приглашения.
        </p>
      )}
      {invite && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Вас пригласили в ТехноСкупку. Заполните форму — код не нужен.</p>}
      <Form action={register} className="space-y-3" resetOnOk={false}>
        {invite && <input type="hidden" name="invite" value={invite.token} />}
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
        <Submit className="w-full">Создать мастерскую</Submit>
      </Form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Уже есть аккаунт? <Link href="/login" className="text-blue-600 hover:underline">Войти</Link>
      </p>
    </>
  );
}
