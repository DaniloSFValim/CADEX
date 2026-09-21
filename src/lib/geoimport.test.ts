// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importGeometryFile } from './geo';

const file = (name: string, content: string, type = ''): File =>
  new File([content], name, { type });

describe('importação de GeoJSON', () => {
  it('lê uma FeatureCollection e usa a primeira feição utilizável', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-43.1, -22.88], [-43.11, -22.89]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-43.2, -22.9] } },
      ],
    };
    const r = await importGeometryFile(file('tracado.geojson', JSON.stringify(fc)));
    expect(r.source).toBe('geojson');
    expect(r.geometry.type).toBe('LineString');
    expect(r.featureCount).toBe(2);
  });

  it('lê uma Feature isolada', async () => {
    const f = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-43.1, -22.88] } };
    const r = await importGeometryFile(file('ponto.geojson', JSON.stringify(f)));
    expect(r.geometry).toEqual({ type: 'Point', coordinates: [-43.1, -22.88] });
  });

  it('lê uma geometria nua', async () => {
    const g = { type: 'Polygon', coordinates: [[[-43.1, -22.88], [-43.2, -22.88], [-43.2, -22.9], [-43.1, -22.88]]] };
    const r = await importGeometryFile(file('area.json', JSON.stringify(g)));
    expect(r.geometry.type).toBe('Polygon');
  });

  it('desce na GeometryCollection até achar algo utilizável', async () => {
    const g = {
      type: 'GeometryCollection',
      geometries: [{ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [-43.1, -22.88] }] }],
    };
    const r = await importGeometryFile(file('col.geojson', JSON.stringify(g)));
    expect(r.geometry.type).toBe('Point');
  });

  it('avisa quando o arquivo não é JSON', async () => {
    await expect(importGeometryFile(file('x.geojson', 'não é json'))).rejects.toThrow(/não é JSON/);
  });

  it('avisa quando não há geometria aproveitável', async () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: null }] };
    await expect(importGeometryFile(file('vazio.geojson', JSON.stringify(fc))))
      .rejects.toThrow(/não traz ponto, linha nem polígono/);
  });
});

describe('importação de KML', () => {
  const kml = (inner: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2">
       <Document><Placemark><name>Trecho</name>${inner}</Placemark></Document></kml>`;

  it('lê LineString e converte para GeoJSON na ordem lng lat', async () => {
    const r = await importGeometryFile(file(
      'tracado.kml',
      kml('<LineString><coordinates>-43.1036,-22.8832,0 -43.1018,-22.8815,0</coordinates></LineString>'),
    ));
    expect(r.source).toBe('kml');
    expect(r.geometry).toEqual({
      type: 'LineString',
      coordinates: [[-43.1036, -22.8832], [-43.1018, -22.8815]],
    });
  });

  it('lê Point', async () => {
    const r = await importGeometryFile(file(
      'ponto.kml', kml('<Point><coordinates>-43.1036,-22.8832,0</coordinates></Point>'),
    ));
    expect(r.geometry).toEqual({ type: 'Point', coordinates: [-43.1036, -22.8832] });
  });

  it('lê Polygon pelo anel externo', async () => {
    const r = await importGeometryFile(file('area.kml', kml(
      `<Polygon><outerBoundaryIs><LinearRing><coordinates>
         -43.10,-22.88,0 -43.11,-22.88,0 -43.11,-22.89,0 -43.10,-22.88,0
       </coordinates></LinearRing></outerBoundaryIs></Polygon>`,
    )));
    expect(r.geometry.type).toBe('Polygon');
    expect((r.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(4);
  });

  it('reconhece KML pelo conteúdo mesmo sem a extensão', async () => {
    const r = await importGeometryFile(file(
      'sem-extensao', kml('<Point><coordinates>-43.1,-22.88</coordinates></Point>'),
    ));
    expect(r.source).toBe('kml');
  });

  it('avisa quando o XML está malformado', async () => {
    await expect(importGeometryFile(file('x.kml', '<kml><Placemark>')))
      .rejects.toThrow(/XML malformado/);
  });

  it('avisa quando o KML não traz geometria utilizável', async () => {
    await expect(importGeometryFile(file('x.kml', kml('<description>sem geometria</description>'))))
      .rejects.toThrow(/não traz ponto, linha nem polígono/);
  });
});
