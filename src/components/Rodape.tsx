import { Link } from 'react-router-dom';

const SITE_SECONSER = 'https://www.seconser.niteroi.rj.gov.br/';

/**
 * Rodapé no modelo do portal da SECONSER, com a autoria do sistema.
 * Os contatos são os publicados no próprio portal.
 */
export function Rodape() {
  return (
    <footer className="mt-12 text-slate-200">
      <div className="bg-rodape">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
          <section>
            <h2 className="mb-3 text-lg font-medium text-white">CADEX</h2>
            <p className="leading-relaxed">
              Cadastro de Executores de intervenções nas vias públicas, no subsolo e no espaço
              aéreo do Município, nos termos da Resolução Conjunta SECONSER/SEOP nº 001/2026.
            </p>
            <p className="mt-3 font-semibold text-white">Fiscalização de Serviços Concedidos – SECONSER</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium text-white">Links úteis</h2>
            <ul className="space-y-2">
              <li><Link to="/consulta" className="hover:text-white hover:underline">Consulta pública de empresas</Link></li>
              <li><Link to="/" className="hover:text-white hover:underline">Área restrita</Link></li>
              <li>
                <a href={SITE_SECONSER} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline">
                  Portal da SECONSER
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium text-white">Contatos</h2>
            <address className="space-y-2 not-italic">
              <p>Av. Visconde do Rio Branco, 11<br />Ponta d'Areia, Niterói | RJ</p>
              <p>(21) 4040-1650</p>
              <p>Disque-Luz (21) 4040-1640</p>
              <p>
                <a href="mailto:seconser@seconser.niteroi.rj.gov.br" className="hover:text-white hover:underline">
                  seconser@seconser.niteroi.rj.gov.br
                </a>
              </p>
              <p>
                Atendimento virtualmente pelo COLAB ou pela Ouvidoria SECONSER
                (<a href="mailto:ouvidoria.seconser@gmail.com" className="hover:text-white hover:underline">ouvidoria.seconser@gmail.com</a>)
              </p>
            </address>
          </section>
        </div>
      </div>
      <div className="bg-rodape-escuro">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-300">
          © {new Date().getFullYear()} | SECONSER - Secretaria de Conservação e Serviços Públicos
          {' · '}Fiscalização de Serviços Concedidos · Prefeitura Municipal de Niterói
        </div>
      </div>
    </footer>
  );
}
