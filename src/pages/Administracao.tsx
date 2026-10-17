import { NavLink, Outlet } from 'react-router-dom';
import { Empty, Titulo } from '../components/ui';
import { useAuth } from '../lib/auth';

const ABAS = [
  { rotulo: 'Contas e acessos', para: '/admin', fim: true },
  { rotulo: 'Empresas', para: '/admin/empresas' },
  { rotulo: 'Licenças', para: '/admin/licencas' },
  { rotulo: 'Tipos de obra', para: '/admin/tipos' },
  { rotulo: 'Configurações', para: '/admin/configuracoes' },
  { rotulo: 'Auditoria', para: '/admin/auditoria' },
];

/**
 * Administração do CADEX. A tela só aparece a quem é administrador, mas isso
 * é conforto: cada operação é conferida de novo no banco (funções e políticas),
 * então abrir o endereço à mão não dá poder nenhum.
 */
export default function Administracao() {
  const { servidor } = useAuth();
  if (servidor?.administrador !== true) {
    return <Empty>Só administrador acessa a administração do CADEX.</Empty>;
  }
  // Menu lateral em telas largas; em telas estreitas, vira uma faixa que rola na horizontal.
  const aba = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-10 items-center whitespace-nowrap rounded px-3 text-sm font-medium transition-colors ${
      isActive ? 'bg-tinta-900 text-white' : 'text-tinta-600 hover:bg-tinta-100 hover:text-tinta-900'}`;
  return (
    <>
      <Titulo
        titulo="Administração"
        descricao="Contas, empresas, licenças, parâmetros e auditoria do CADEX. Toda mudança fica na auditoria e vale no banco, não só nesta tela."
      />
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0" aria-label="Administração">
          <ul className="flex w-max gap-1 lg:w-auto lg:flex-col">
            {ABAS.map((a) => (
              <li key={a.para}><NavLink to={a.para} end={a.fim} className={aba}>{a.rotulo}</NavLink></li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
