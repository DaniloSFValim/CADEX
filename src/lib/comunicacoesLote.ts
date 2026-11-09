import { validarComunicacao, type NovaComunicacao, type TipoComunicacao } from './comunicacoes';

/**
 * Lote de locais: uma linha por ponto, no formato "latitude; longitude; tipo de serviço".
 * Os demais dados (responsável, placas, período, descrição) valem para todas as linhas.
 */
export interface LinhaLote { numero: number; lat: number; lng: number; tipo_servico: string }
export interface ErroLote { numero: number; texto: string; mensagem: string }

/** Limites de Niterói usados nas licenças e intervenções (mesmos do banco). */
const LAT = [-23.10, -22.75] as const;
const LNG = [-43.25, -42.85] as const;

export function interpretarLote(texto: string): { linhas: LinhaLote[]; erros: ErroLote[] } {
  const linhas: LinhaLote[] = [];
  const erros: ErroLote[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const numero = i + 1;
    const t = bruta.trim();
    if (!t) return;
    const partes = t.split(';').map((p) => p.trim());
    const erro = (mensagem: string) => erros.push({ numero, texto: t, mensagem });
    if (partes.length !== 3) return erro('Use três campos separados por ponto e vírgula: latitude; longitude; tipo de serviço.');
    const [latTxt, lngTxt, tipo] = partes;
    const lat = Number(latTxt.replace(',', '.'));
    const lng = Number(lngTxt.replace(',', '.'));
    if (!latTxt || !Number.isFinite(lat)) return erro(`Latitude inválida: "${latTxt}".`);
    if (!lngTxt || !Number.isFinite(lng)) return erro(`Longitude inválida: "${lngTxt}".`);
    if (lat < LAT[0] || lat > LAT[1] || lng < LNG[0] || lng > LNG[1]) return erro('Ponto fora de Niterói.');
    if (!tipo) return erro('Informe o tipo de serviço.');
    linhas.push({ numero, lat, lng, tipo_servico: tipo });
  });
  return { linhas, erros };
}

/** Dados que valem para todas as linhas do lote. */
export type Compartilhado = Omit<NovaComunicacao, 'tipo_servico' | 'inicio_lat' | 'inicio_lng' | 'fim_lat' | 'fim_lng'> & { tipo: TipoComunicacao };

/**
 * Monta uma comunicação por linha e valida cada uma com a mesma regra da gravação individual.
 * Devolve as comunicações prontas, ou os erros de todas as linhas que falharam.
 */
export function montarLote(
  linhas: LinhaLote[], base: Compartilhado, hoje: string, agora: Date,
): { comunicacoes: NovaComunicacao[]; erros: ErroLote[] } {
  const comunicacoes: NovaComunicacao[] = [];
  const erros: ErroLote[] = [];
  for (const l of linhas) {
    const c: NovaComunicacao = { ...base, tipo_servico: l.tipo_servico, inicio_lat: l.lat, inicio_lng: l.lng, fim_lat: null, fim_lng: null };
    const mensagem = validarComunicacao(c, hoje, agora);
    if (mensagem) erros.push({ numero: l.numero, texto: `${l.lat}; ${l.lng}; ${l.tipo_servico}`, mensagem });
    else comunicacoes.push(c);
  }
  return { comunicacoes, erros };
}
