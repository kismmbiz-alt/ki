import QRCode from "qrcode";
import { can, requireUser, totpUri } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { logout } from "../../(auth)/actions";
import { SettingsTabs } from "./tabs";
import { changePasswordAction, confirm2faAction, disable2faAction, saveCompanyAction, saveRequisitesAction, start2faAction } from "./actions";

export default async function SettingsPage() {
  const { user, company } = await requireUser();
  const admin = can(user, "settings");
  const qr = user.totpSecret && !user.totpEnabled ? await QRCode.toDataURL(totpUri(user.email, user.totpSecret)) : null;

  return (
    <>
      <PageHeader title="Настройки">
        <form action={logout}>
          <button className="text-sm text-slate-500 hover:text-slate-800">Выйти</button>
        </form>
      </PageHeader>
      <SettingsTabs admin={admin} />
      <div className="grid gap-4 lg:grid-cols-2">
        {admin && (
          <Card title="Мастерская" className="lg:row-span-2">
            <Form action={saveCompanyAction} className="space-y-3" resetOnOk={false}>
              <Field label="Название">
                <Input name="name" defaultValue={company.name} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Телефон">
                  <Input name="phone" defaultValue={company.phone ?? ""} />
                </Field>
                <Field label="Гарантия, дней">
                  <Input name="warrantyDays" defaultValue={String(company.warrantyDays)} />
                </Field>
              </div>
              <Field label="Адрес">
                <Input name="address" defaultValue={company.address ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email">
                  <Input name="email" defaultValue={company.email ?? ""} />
                </Field>
                <Field label="Валюта">
                  <Input name="currency" defaultValue={company.currency} />
                </Field>
              </div>
              <Field label="Условия в квитанции">
                <Textarea name="receiptTerms" rows={6} defaultValue={company.receiptTerms ?? ""} />
              </Field>
              <Field label="Доп. информация для бланков">
                <Textarea name="companyNote" rows={2} defaultValue={company.companyNote ?? ""} />
              </Field>
              <Submit>Сохранить</Submit>
            </Form>
          </Card>
        )}
        {admin && (
          <Card title="Реквизиты для документов" className="lg:row-span-2">
            <Form action={saveRequisitesAction} className="space-y-3" resetOnOk={false}>
              <div className="grid grid-cols-3 gap-2">
                <Field label="ИНН">
                  <Input name="inn" defaultValue={company.inn ?? ""} />
                </Field>
                <Field label="КПП">
                  <Input name="kpp" defaultValue={company.kpp ?? ""} />
                </Field>
                <Field label="ОГРН / ОГРНИП">
                  <Input name="ogrn" defaultValue={company.ogrn ?? ""} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Руководитель (ФИО)">
                  <Input name="director" defaultValue={company.director ?? ""} />
                </Field>
                <Field label="Должность">
                  <Input name="directorTitle" defaultValue={company.directorTitle ?? ""} placeholder="Индивидуальный предприниматель" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Действует на основании">
                  <Input name="directorBasis" defaultValue={company.directorBasis ?? ""} placeholder="Устава / свидетельства" />
                </Field>
                <Field label="Договор">
                  <Input name="contract" defaultValue={company.contract ?? ""} />
                </Field>
              </div>
              <Field label="Банк">
                <Input name="bankName" defaultValue={company.bankName ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="БИК">
                  <Input name="bik" defaultValue={company.bik ?? ""} />
                </Field>
                <Field label="SWIFT">
                  <Input name="swift" defaultValue={company.swift ?? ""} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Корр. счёт">
                  <Input name="corrAccount" defaultValue={company.corrAccount ?? ""} />
                </Field>
                <Field label="Расчётный счёт">
                  <Input name="account" defaultValue={company.account ?? ""} />
                </Field>
              </div>
              <Submit>Сохранить реквизиты</Submit>
            </Form>
          </Card>
        )}
        <Card title="Мой пароль">
          <Form action={changePasswordAction} className="space-y-3">
            <Field label="Текущий пароль">
              <Input name="current" type="password" required />
            </Field>
            <Field label="Новый пароль">
              <Input name="next" type="password" required minLength={8} />
            </Field>
            <Submit variant="secondary">Сменить пароль</Submit>
          </Form>
        </Card>
        <Card title="Двухфакторная защита входа">
          {user.totpEnabled ? (
            <Form action={disable2faAction} className="space-y-3">
              <p className="text-sm text-green-700">Включена. При входе нужен код из приложения.</p>
              <Field label="Чтобы выключить, введите код">
                <Input name="code" inputMode="numeric" required />
              </Field>
              <Submit variant="danger">Выключить 2FA</Submit>
            </Form>
          ) : qr ? (
            <Form action={confirm2faAction} className="space-y-3">
              <p className="text-sm text-slate-600">
                Отсканируйте код в Яндекс Ключе, Google Authenticator или другом приложении и введите 6 цифр.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR-код для приложения" className="h-44 w-44" />
              <p className="break-all text-xs text-slate-400">Ключ: {user.totpSecret}</p>
              <Field label="Код из приложения">
                <Input name="code" inputMode="numeric" required />
              </Field>
              <Submit>Включить</Submit>
            </Form>
          ) : (
            <Form action={start2faAction} className="space-y-3">
              <p className="text-sm text-slate-600">Защитит аккаунт, даже если пароль узнают. Рекомендуется владельцу.</p>
              <Submit variant="secondary">Настроить 2FA</Submit>
            </Form>
          )}
        </Card>
      </div>
    </>
  );
}
