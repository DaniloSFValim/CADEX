# GIS

## Modelo geométrico

PostGIS, SRID **4326** (WGS84) em todas as colunas. Duas escolhas de tipo,
por razões diferentes:

- `geometry(Geometry, 4326)` onde a feição pode ser ponto, linha ou
  polígono — intervenções, roteiros, As Built, infraestrutura. O tipo
  genérico é intencional: a especificação exige suportar ponto, linha,
  polígono e trecho na mesma entidade.
- `geography(Point, 4326)` onde só há ponto e a distância importa em
  metros — GPS do fiscal, fotografias, sede da empresa. `geography`
  calcula sobre o elipsoide, sem projeção intermediária.

Índice GiST em toda coluna geométrica.

## Consulta espacial

`public.interventions_near(lng, lat, raio_m)` usa `ST_DWithin` sobre
`geography` e ordena por `ST_Distance` — é o que sustenta a tela "o que há
perto de mim" do fiscal. Roda sobre a view pública, então não vaza nada
que a consulta pública já não mostre.

## Base cartográfica

O estilo do mapa é configurável por `VITE_MAP_STYLE_URL`. Sem ele, o
sistema cai num estilo raster OpenStreetMap embutido em `src/lib/map.ts`.

Essa é a decisão a revisitar antes de produção: tiles públicos do OSM têm
política de uso incompatível com aplicação institucional de volume. As
opções são (a) contratar um provedor de tiles vetoriais, (b) servir tiles
próprios do Município, ou (c) apontar para o style.json da IDE municipal,
se existir. Qualquer uma delas é só preencher a variável — nada no código
muda.

## Formatos de arquivo

Os buckets aceitam GeoJSON, KML, KMZ, Shapefile compactado, DWG/DXF e PDF.
O **parser** desses formatos ainda não existe: o upload guarda o arquivo,
mas não o converte em geometria no banco. Implementar isso é o próximo
passo do módulo As Built e da etapa 3 do licenciamento.

Conversão pretendida: GeoJSON direto via `ST_GeomFromGeoJSON`; KML/KMZ e
Shapefile por Edge Function com GDAL, não no navegador.

## Camadas do mapa

Três camadas MapLibre sobre uma única fonte GeoJSON, filtradas por tipo de
geometria (linha, polígono, ponto), com cor por tipo de intervenção: obra
(azul), manutenção (verde), emergência (vermelho).
