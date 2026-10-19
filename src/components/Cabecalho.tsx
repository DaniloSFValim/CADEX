import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PAPEL_LABEL, useAuth, type Servidor } from '../lib/auth';
import { FaixaMarca, type ItemMenu } from './FaixaMarca';
import { Button } from './ui';

export type { ItemMenu };

/** Menu da área restrita, conforme o papel de quem está conectado. */
export function itensRestritos(servidor: Servidor | null | undefined): ItemMenu[] {
  const isGestor = servidor?.papel === 'gestor';
  if (servidor?.papel === 'licenciador') {
    return [
      { rotulo: 'Obras', para: '/obras', fim: true },
      { rotulo: 'Consulta pública', para: '/consulta' },
    ];
  }
  return [
    { rotulo: 'Painel', para: '/dashboard' },
    ...(isGestor ? [{ rotulo: 'Anatel', para: '/anatel' }] : []),
    { rotulo: 'Empresas', para: '/empresas', fim: true },
    { rotulo: 'Obras', para: '/obras' },
    { rotulo: 'Órgãos', para: '/orgaos' },
    { rotulo: 'Consulta pública', para: '/consulta' },
    ...(servidor?.administrador ? [{ rotulo: 'Administração', para: '/admin' }] : []),
  ];
}

/** Quem está conectado e a saída, à direita da faixa. */
export function UsuarioSaida() {
  const { servidor, session, signOut } = useAuth();
  return (
    <>
      <Link to="/minha-conta" className="hidden text-right leading-tight hover:underline sm:block" title="Minha conta: trocar senha">
        <span className="block font-semibold">{servidor?.nome ?? session?.user.email}</span>
        {servidor && <span className="block text-xs text-white/75">{PAPEL_LABEL[servidor.papel]}</span>}
      </Link>
      <Button variant="secondary" className="px-3! py-1.5!" onClick={() => void signOut()}>Sair</Button>
    </>
  );
}

/** Entrada da área restrita para quem não está conectado. */
const AREA_RESTRITA = (
  <Link to="/entrar" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-white/12 px-4 text-sm font-semibold text-white hover:bg-white/20">
    Área restrita
  </Link>
);

/**
 * Cabeçalho das páginas públicas. Quem está conectado vê o mesmo menu e a
 * mesma saída da área restrita, em qualquer página. Quem não está vê a
 * entrada da área restrita. Com `itens` ou `direita`, a página define o
 * cabeçalho (usado na tela de verificação em duas etapas).
 */
export function Cabecalho({ itens, direita }: { itens?: ItemMenu[]; direita?: ReactNode } = {}) {
  const { servidor, session } = useAuth();
  const { pathname } = useLocation();
  // Na própria tela de entrada, o link para a área restrita repetiria a página aberta.
  const entrada = pathname === '/entrar' ? undefined : AREA_RESTRITA;
  if (itens || direita) return <FaixaMarca itens={itens ?? []} direita={direita ?? entrada} />;
  if (session && servidor) return <FaixaMarca itens={itensRestritos(servidor)} direita={<UsuarioSaida />} />;
  return <FaixaMarca itens={[]} direita={entrada} />;
}
