import { useState } from 'react';
import { Button, Card, Empty, ErrorNote, Field, StatusBadge, inputClass } from '../../components/ui';
import { formatCnpj } from '../../lib/rules';
import { createSubcontractor, setLinkActive, type loadTelecom } from '../../lib/telecom';
import { CompanyForm } from './CompanyForm';

type Data = Awaited<ReturnType<typeof loadTelecom>>;

export default function Terceirizadas({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const [operatorId, setOperatorId] = useState(data.operators[0]?.id ?? '');
  const [error, setError] = useState<unknown>(null);

  if (data.operators.length === 0) {
    return <Empty>Cadastre uma operadora antes de vincular terceirizadas.</Empty>;
  }

  const name = (id: string) => {
    const c = data.companies.get(id);
    return c ? c.trade_name || c.legal_name : '—';
  };

  return (
    <div className="space-y-5">
      <Card title="Nova terceirizada">
        <CompanyForm
          idPrefix="terc"
          submitLabel="Vincular terceirizada"
          onSubmit={async (input) => {
            if (!operatorId) throw new Error('Escolha a operadora contratante.');
            await createSubcontractor(operatorId, input);
            onChanged();
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Operadora contratante" required
                   hint="Se o CNPJ já estiver cadastrado, a empresa existente é reaproveitada.">
              <select id="terc-operadora" className={inputClass} value={operatorId}
                      onChange={(e) => setOperatorId(e.target.value)}>
                {data.operators.map((o) => (
                  <option key={o.id} value={o.id}>{o.trade_name || o.legal_name}</option>
                ))}
              </select>
            </Field>
          </div>
        </CompanyForm>
      </Card>

      <Card title={`Terceirizadas (${data.links.filter((l) => l.active).length} ativas)`}>
        <ErrorNote error={error} />
        {data.links.length === 0 ? (
          <Empty>Nenhuma terceirizada vinculada.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Terceirizada</th>
                  <th className="py-2 pr-4">CNPJ</th>
                  <th className="py-2 pr-4">Contratada por</th>
                  <th className="py-2 pr-4">Situação</th>
                  <th className="py-2 pr-4">Vínculo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.links.map((l) => {
                  const c = data.companies.get(l.child_id);
                  return (
                    <tr key={l.id} className={l.active ? '' : 'text-slate-400'}>
                      <td className="py-2 pr-4 font-medium">{name(l.child_id)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{c ? formatCnpj(c.cnpj) : '—'}</td>
                      <td className="py-2 pr-4">{name(l.parent_id)}</td>
                      <td className="py-2 pr-4"><StatusBadge status={c?.status ?? null} /></td>
                      <td className="py-2 pr-4">
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            setError(null);
                            try { await setLinkActive(l.id, !l.active); onChanged(); }
                            catch (e) { setError(e); }
                          }}
                        >
                          {l.active ? 'Encerrar vínculo' : 'Reativar'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
