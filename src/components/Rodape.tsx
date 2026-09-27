import { Link } from 'react-router-dom';

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/** Rodapé: contatos da Fiscalização de Serviços Concedidos (texto da SECONSER) e links. */
export function Rodape() {
  const link = 'hover:text-white';
  return (
    <footer className="mt-16 bg-tinta-900 text-[13px] text-tinta-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-[1fr_auto]">
        <address className="space-y-1 not-italic">
          <p className="mb-2 font-semibold text-white">Fiscalização de Serviços Concedidos – SECONSER</p>
          <p>Av. Visconde do Rio Branco, 11 – Ponta d'Areia, Niterói – RJ</p>
          <p>Telefone (21) 4040-1650 · Disque-Luz (21) 4040-1640</p>
          <p>
            <a href="mailto:fiscalizacao@seconser.niteroi.rj.gov.br" className={link}>fiscalizacao@seconser.niteroi.rj.gov.br</a>
            <span className="mx-2 text-tinta-500">|</span>
            <a href="mailto:seconser@seconser.niteroi.rj.gov.br" className={link}>seconser@seconser.niteroi.rj.gov.br</a>
          </p>
        </address>
        <nav aria-label="Links do rodapé" className="flex flex-col gap-1.5 sm:items-end">
          <Link to="/consulta" className={link}>Consulta pública</Link>
          <Link to="/" className={link}>Área restrita</Link>
          <a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer" className={link}>Portal da SECONSER</a>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-3 text-2xs text-tinta-400">
          © {new Date().getFullYear()} Prefeitura Municipal de Niterói · SECONSER – Secretaria de Conservação e Serviços Públicos
        </div>
      </div>
    </footer>
  );
}
