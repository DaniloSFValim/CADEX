# Testes

## O que roda hoje

```bash
npm run typecheck   # tsc --noEmit — sem erros
npm test            # 14 testes de regra no cliente — passando
npm run build       # build de produção — sucesso
npm run db:test     # migrations + seed + 4 suítes SQL — passando
```

## Suíte de banco

`scripts/test-db.sh` sobe um PostgreSQL+PostGIS efêmero, aplica as
migrations na ordem, carrega o seed e executa cada arquivo de
`supabase/tests/`. Não depende de rede nem de conta Supabase — é o mesmo
comando que roda no CI.

O shim em `scripts/auth-shim.sql` recria `auth.users` e `auth.uid()` para
que as migrations rodem fora do Supabase. **Não vai para produção**: lá o
Supabase já provê ambos.

| Arquivo | Cobre |
|---|---|
| `01_cadex_rules.sql` | CNPJ, ciclo de vida da inscrição, validade de 12 meses, documento vencido, saneamento, inaptidão, deferimento bloqueado, cadeia de subcontratação, ciclo, dias úteis com feriado, imutabilidade da auditoria |
| `02_intervention_rules.sql` | habilitação de executora e subcontratada, snapshot dos papéis, licença prévia, licença vencida, prazo de análise, autodeclaração anterior ao deslocamento, prazo da emergência, requisitos de regularização, endereço da OS, consulta pública por token, ausência de dado pessoal nas views, consulta espacial, idempotência da varredura |
| `03_rls.sql` | isolamento entre empresas, bloqueio de escalação de privilégio, auditoria invisível à empresa, `verify_badge` restrita, painel restrito, fiscal sem personificação, `anon` sem acesso a tabela |
| `04_resolucao_001_2026.sql` | aderência ao articulado: coordenadas do trecho (art. 2º, VII), unificação documental (art. 6º, II, "c"), prazos dos arts. 7º, 8º, 13, 20 e 29, termo inicial das 24h na conclusão (art. 20), acionamento e conteúdo da comunicação ao 153 (art. 19), desqualificação da falsa emergência (art. 20, pú), subscrição da OS (art. 25), restabelecimento após saneamento (art. 8º, § 3º), rol dos arts. 10 e 15, fundamento de todo item de checklist, elementos da placa (art. 14), publicação do art. 7º, § 2º |

`03_rls.sql` roda como papel **não superusuário**. Um teste de RLS como
superusuário passa sempre e não prova nada.

## Bugs que os testes pegaram

Registrados porque a alternativa — afirmar que "tudo funciona" sem rodar —
seria desonesta:

1. `refresh_company_status` retornava cedo para `pendente`, impedindo a
   passagem a INAPTO após o saneamento. A regra estava escrita e não
   funcionava.
2. `regularize_emergency` comparava `text` com `emergency_status` sem
   cast: a regularização abortava em tempo de execução.
3. Fixture de teste com CNPJ inválido — o banco recusou, corretamente.
4. **O prazo do art. 20 corria do acionamento do CISP, não da conclusão
   do atendimento.** Achado na conferência do texto oficial e fixado por
   teste em `04_resolucao_001_2026.sql`. Era o defeito de maior
   consequência: antecipava o termo final e podia fundamentar autuação
   indevida.

## Lacunas conhecidas

- **Sem testes de componente React.** A lógica pura (`src/lib/rules.ts`)
  está coberta; as telas não. Falta jsdom + Testing Library.
- **Sem E2E.** Playwright está previsto e não implementado; exige um
  Supabase de staging.
- **Storage não testado.** O schema `storage` não existe fora do Supabase;
  a migration 06 se autodesativa e suas políticas nunca foram exercidas.
- **Sem teste de carga.** A consulta espacial tem índice GiST, mas o
  comportamento com dezenas de milhares de intervenções não foi medido.
