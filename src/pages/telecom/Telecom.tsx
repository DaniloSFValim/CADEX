import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, Spinner } from '../../components/ui';
import { loadTelecom } from '../../lib/telecom';
import Operadoras from './Operadoras';
import Terceirizadas from './Terceirizadas';
import Intervencoes from './Intervencoes';

type Tab = 'operadoras' | 'terceirizadas' | 'obras' | 'servicos';

const TABS: { id: Tab; label: string }[] = [
  { id: 'operadoras', label: 'Operadoras' },
  { id: 'terceirizadas', label: 'Terceirizadas' },
  { id: 'obras', label: 'Obras programadas' },
  { id: 'servicos', label: 'Serviços de rotina' },
];

/** Cadastro e acompanhamento das empresas de telecom, feito pela Prefeitura. */
export default function Telecom() {
  const [tab, setTab] = useState<Tab>('operadoras');
  const qc = useQueryClient();
  const base = useQuery({ queryKey: ['telecom'], queryFn: loadTelecom });
  const refresh = () => qc.invalidateQueries({ queryKey: ['telecom'] });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Telecomunicações</h1>
        <p className="text-sm text-slate-600">
          Operadoras, suas terceirizadas, obras programadas e serviços de rotina.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Seções">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition
              ${tab === t.id
                ? 'border-gov-700 text-gov-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {base.isLoading && <Spinner />}
      <ErrorNote error={base.error} />

      {base.data && (
        <>
          {tab === 'operadoras' && <Operadoras data={base.data} onChanged={refresh} />}
          {tab === 'terceirizadas' && <Terceirizadas data={base.data} onChanged={refresh} />}
          {tab === 'obras' && <Intervencoes kind="obra" data={base.data} />}
          {tab === 'servicos' && <Intervencoes kind="manutencao" data={base.data} />}
        </>
      )}
    </div>
  );
}
