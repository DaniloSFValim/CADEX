import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Última barreira: um erro de tela não tratado deixava a página em branco, sem
 * explicação. Aqui a pessoa vê o que houve e tem como seguir. O erro vai para o
 * console (com a pilha de componentes) para quem for investigar.
 */
export class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado na tela:', erro, info.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    // Pacote antigo depois de uma atualização do sistema: recarregar resolve.
    const pacoteAntigo = /dynamically imported module|importing a module script failed|failed to fetch dynamically/i.test(erro.message);
    return (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-tinta-900">
          {pacoteAntigo ? 'O CADEX foi atualizado' : 'Esta tela encontrou um erro'}
        </h1>
        <p className="mt-2 text-sm text-tinta-600">
          {pacoteAntigo
            ? 'Recarregue a página para usar a versão nova.'
            : 'O que já foi gravado continua gravado. Recarregue a página; se o erro voltar, avise o administrador e diga o que estava fazendo.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()}
                  className="inline-flex min-h-10 items-center rounded-sm bg-tinta-900 px-4 text-sm font-medium text-white hover:bg-tinta-800">
            Recarregar a página
          </button>
          <a href="/" className="inline-flex min-h-10 items-center rounded-sm border border-tinta-300 px-4 text-sm font-medium text-tinta-800 hover:bg-tinta-100">
            Ir para o início
          </a>
        </div>
      </div>
    );
  }
}
