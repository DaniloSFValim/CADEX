import { describe, expect, it } from 'vitest';
import { normalizarPlacas, validarComunicacao, type NovaComunicacao } from './comunicacoes';

const base: NovaComunicacao = {
  empresa_id: 'e1', tipo: 'programado', tipo_servico: 'Manutenção de rede', responsavel: 'Fulano', placas: ['ABC1234'],
  local_servico: 'Rua A', descricao: 'Manutenção', inicio_previsto: '2026-12-10', fim_previsto: '2026-12-12',
  inicio_lat: -22.9, inicio_lng: -43.1,
};
const HOJE = '2026-12-01';
const AGORA = new Date('2026-12-01T12:00:00Z');
const emergencia = (ocorrido: string): NovaComunicacao => ({
  ...base, tipo: 'emergencia', inicio_previsto: '', fim_previsto: '2026-12-02', ocorrido_em: ocorrido, protocolo_cisp: null,
});

describe('normalizarPlacas', () => {
  it('separa por vírgula, espaço e quebra de linha, e normaliza', () => {
    expect(normalizarPlacas('abc-1234, ABC1D23\nxyz-9999')).toEqual(['ABC1234', 'ABC1D23', 'XYZ9999']);
  });
  it('ignora separadores sobrando', () => {
    expect(normalizarPlacas(' , ,')).toEqual([]);
  });
});

describe('validarComunicacao: serviço programado', () => {
  it('aceita uma comunicação completa com antecedência', () => {
    expect(validarComunicacao(base, HOJE, AGORA)).toBeNull();
  });
  it('exige responsável', () => {
    expect(validarComunicacao({ ...base, responsavel: '  ' }, HOJE, AGORA)).toMatch(/responsável/);
  });
  it('exige ao menos uma placa', () => {
    expect(validarComunicacao({ ...base, placas: [] }, HOJE, AGORA)).toMatch(/placas/);
  });
  it('recusa placa fora do padrão e mostra qual é', () => {
    expect(validarComunicacao({ ...base, placas: ['ABC1234', 'XYZ'] }, HOJE, AGORA)).toMatch(/XYZ/);
  });
  it('recusa início que já passou, porque o registro precisa ser prévio', () => {
    expect(validarComunicacao({ ...base, inicio_previsto: '2026-11-30' }, HOJE, AGORA)).toMatch(/antes do início/);
  });
  it('recusa fim anterior ao início', () => {
    expect(validarComunicacao({ ...base, fim_previsto: '2026-12-09' }, HOJE, AGORA)).toMatch(/fim/);
  });
  it('exige o local no mapa', () => {
    expect(validarComunicacao({ ...base, inicio_lat: null, inicio_lng: null }, HOJE, AGORA)).toMatch(/mapa/);
  });
  it('exige o tipo de serviço', () => {
    expect(validarComunicacao({ ...base, tipo_servico: ' ' }, HOJE, AGORA)).toMatch(/tipo de serviço/);
  });
});

describe('validarComunicacao: emergência', () => {
  it('aceita registro depois do fato, dentro de 72 horas', () => {
    expect(validarComunicacao(emergencia('2026-11-29T12:00:00Z'), HOJE, AGORA)).toBeNull();
  });
  it('aceita exatamente 72 horas depois do fato', () => {
    expect(validarComunicacao(emergencia('2026-11-28T12:00:00Z'), HOJE, AGORA)).toBeNull();
  });
  it('recusa registro passado de 72 horas', () => {
    expect(validarComunicacao(emergencia('2026-11-28T11:59:00Z'), HOJE, AGORA)).toMatch(/72 horas/);
  });
  it('recusa fato no futuro', () => {
    expect(validarComunicacao(emergencia('2026-12-01T13:00:00Z'), HOJE, AGORA)).toMatch(/futuro/);
  });
  it('exige a data e a hora do fato', () => {
    expect(validarComunicacao({ ...emergencia('2026-11-29T12:00:00Z'), ocorrido_em: null }, HOJE, AGORA)).toMatch(/data e a hora/);
  });
  it('não exige data de início prevista para emergência', () => {
    expect(validarComunicacao({ ...emergencia('2026-11-29T12:00:00Z'), inicio_previsto: '' }, HOJE, AGORA)).toBeNull();
  });
});
