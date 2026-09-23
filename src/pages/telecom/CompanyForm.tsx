import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from '../../components/ui';
import { isValidCnpj } from '../../lib/rules';
import type { CompanyInput } from '../../lib/telecom';

const EMPTY: CompanyInput = { cnpj: '', legal_name: '', trade_name: '', email: '', phone: '' };

/** Formulário de empresa usado por operadora e terceirizada. */
export function CompanyForm({
  idPrefix, submitLabel, onSubmit, children,
}: {
  idPrefix: string;
  submitLabel: string;
  onSubmit: (input: CompanyInput) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [v, setV] = useState<CompanyInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const cnpjDigits = v.cnpj.replace(/\D/g, '');
  const cnpjBad = cnpjDigits.length === 14 && !isValidCnpj(cnpjDigits);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!isValidCnpj(cnpjDigits)) { setError(new Error('CNPJ inválido.')); return; }
        setBusy(true);
        try {
          await onSubmit(v);
          setV(EMPTY);
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <Field label="CNPJ" required>
        <input id={`${idPrefix}-cnpj`} className={inputClass} value={v.cnpj}
               placeholder="00.000.000/0000-00" required onChange={set('cnpj')} />
        {cnpjBad && <p className="mt-1 text-xs text-red-700">Dígito verificador não confere.</p>}
      </Field>
      <Field label="Razão social" required>
        <input id={`${idPrefix}-razao`} className={inputClass} value={v.legal_name}
               required onChange={set('legal_name')} />
      </Field>
      <Field label="Nome fantasia">
        <input id={`${idPrefix}-fantasia`} className={inputClass} value={v.trade_name}
               onChange={set('trade_name')} />
      </Field>
      <Field label="E-mail" required>
        <input id={`${idPrefix}-email`} type="email" className={inputClass} value={v.email}
               required onChange={set('email')} />
      </Field>
      <Field label="Telefone">
        <input id={`${idPrefix}-fone`} className={inputClass} value={v.phone}
               onChange={set('phone')} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</Button>
      </div>
      <div className="sm:col-span-2"><ErrorNote error={error} /></div>
    </form>
  );
}
