import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/**
 * Rodapé no desenho do NETRANK RJ (branco, fio no topo): quem responde pelo
 * CADEX, contatos da Fiscalização de Serviços Concedidos e links.
 */
export function Rodape() {
  const { session } = useAuth();
  const link = 'text-marca-600 underline-offset-4 hover:underline';
  return (
    <footer className="mt-20 border-t border-tinta-200 bg-white text-tinta-500">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm md:grid-cols-[2fr_1.4fr_1fr]">
        <div className="max-w-md space-y-2">
          <p className="font-semibold text-tinta-900">CADEX, Fiscalização de Serviços Concedidos</p>
          <p>
            Cadastro de Executores (CADEX) da Prefeitura Municipal de Niterói.
          </p>
          <p>Av. Visconde do Rio Branco, 11 – Ponta d'Areia, Niterói – RJ</p>
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-tinta-400">Telefone</dt>
            <dd className="tabular text-tinta-800">(21) 4040-1650</dd>
          </div>
          <div>
            <dt className="text-tinta-400">Disque-Luz</dt>
            <dd className="tabular text-tinta-800">(21) 4040-1640</dd>
          </div>
          <div>
            <dt className="text-tinta-400">E-mail</dt>
            <dd><a href="mailto:fiscalizacao@seconser.niteroi.rj.gov.br" className={link}>fiscalizacao@seconser.niteroi.rj.gov.br</a></dd>
            <dd><a href="mailto:seconser@seconser.niteroi.rj.gov.br" className={link}>seconser@seconser.niteroi.rj.gov.br</a></dd>
          </div>
        </dl>
        <ul className="space-y-2">
          {!session && <li><Link to="/consulta" className={link}>Consulta pública</Link></li>}
          <li><a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer" className={link}>Portal da SECONSER</a></li>
        </ul>
      </div>
      <div className="border-t border-tinta-100">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-tinta-400">
          © {new Date().getFullYear()} Prefeitura Municipal de Niterói. Secretaria de Conservação e Serviços Públicos.
        </p>
      </div>
    </footer>
  );
}
