import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { login } from "../actions";

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Вход</h1>
      <Form action={login} className="space-y-3" resetOnOk={false}>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Пароль">
          <Input name="password" type="password" required autoComplete="current-password" />
        </Field>
        <Submit className="w-full">Войти</Submit>
      </Form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Нет аккаунта? <Link href="/register" className="text-blue-600 hover:underline">Зарегистрировать мастерскую</Link>
      </p>
    </>
  );
}
