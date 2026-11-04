/** Bairros de Niterói (limite oficial): nome e região, para desenhar no mapa e filtrar a lista. */

export interface BairroGeo { nome: string; regiao: string }

/** Chave de comparação: sem acento, sem maiúscula, só letras. "Pé Pequeno" e "Pe Pequeno" dão a mesma chave. */
export function chaveBairro(nome: string): string {
  return nome.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

let cache: Promise<{ features: { type: 'Feature'; properties: BairroGeo; geometry: GeoJSON.Geometry }[] }> | null = null;

/** Carrega o arquivo de bairros uma vez (fica em public/mapa). */
export function carregarBairrosGeo() {
  cache ??= fetch('/mapa/bairros-niteroi.geojson').then((r) => {
    if (!r.ok) throw new Error('Não foi possível carregar os bairros.');
    return r.json();
  });
  return cache;
}

/** Região do bairro, pela chave. Sem correspondência, nulo. */
export function mapaRegioes(bairros: BairroGeo[]): Map<string, string> {
  return new Map(bairros.map((b) => [chaveBairro(b.nome), b.regiao]));
}
