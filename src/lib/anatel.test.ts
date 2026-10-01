import { describe, expect, it } from 'vitest';
import { cruzar, raizCnpj, rotuloCompetencia, type MunicipioAnatel } from './anatel';
import type { Empresa } from './empresas';

const prov = (nome: string, cnpj: string, acessos: number) =>
  ({ posicao: 0, nome, cnpj, acessos, marketShare: 0, tipoAtuacao: 'PROVEDOR' as const });

const municipio: MunicipioAnatel = {
  nome: 'Niterói', competencia: '2026-07',
  concentracao: { numeroProvedores: 3, totalAcessos: 600 },
  ranking: [prov('Pequena', '11222333000181', 100), prov('Claro', '66970229000167', 400), prov('Média', '44555666000190', 100)],
};

const emp = (cnpj: string, tipo: Empresa['tipo'], razao_social: string) => ({ cnpj, tipo, razao_social }) as Empresa;

describe('cruzamento com a Anatel', () => {
  it('casa pela raiz do CNPJ, inclusive filial', () => {
    const c = cruzar(municipio, [emp('66970229004404', 'operadora', 'Claro S.A.')]);
    expect(c.linhas.map((l) => l.provedor.nome)).toEqual(['Claro', 'Pequena', 'Média']);
    expect(c.linhas[0].empresa?.razao_social).toBe('Claro S.A.');
    expect(c.linhas[1].empresa).toBeNull();
  });
  it('lista operadoras inscritas sem acessos em Niterói; terceirizada não entra', () => {
    const c = cruzar(municipio, [emp('99888777000166', 'operadora', 'Zeta'), emp('55444333000122', 'terceirizada', 'Obras Ltda.')]);
    expect(c.operadorasSemAcessos.map((e) => e.razao_social)).toEqual(['Zeta']);
  });
  it('outro CNPJ do mesmo grupo econômico inscrito', () => {
    const m: MunicipioAnatel = { ...municipio, ranking: [
      { ...prov('Claro', '66970229000167', 400), grupoEconomico: 'TELECOM AMERICAS' },
      { ...prov('Claro', '40432544000147', 10), grupoEconomico: 'TELECOM AMERICAS' },
      { ...prov('Pequena', '11222333000181', 5), grupoEconomico: 'OUTROS' },
      { ...prov('Outra', '44555666000190', 5), grupoEconomico: 'OUTROS' },
    ] };
    const c = cruzar(m, [emp('40432544000147', 'operadora', 'Claro S.A.'), emp('44555666000190', 'terceirizada', 'Outra')]);
    expect(c.linhas[0].empresa).toBeNull();
    expect(c.linhas[0].grupoInscrito?.razao_social).toBe('Claro S.A.');
    expect(c.linhas.find((l) => l.provedor.nome === 'Pequena')?.grupoInscrito).toBeNull();
  });
  it('formata raiz e competência', () => {
    expect(raizCnpj('66.970.229/0001-67')).toBe('66970229');
    expect(rotuloCompetencia('2026-07')).toBe('jul/2026');
  });
});
