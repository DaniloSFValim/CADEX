import { podeAtuar, situacaoEfetiva, type Empresa } from './empresas';
import { relacaoEmpresas, type Contexto } from './exportar';
import type { Relatorio } from './relatorio';

/** Empresas que podem executar obras e serviços em vias públicas, como o cadastro as define. */
export const TITULO_DIARIO = 'Empresas autorizadas a executar obras e serviços em vias públicas';

/** Colunas da publicação: número de cadastro, identificação, situação e portaria. */
const CHAVES_DIARIO = ['codigo', 'razao', 'fantasia', 'cnpj', 'tipo', 'situacao', 'portaria', 'portaria_data', 'validade'];

/**
 * Autorizada = cadastro ativo e situação que permite atuar (deferida, apta ou em saneamento),
 * a mesma regra do art. 3º usada no restante do sistema. Vencida ou inapta fica de fora.
 */
export function empresasAutorizadas(empresas: Empresa[], hoje: string): Empresa[] {
  return empresas.filter((e) => e.ativa && !e.teste && podeAtuar(situacaoEfetiva(e, hoje)));
}

export function relatorioDiarioOficial(autorizadas: Empresa[], contexto: Contexto): Relatorio {
  const r = relacaoEmpresas(autorizadas, CHAVES_DIARIO, contexto, '', [
    'Critério: cadastro ativo e situação que permite atuar (deferida, apta ou em saneamento).',
    `Data de referência: ${contexto.hoje}.`,
  ]);
  return { ...r, titulo: TITULO_DIARIO, arquivo: 'cadex-empresas-autorizadas' };
}
