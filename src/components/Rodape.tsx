import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const DOI = '10.5281/zenodo.23546537';

/**
 * Rodapé no desenho do NETRANK RJ (branco, fio no topo): o que é o sistema,
 * quem o mantém e de onde vem a citação.
 */
export function Rodape() {
  const { session } = useAuth();
  const link = 'text-marca-600 underline-offset-4 hover:underline';
  // Links dentro de um parágrafo precisam de sublinhado fixo, não só cor (WCAG).
  const linkNoTexto = 'text-marca-600 underline underline-offset-4';
  return (
    <footer className="mt-20 border-t border-tinta-200 bg-white text-tinta-500">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm md:grid-cols-2">
        <p className="max-w-md">
          Consulta pública de empresas executoras e de obras e serviços licenciados em Niterói.
        </p>
        <ul className="space-y-2">
          {!session && <li><Link to="/consulta" className={link}>Consulta pública</Link></li>}
        </ul>
      </div>
      <div className="border-t border-tinta-100">
        <div className="mx-auto max-w-7xl space-y-1 px-4 py-4 text-xs text-tinta-400">
          <p>
            Desenvolvido por <span className="text-tinta-600">Danilo Valim</span> (UFRRJ), ORCID{' '}
            <a href="https://orcid.org/0009-0009-7250-6151" target="_blank" rel="noopener noreferrer" className={linkNoTexto}>0009-0009-7250-6151</a>.
            Código sob AGPL-3.0; documentação e dados sob CC BY 4.0.
          </p>
          <p>
            Registro citável no Zenodo, DOI{' '}
            <a href={`https://doi.org/${DOI}`} target="_blank" rel="noopener noreferrer" className={linkNoTexto}>{DOI}</a>.
          </p>
          <p>© {new Date().getFullYear()} Danilo Valim.</p>
        </div>
      </div>
    </footer>
  );
}
