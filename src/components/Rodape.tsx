import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const DOI = '10.5281/zenodo.23546537';

/**
 * Rodapé institucional e minimalista: o que é o sistema, a quem pertence e links públicos.
 */
export function Rodape() {
  const { session } = useAuth();
  const link = 'text-marca-600 underline-offset-4 hover:underline';
  return (
    <footer className="mt-20 border-t border-tinta-200 bg-white text-tinta-500">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 text-sm">
        <div className="space-y-1">
          <p className="font-semibold text-tinta-900">CADEX, Cadastro de Executores</p>
          <p className="max-w-2xl">
            Sistema criado de forma independente por Danilo Valim. Não é canal oficial da
            Prefeitura Municipal de Niterói nem da Secretaria de Conservação e Serviços
            Públicos (SECONSER).
          </p>
        </div>
        <nav aria-label="Links públicos" className="flex flex-wrap gap-x-6 gap-y-2">
          {!session && <Link to="/consulta" className={link}>Consulta pública</Link>}
          {!session && <Link to="/consulta/obras" className={link}>Obras licenciadas</Link>}
          <a href={`https://doi.org/${DOI}`} target="_blank" rel="noopener noreferrer" className={link}>Citação (DOI)</a>
        </nav>
        <p className="text-xs text-tinta-400">
          Código sob AGPL-3.0; documentação e dados sob CC BY 4.0. © {new Date().getFullYear()} Danilo Valim.
        </p>
      </div>
    </footer>
  );
}
