import { describe, expect, it } from 'vitest';
import { FORM_SEM_LICENCA_VAZIO, montarSemLicenca, type FormSemLicenca } from './semLicenca';

const base = (o: Partial<FormSemLicenca> = {}): FormSemLicenca => ({
  ...FORM_SEM_LICENCA_VAZIO, tipo_intervencao: 'servico', escopo: 'Poda de árvores', contratante_orgao_id: 'sec',
  executora_modo: 'propria_orgao', logradouro: 'Rua Visconde do Rio Branco', inicio: '-22.8955, -43.1245', ...o,
});

const erro = (r: ReturnType<typeof montarSemLicenca>) => ('erro' in r ? r.erro : null);

describe('registro sem licença', () => {
  it('própria do órgão: sem empresa, grava o órgão como contratante', () => {
    const r = montarSemLicenca(base());
    expect('linha' in r).toBe(true);
    if (!('linha' in r)) return;
    expect(r.linha).toMatchObject({ executora_modo: 'propria_orgao', executora_id: null, executora_razao_social: null,
      contratante_orgao_id: 'sec', tipo_intervencao: 'servico', licenca_id: null });
  });

  it('empresa cadastrada: grava a executora e zera a razão social digitada', () => {
    const r = montarSemLicenca(base({ executora_modo: 'empresa', executora_id: 'emp1', executora_razao_social: 'lixo' }));
    if (!('linha' in r)) throw new Error('deveria passar');
    expect(r.linha.executora_id).toBe('emp1');
    expect(r.linha.executora_razao_social).toBeNull();
  });

  it('empresa fora do cadastro: exige razão social e CNPJ com 14 dígitos (sem máscara)', () => {
    expect(erro(montarSemLicenca(base({ executora_modo: 'sem_cadastro' })))).toBe('Informe a razão social da empresa executora.');
    expect(erro(montarSemLicenca(base({ executora_modo: 'sem_cadastro', executora_razao_social: 'X Ltda', executora_cnpj: '123' }))))
      .toBe('O CNPJ da empresa precisa ter 14 dígitos.');
    const ok = montarSemLicenca(base({ executora_modo: 'sem_cadastro', executora_razao_social: 'X Ltda', executora_cnpj: '24.144.040/0001-75' }));
    if (!('linha' in ok)) throw new Error('deveria passar');
    expect(ok.linha.executora_cnpj).toBe('24144040000175');
  });

  it('empresa cadastrada é obrigatória quando o modo é empresa', () => {
    expect(erro(montarSemLicenca(base({ executora_modo: 'empresa' })))).toBe('Escolha a empresa executora.');
  });

  it('pede tipo, escopo, contratante e local', () => {
    expect(erro(montarSemLicenca(base({ tipo_intervencao: '' })))).toBe('Escolha o tipo: obra ou serviço.');
    expect(erro(montarSemLicenca(base({ escopo: '  ' })))).toBe('Descreva o escopo da obra ou serviço.');
    expect(erro(montarSemLicenca(base({ contratante_orgao_id: '' })))).toBe('Escolha o órgão contratante.');
    expect(erro(montarSemLicenca(base({ logradouro: '' })))).toBe('Informe o logradouro.');
  });

  it('coordenada fora de Niterói e período invertido são recusados', () => {
    expect(erro(montarSemLicenca(base({ inicio: '-23.5, -43.1' })))).toMatch(/fora de Niterói/);
    expect(erro(montarSemLicenca(base({ inicio_previsto: '2026-10-20', fim_previsto: '2026-10-01' }))))
      .toBe('O fim previsto não pode ser anterior ao início.');
  });

  it('concluída exige a data de conclusão; em execução não guarda data', () => {
    expect(erro(montarSemLicenca(base({ situacao: 'concluida' })))).toBe('Informe a data de conclusão.');
    const r = montarSemLicenca(base({ situacao: 'em_execucao', concluida_em: '2026-10-05' }));
    if (!('linha' in r)) throw new Error('deveria passar');
    expect(r.linha.concluida_em).toBeNull();
  });

  it('documentos em branco viram nulo; o SEI é opcional', () => {
    const r = montarSemLicenca(base({ processo_sei: '   ', contrato_numero: ' CT 9/2026 ' }));
    if (!('linha' in r)) throw new Error('deveria passar');
    expect(r.linha.processo_sei).toBeNull();
    expect(r.linha.contrato_numero).toBe('CT 9/2026');
  });
});
