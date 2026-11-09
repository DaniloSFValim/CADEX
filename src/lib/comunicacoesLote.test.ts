import { describe, expect, it } from 'vitest';
import { interpretarLote, montarLote, type Compartilhado } from './comunicacoesLote';

const base: Compartilhado = {
  empresa_id: 'e1', tipo: 'programado', responsavel: 'Fulano', placas: ['ABC1234'], local_servico: 'Centro',
  descricao: 'Manutenção', inicio_previsto: '2026-12-10', fim_previsto: '2026-12-12',
};
const HOJE = '2026-12-01';
const AGORA = new Date('2026-12-01T12:00:00Z');

describe('interpretarLote', () => {
  it('lê uma linha por local, ignorando linhas vazias', () => {
    const r = interpretarLote('-22.9; -43.12; Manutenção de rede\n\n-22.91; -43.13; Troca de poste');
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => [l.lat, l.lng, l.tipo_servico])).toEqual([[-22.9, -43.12, 'Manutenção de rede'], [-22.91, -43.13, 'Troca de poste']]);
  });
  it('aceita vírgula decimal', () => {
    expect(interpretarLote('-22,9; -43,12; Poda').linhas[0].lat).toBeCloseTo(-22.9);
  });
  it('aponta a linha com formato errado, coordenada inválida ou fora de Niterói', () => {
    const r = interpretarLote('-22.9; -43.12\nabc; -43.1; Poda\n-23.5; -43.1; Poda\n-22.9; -43.1;');
    expect(r.erros.map((e) => e.numero)).toEqual([1, 2, 3, 4]);
    expect(r.erros[0].mensagem).toMatch(/três campos/);
    expect(r.erros[1].mensagem).toMatch(/Latitude inválida/);
    expect(r.erros[2].mensagem).toMatch(/fora de Niterói/);
    expect(r.erros[3].mensagem).toMatch(/tipo de serviço/);
  });
});

describe('montarLote', () => {
  it('monta uma comunicação por linha com os dados comuns', () => {
    const { linhas } = interpretarLote('-22.9; -43.12; Poda\n-22.91; -43.13; Troca');
    const m = montarLote(linhas, base, HOJE, AGORA);
    expect(m.erros).toEqual([]);
    expect(m.comunicacoes).toHaveLength(2);
    expect(m.comunicacoes[1]).toMatchObject({ tipo_servico: 'Troca', inicio_lat: -22.91, inicio_lng: -43.13, responsavel: 'Fulano' });
  });
  it('reprova o lote inteiro para a linha que falha na regra (início já passou)', () => {
    const { linhas } = interpretarLote('-22.9; -43.12; Poda\n-22.91; -43.13; Troca');
    const m = montarLote(linhas, { ...base, inicio_previsto: '2026-11-30' }, HOJE, AGORA);
    expect(m.comunicacoes).toEqual([]);
    expect(m.erros).toHaveLength(2);
    expect(m.erros[0].mensagem).toMatch(/antes do início/);
  });
});
