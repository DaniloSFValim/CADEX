import { describe, expect, it } from 'vitest';
import { diasAberto, suspensaoAtiva, type Suspensao } from './suspensoes';

const sus = (o: Partial<Suspensao>): Suspensao => ({ id: 's', licenca_id: 'l', inicio: '2026-10-01', fim: null, motivo: 'x', criado_em: '', ...o });

describe('suspensão e pedidos de correção', () => {
  it('a suspensão ativa é a que não tem fim', () => {
    expect(suspensaoAtiva([sus({ id: 'a', fim: '2026-10-05' }), sus({ id: 'b', fim: null })])?.id).toBe('b');
    expect(suspensaoAtiva([sus({ fim: '2026-10-05' })])).toBeNull();
    expect(suspensaoAtiva([])).toBeNull();
  });

  it('dias em aberto contam corridos a partir da data do pedido', () => {
    expect(diasAberto('2026-10-20T15:30:00Z', '2026-10-29')).toBe(9);
    expect(diasAberto('2026-10-29T08:00:00Z', '2026-10-29')).toBe(0);
  });
});
