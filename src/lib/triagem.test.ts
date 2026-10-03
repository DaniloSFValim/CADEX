import { describe, expect, it } from 'vitest';
import type { Empresa } from './empresas';
import { triagemRisco, type SinaisTriagem } from './triagem';

const HOJE = '2026-10-03';

const emp = (id: string, over: Partial<Empresa> = {}): Empresa => ({
  id, codigo_cadex: `CADEX-${id}`, cnpj: '00000000000191', razao_social: `${id.toUpperCase()} LTDA`,
  nome_fantasia: null, tipo: 'terceirizada', setores: ['telecom'], email: 'x@y.z', telefone: null,
  cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null,
  observacoes: null, situacao: 'apta', processo_numero: null, data_requerimento: null,
  portaria_numero: null, portaria_data: null, validade_ate: '2027-01-01', notificacao_data: null,
  logo_arquivo: null, criado_em: '2026-09-01T00:00:00Z', atualizado_em: '2026-09-01T00:00:00Z', ...over,
});

const vazio: SinaisTriagem = {
  inscricoesVencendo: [], saneamentos: [], analises: [], prazoEncerrado: [], semAsBuilt: [],
};

describe('triagemRisco', () => {
  it('não lista empresa sem pendência', () => {
    expect(triagemRisco([emp('a')], vazio, HOJE)).toEqual([]);
  });

  it('marca inscrição vencida como crítico, com os dias corridos', () => {
    const r = triagemRisco([emp('a', { situacao: 'apta', validade_ate: '2026-09-23' })], vazio, HOJE);
    expect(r).toHaveLength(1);
    expect(r[0].nivel).toBe('critico');
    expect(r[0].motivos[0].texto).toBe('Inscrição vencida há 10 dias');
  });

  it('inscrição em análise vencida não conta (só apta/saneamento vencem)', () => {
    const r = triagemRisco([emp('a', { situacao: 'em_analise', validade_ate: '2026-01-01' })], vazio, HOJE);
    expect(r).toEqual([]);
  });

  it('reúne vários motivos da mesma empresa numa linha só', () => {
    const empresas = [emp('a', { situacao: 'apta', validade_ate: '2026-09-23' })];
    const sinais: SinaisTriagem = {
      ...vazio,
      prazoEncerrado: [{ executora_id: 'a', numero: 'LIC-1', dias: 5 }],
      analises: [{ id: 'a', dias_pendentes: 40 }],
    };
    const r = triagemRisco(empresas, sinais, HOJE);
    expect(r).toHaveLength(1);
    expect(r[0].motivos).toHaveLength(3);
    // Crítico vem antes de acompanhar.
    expect(r[0].motivos.map((m) => m.nivel)).toEqual(['critico', 'critico', 'acompanhar']);
    expect(r[0].nivel).toBe('critico');
  });

  it('ordena crítico acima de atenção acima de acompanhar', () => {
    const empresas = [emp('aten'), emp('crit'), emp('acomp')];
    const sinais: SinaisTriagem = {
      ...vazio,
      inscricoesVencendo: [{ id: 'aten', dias_restantes: 10 }],
      saneamentos: [{ id: 'crit', dias_restantes: 3 }],
      analises: [{ id: 'acomp', dias_pendentes: 20 }],
    };
    expect(triagemRisco(empresas, sinais, HOJE).map((r) => r.id)).toEqual(['crit', 'aten', 'acomp']);
  });

  it('dentro da faixa, mais motivos vêm antes', () => {
    const empresas = [emp('um'), emp('dois')];
    const sinais: SinaisTriagem = {
      ...vazio,
      inscricoesVencendo: [{ id: 'um', dias_restantes: 5 }, { id: 'dois', dias_restantes: 5 }],
      semAsBuilt: [{ executora_id: 'dois', numero: 'LIC-9', dias: 2 }],
    };
    expect(triagemRisco(empresas, sinais, HOJE).map((r) => r.id)).toEqual(['dois', 'um']);
  });

  it('ignora sinal de licença sem empresa cadastrada', () => {
    const sinais: SinaisTriagem = { ...vazio, prazoEncerrado: [{ executora_id: null, numero: 'LIC-0', dias: 9 }] };
    expect(triagemRisco([emp('a')], sinais, HOJE)).toEqual([]);
  });

  it('usa nome fantasia quando houver', () => {
    const r = triagemRisco(
      [emp('a', { nome_fantasia: 'Fibra Já', validade_ate: '2026-09-30' })], vazio, HOJE);
    expect(r[0].nome).toBe('Fibra Já');
    expect(r[0].razaoSocial).toBe('A LTDA');
  });
});
