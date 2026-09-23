import { useState } from 'react';
import { Button, Card, Empty, StatusBadge } from '../../components/ui';
import { formatCnpj } from '../../lib/rules';
import { createOperator, updateCompany, type Company, type loadTelecom } from '../../lib/telecom';
import { CompanyForm, toInput } from './CompanyForm';

type Data = Awaited<ReturnType<typeof loadTelecom>>;

export default function Operadoras({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const [editing, setEditing] = useState<Company | null>(null);
  const count = (id: string) =>
    data.links.filter((l) => l.parent_id === id && l.active).length;

  return (
    <div className="space-y-5">
      <Card title={editing ? `Editar ${editing.trade_name || editing.legal_name}` : 'Nova operadora'}>
        {editing ? (
          <CompanyForm
            key={editing.id}
            idPrefix="op"
            submitLabel="Salvar alterações"
            initial={toInput(editing)}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await updateCompany(editing.id, input);
              setEditing(null);
              onChanged();
            }}
          />
        ) : (
          <CompanyForm
            idPrefix="op"
            submitLabel="Cadastrar operadora"
            onSubmit={async (input) => { await createOperator(input); onChanged(); }}
          />
        )}
      </Card>

      <Card title={`Operadoras (${data.operators.length})`}>
        {data.operators.length === 0 ? (
          <Empty>Nenhuma operadora cadastrada.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Operadora</th>
                  <th className="py-2 pr-4">CNPJ</th>
                  <th className="py-2 pr-4">Contato</th>
                  <th className="py-2 pr-4">Terceirizadas</th>
                  <th className="py-2 pr-4">Situação</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.operators.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-800">{o.trade_name || o.legal_name}</div>
                      {o.trade_name && <div className="text-xs text-slate-500">{o.legal_name}</div>}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{formatCnpj(o.cnpj)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {o.email}{o.phone ? <><br />{o.phone}</> : null}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{count(o.id)}</td>
                    <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                    <td className="py-2 text-right">
                      <Button variant="secondary" onClick={() => {
                        setEditing(o);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
