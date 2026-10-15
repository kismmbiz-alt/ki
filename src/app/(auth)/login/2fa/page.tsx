import { Form, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { verify2fa } from "../../actions";

export default function TwoFaPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Код подтверждения</h1>
      <p className="mb-4 text-sm text-slate-500">Введите 6 цифр из приложения-аутентификатора.</p>
      <Form action={verify2fa} className="space-y-3" resetOnOk={false}>
        <Field label="Код">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus />
        </Field>
        <Submit className="w-full">Подтвердить</Submit>
      </Form>
    </>
  );
}
