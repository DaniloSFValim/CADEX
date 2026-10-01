import { describe, expect, it } from 'vitest';
import { AVISO_MS, INATIVIDADE_MS, LIMITE_ABSOLUTO_MS, estadoSessao } from './sessao';

const MIN = 60 * 1000;
const login = 1_000_000_000_000;

describe('encerramento da sessão', () => {
  it('ativa enquanto há uso', () => {
    expect(estadoSessao(login + 10 * MIN, login + 5 * MIN, login)).toEqual({ tipo: 'ativa' });
  });
  it('avisa no último minuto e encerra após 30 min parado', () => {
    const ultima = login + 60 * MIN;
    expect(estadoSessao(ultima + INATIVIDADE_MS - AVISO_MS / 2, ultima, login))
      .toEqual({ tipo: 'aviso', motivo: 'inatividade', restanteMs: AVISO_MS / 2 });
    expect(estadoSessao(ultima + INATIVIDADE_MS, ultima, login)).toEqual({ tipo: 'expirada', motivo: 'inatividade' });
  });
  it('encerra 12 h depois do login mesmo em uso', () => {
    const agora = login + LIMITE_ABSOLUTO_MS;
    expect(estadoSessao(agora, agora - MIN, login)).toEqual({ tipo: 'expirada', motivo: 'limite' });
  });
  it('atividade de ontem não derruba quem acabou de entrar', () => {
    const ontem = login - 24 * 60 * MIN;
    expect(estadoSessao(login + MIN, ontem, login)).toEqual({ tipo: 'ativa' });
  });
  it('sessão de ontem, sem uso desde então, expira ao abrir', () => {
    expect(estadoSessao(login + 20 * 60 * MIN, login + 5 * MIN, null).tipo).toBe('expirada');
  });
  it('sem registro nenhum, conta a partir de agora', () => {
    expect(estadoSessao(login, null, null)).toEqual({ tipo: 'ativa' });
  });
});
