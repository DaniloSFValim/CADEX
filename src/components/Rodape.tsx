import { Link } from 'react-router-dom';

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/** Rodapé institucional: contatos da Fiscalização de Serviços Concedidos (texto da SECONSER) e links. */
export function Rodape() {
  const link = 'text-white/90 underline decoration-white/30 underline-offset-4 hover:decoration-white';
  return (
    <footer className="mt-20 border-t-4 border-marca-600 bg-marca-900 text-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-[2fr_1.4fr_1fr]">
        <div className="max-w-md space-y-2">
          <p className="font-semibold text-white">Fiscalização de Serviços Concedidos – SECONSER</p>
          <p>
            Cadastro de Executores (CADEX) da Prefeitura Municipal de Niterói, previsto na
            Resolução Conjunta SECONSER/SEOP nº&nbsp;001/2026.
          </p>
          <p>Av. Visconde do Rio Branco, 11 – Ponta d'Areia, Niterói – RJ</p>
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-white/55">Telefone</dt>
            <dd className="tabular text-white">(21) 4040-1650</dd>
          </div>
          <div>
            <dt className="text-white/55">Disque-Luz</dt>
            <dd className="tabular text-white">(21) 4040-1640</dd>
          </div>
          <div>
            <dt className="text-white/55">E-mail</dt>
            <dd><a href="mailto:fiscalizacao@seconser.niteroi.rj.gov.br" className={link}>fiscalizacao@seconser.niteroi.rj.gov.br</a></dd>
            <dd><a href="mailto:seconser@seconser.niteroi.rj.gov.br" className={link}>seconser@seconser.niteroi.rj.gov.br</a></dd>
          </div>
        </dl>
        <ul className="space-y-2">
          <li><Link to="/consulta" className={link}>Consulta pública</Link></li>
          <li><Link to="/" className={link}>Área restrita</Link></li>
          <li><a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer" className={link}>Portal da SECONSER</a></li>
        </ul>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/55">
          © {new Date().getFullYear()} Prefeitura Municipal de Niterói. Secretaria de Conservação e Serviços Públicos.
        </p>
      </div>
    </footer>
  );
}
