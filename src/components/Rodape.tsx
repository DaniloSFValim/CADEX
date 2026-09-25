import { Link } from 'react-router-dom';

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/**
 * Rodapé no modelo do portal da SECONSER, compacto: contatos da
 * Fiscalização de Serviços Concedidos (texto fornecido pela SECONSER) e links.
 */
export function Rodape() {
  const link = 'hover:text-white hover:underline';
  return (
    <footer className="mt-12 text-xs text-slate-300">
      <div className="bg-rodape">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-x-8 gap-y-3 px-4 py-5">
          <address className="space-y-1 not-italic">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Contatos</p>
            <p className="text-sm font-semibold text-white">Fiscalização de Serviços Concedidos – SECONSER</p>
            <p>Av. Visconde do Rio Branco, 11 – Ponta d'Areia | Niterói | RJ</p>
            <p>Telefone: (21) 4040-1650 · Disque-Luz (21) 4040-1640</p>
            <p>
              E-mail:{' '}
              <a href="mailto:fiscalizacao@seconser.niteroi.rj.gov.br" className={link}>fiscalizacao@seconser.niteroi.rj.gov.br</a>
              {' | '}
              <a href="mailto:seconser@seconser.niteroi.rj.gov.br" className={link}>seconser@seconser.niteroi.rj.gov.br</a>
            </p>
          </address>
          <nav aria-label="Links do rodapé" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/consulta" className={link}>Consulta pública</Link>
            <Link to="/" className={link}>Área restrita</Link>
            <a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer" className={link}>Portal da SECONSER</a>
          </nav>
        </div>
      </div>
      <div className="bg-rodape-escuro">
        <div className="mx-auto max-w-6xl px-4 py-2.5">
          © {new Date().getFullYear()} | SECONSER - Secretaria de Conservação e Serviços Públicos · Prefeitura Municipal de Niterói
        </div>
      </div>
    </footer>
  );
}
