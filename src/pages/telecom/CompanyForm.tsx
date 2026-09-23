import { useState } from 'react';
import { Button, ErrorNote, Field, inputClass } from '../../components/ui';
import { formatCnpj, isValidCnpj } from '../../lib/rules';
import type { Company, CompanyInput } from '../../lib/telecom';

const EMPTY: CompanyInput = { cnpj: '', legal_name: '', trade_name: '', email: '', phone: '' };

export const toInput = (c: Company): CompanyInput => ({
  cnpj: formatCnpj(c.cnpj),
  legal_name: c.legal_name,
  trade_name: c.trade_name ?? '',
  email: c.email,
  phone: c.phone ?? '',
});

/**
 * Formulário de empresa usado por operadora e terceirizada, para cadastrar
 * e para editar. Na edição o CNPJ fica travado: é a identidade da empresa.
 */
export function CompanyForm({
  idPrefix, submitLabel, onSubmit, onCancel, initial, children,
}: {
  idPrefix: string;
  submitLabel: string;
  onSubmit: (input: CompanyInput) => Promise<void>;
  onCancel?: () => void;
  initial?: CompanyInput;
  children?: React.ReactNode;
}) {
  const editing = Boolean(initial);
  const [v, setV] = useState<CompanyInput>(initial ?? EMPTY);
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
        if (!editing && !isValidCnpj(cnpjDigits)) { setError(new Error('CNPJ inválido.')); return; }
        setBusy(true);
        try {
          await onSubmit(v);
          if (!editing) setV(EMPTY);
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <Field label="CNPJ" required hint={editing ? 'O CNPJ não pode ser alterado.' : undefined}>
        <input id={`${idPrefix}-cnpj`} className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`}
               value={v.cnpj} placeholder="00.000.000/0000-00" required disabled={editing}
               onChange={set('cnpj')} />
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
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
      </div>
      <div className="sm:col-span-2"><ErrorNote error={error} /></div>
    </form>
  );
}
