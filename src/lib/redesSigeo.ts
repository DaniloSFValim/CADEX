/**
 * Camadas de redes subterrâneas publicadas pela Prefeitura de Niterói (SIGEO / SECONSER).
 * São dados públicos. Mostramos só a geometria e a origem: nada de atributos operacionais
 * (pressão, válvulas, situação), mesmo nas redes de gás.
 */

export const ATRIBUICAO_REDES = 'Fonte: SIGEO, Prefeitura Municipal de Niterói';

/** Abaixo deste zoom a camada não é consultada: evita puxar a cidade inteira de uma vez. */
export const ZOOM_MINIMO_REDES = 13;

/** Limite de feições por consulta que o serviço aceita. */
export const LIMITE_FEICOES = 2000;

export type RedeSigeo = {
  id: string;
  rotulo: string;
  /** URL da camada no serviço (FeatureServer/N), sem /query. */
  url: string;
  tipo: 'linha' | 'poligono';
  cor: string;
  /** Nome do campo de identificação da camada (varia entre os serviços). Único atributo pedido. */
  campoId: string;
};

export const REDES_SIGEO: RedeSigeo[] = [
  { id: 'rede-agua', rotulo: 'Água', tipo: 'linha', cor: '#0284c7',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_EQUIPDREN_AGOL/FeatureServer/30', campoId: 'OBJECTID' },
  { id: 'rede-esgoto', rotulo: 'Esgoto', tipo: 'linha', cor: '#78716c',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_EQUIPDREN_AGOL/FeatureServer/20', campoId: 'OBJECTID' },
  { id: 'rede-oi', rotulo: 'Comunicação (OI)', tipo: 'linha', cor: '#854d0e',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_GESTAO_AGOL/FeatureServer/70', campoId: 'OBJECTID' },
  { id: 'rede-gas-bp', rotulo: 'Gás BP', tipo: 'linha', cor: '#c2410c',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_GESTAO_AGOL/FeatureServer/40', campoId: 'OBJECTID_1' },
  { id: 'rede-gas-mp', rotulo: 'Gás MP', tipo: 'linha', cor: '#ea580c',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_GESTAO_AGOL/FeatureServer/50', campoId: 'OBJECTID_1' },
  { id: 'rede-gas-ap', rotulo: 'Gás AP', tipo: 'linha', cor: '#fb923c',
    url: 'https://services8.arcgis.com/TpaOLI1HCh5AcRQB/arcgis/rest/services/Grouplayer_SECONSER_GESTAO_AGOL/FeatureServer/30', campoId: 'OBJECTID_1' },
  { id: 'rede-drenagem', rotulo: 'Drenagem', tipo: 'linha', cor: '#4f46e5',
    url: 'https://sig.niteroi.rj.gov.br/server/rest/services/Hosted/Rede_de_Drenagem_(Visualiza%C3%A7%C3%A3o_P%C3%BAblica)/FeatureServer/3', campoId: 'objectid' },
];

/**
 * Monta a consulta de feições dentro de uma área (oeste, sul, leste, norte, em graus).
 * Só pede a geometria e o campo de identificação: os demais atributos não saem do serviço.
 */
export function urlConsultaRede(rede: RedeSigeo, oeste: number, sul: number, leste: number, norte: number): string {
  const envelope = `${oeste},${sul},${leste},${norte}`;
  const params = new URLSearchParams({
    where: '1=1',
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: rede.campoId,
    outSR: '4326',
    returnGeometry: 'true',
    resultRecordCount: String(LIMITE_FEICOES),
    f: 'geojson',
  });
  return `${rede.url}/query?${params.toString()}`;
}
