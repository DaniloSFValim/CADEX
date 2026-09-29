import { Link } from 'react-router-dom';
import { Cabecalho, MENU_PUBLICO } from '../components/Cabecalho';
import { Rodape } from '../components/Rodape';

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho itens={MENU_PUBLICO} />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="px-4 py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
              <div>
                <div className="mb-4 inline-block rounded-lg bg-primary-100 px-4 py-2">
                  <span className="font-semibold text-primary-600 text-sm">Sistema de Registro</span>
                </div>
                <h1 className="font-serif text-4xl font-bold text-primary-500 sm:text-5xl md:text-6xl leading-tight mb-6">
                  Cadastro de Executores de Serviços
                </h1>
                <p className="text-xl text-tinta-600 mb-8 leading-relaxed max-w-lg">
                  Plataforma obrigatória de registro para todas as operadoras de telecomunicações e empresas terceirizadas que realizam intervenções em vias públicas, subsolo ou rede aérea.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/consulta"
                    className="inline-flex items-center justify-center rounded bg-primary-500 px-8 py-3 text-lg font-semibold text-white hover:bg-primary-600 transition-colors">
                    Consultar Empresas
                  </Link>
                  <Link to="/login"
                    className="inline-flex items-center justify-center rounded border-2 border-primary-500 px-8 py-3 text-lg font-semibold text-primary-500 hover:bg-primary-50 transition-colors">
                    Área Restrita
                  </Link>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-full max-w-sm rounded-lg border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-accent-50 p-12 text-center">
                  <div className="text-6xl font-bold text-primary-500 mb-2">156</div>
                  <div className="text-tinta-600 mb-8">Empresas Cadastradas</div>
                  <div className="space-y-4 text-left">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-alta/10 flex items-center justify-center">
                        <span className="text-alta font-bold text-sm">✓</span>
                      </div>
                      <div>
                        <div className="font-semibold text-tinta-900">Aptas</div>
                        <div className="text-sm text-tinta-600">Podem atuar livremente</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-atencao/10 flex items-center justify-center">
                        <span className="text-atencao font-bold text-sm">!</span>
                      </div>
                      <div>
                        <div className="font-semibold text-tinta-900">Em Análise</div>
                        <div className="text-sm text-tinta-600">Aguardando avaliação</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-baixa/10 flex items-center justify-center">
                        <span className="text-baixa font-bold text-sm">✕</span>
                      </div>
                      <div>
                        <div className="font-semibold text-tinta-900">Inaptas</div>
                        <div className="text-sm text-tinta-600">Não podem atuar</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t border-tinta-100 bg-tinta-50 px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="font-serif text-3xl font-bold text-primary-500 sm:text-4xl mb-4">
                Sistema Integrado de Gestão
              </h2>
              <p className="text-lg text-tinta-600 max-w-2xl mx-auto">
                Controle centralizado de inscrições, documentação, pessoal técnico e operacional
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-lg border border-tinta-200 bg-white p-8">
                <div className="text-primary-500 text-4xl font-bold mb-4">📋</div>
                <h3 className="font-serif text-xl font-bold text-primary-500 mb-2">Inscrição e Documentação</h3>
                <p className="text-tinta-600">
                  Registre dados da empresa, responsáveis técnicos e mantenha toda documentação atualizada
                </p>
              </div>
              <div className="rounded-lg border border-tinta-200 bg-white p-8">
                <div className="text-primary-500 text-4xl font-bold mb-4">👥</div>
                <h3 className="font-serif text-xl font-bold text-primary-500 mb-2">Gestão de Pessoal</h3>
                <p className="text-tinta-600">
                  Controle de responsáveis técnicos, pessoal em campo e sistema de credenciamento
                </p>
              </div>
              <div className="rounded-lg border border-tinta-200 bg-white p-8">
                <div className="text-primary-500 text-4xl font-bold mb-4">🚚</div>
                <h3 className="font-serif text-xl font-bold text-primary-500 mb-2">Operacional</h3>
                <p className="text-tinta-600">
                  Registro de veículos, maquinário e vinculos contratuais com as operadoras
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-serif text-3xl font-bold text-primary-500 sm:text-4xl mb-6">
              Pronto para se registrar?
            </h2>
            <p className="text-lg text-tinta-600 mb-8">
              Acesse a área restrita para cadastrar ou gerenciar seu registro no CADEX
            </p>
            <Link to="/login"
              className="inline-flex items-center justify-center rounded bg-accent-500 px-8 py-4 text-lg font-semibold text-white hover:bg-accent-600 transition-colors">
              Entrar no Sistema
            </Link>
          </div>
        </section>
      </main>
      <Rodape />
    </div>
  );
}
