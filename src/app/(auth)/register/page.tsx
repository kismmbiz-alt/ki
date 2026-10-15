import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { register } from "../actions";

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Регистрация мастерской</h1>
      <p className="mb-4 text-sm text-slate-500">Создаётся отдельная компания. Её данные видят только её сотрудники.</p>
      <Form action={register} className="space-y-3" resetOnOk={false}>
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
