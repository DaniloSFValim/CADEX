# Testes

## O que roda hoje

```bash
npm run typecheck   # tsc --noEmit — sem erros
npm test            # 63 testes de unidade — passando
npm run build       # build de produção — sucesso
npm run db:test     # migrations + seed + 6 suítes SQL — passando
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
| `05_decisoes_art30.sql` | decisões administrativas: prazo que não se suspende por diligência, obra licenciada que prossegue apesar da inaptidão, publicação da situação cadastral corrente, substituição de poste como manutenção e escavação recusada como manutenção |
| `06_autoridade_decisoria.sql` | cada burla que o banco aceitava antes da migration 11: empresa deferindo a própria licença, lavrando número e vigência, escolhendo o próprio protocolo, empurrando o prazo do art. 13, retroagindo o registro da autodeclaração, adiando a conclusão da emergência e se declarando regularizada sem os requisitos. Cobre ainda a instrução do art. 12, o caminho exato do formulário de 6 etapas sob papel de empresa (EWKT → PostGIS → GeoJSON), o isolamento de `license_draft_rpc` entre empresas e a nomeação das partes do art. 11 |
| `04_resolucao_001_2026.sql` | aderência ao articulado: coordenadas do trecho (art. 2º, VII), unificação documental (art. 6º, II, "c"), prazos dos arts. 7º, 8º, 13, 20 e 29, termo inicial das 24h na conclusão (art. 20), acionamento e conteúdo da comunicação ao 153 (art. 19), desqualificação da falsa emergência (art. 20, pú), subscrição da OS (art. 25), restabelecimento após saneamento (art. 8º, § 3º), rol dos arts. 10 e 15, fundamento de todo item de checklist, elementos da placa (art. 14), publicação do art. 7º, § 2º |

`03_rls.sql` e `06_autoridade_decisoria.sql` rodam como papel **não
superusuário**. Um teste de RLS como superusuário passa sempre e não prova
nada.

### Encoding do cluster de teste

`scripts/test-db.sh` cria o cluster com `--encoding=UTF8 --no-locale` e
aborta se o banco não vier em UTF8. Sem isso o `initdb` herda o locale do
ambiente: numa máquina sem `LANG` sai **SQL_ASCII**, que aceita qualquer
byte e deixa passar problema de acentuação que a produção (UTF8)
recusaria. A collation `C` também torna determinística a ordem alfabética
— que é a ordem de disparo de triggers de mesmo prefixo.

Isto foi encontrado ao gravar um cronograma com acento pela interface: o
banco local recusou o JSON com escape Unicode, coisa que a produção
aceita. O teste passava; o ambiente é que era diferente.

## Suíte de unidade

| Arquivo | Cobre |
|---|---|
| `rules.test.ts` | CNPJ, validade do CADEX, saúde documental, prazo da emergência |
| `geo.test.ts` | conversão GeoJSON → EWKT com SRID explícito, coordenadas digitadas, extensão aproximada, extremos do traçado |
| `geoimport.test.ts` | importação de GeoJSON (FeatureCollection, Feature, geometria nua, GeometryCollection aninhada) e de KML (LineString, Point, Polygon, XML malformado) |
| `licensing.test.ts` | validação das 6 etapas, com ênfase no art. 2º, VII (trecho descrito exige as duas coordenadas) e no art. 12 (os três documentos, e só eles, são obrigatórios) |

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

## O que a suíte local NÃO pegava — e por quê

Três falhas de segurança só apareceram no primeiro deploy num projeto
Supabase real (ver `SECURITY.md`). A causa é metodológica e vale
registrar: os testes inseriam em `work_orders` e chamavam as RPC **como
superusuário**, e superusuário ignora RLS e ignora GRANT. Além disso, o
Postgres local não reproduzia os privilégios-padrão que o Supabase
concede ao papel `anon`.

Duas correções na infraestrutura de teste:

- `scripts/auth-shim.sql` passou a reproduzir o default privilege do
  Supabase (`grant all on tables to anon, authenticated`), de modo que a
  migration 10, que o revoga, seja efetivamente exercida.
- `03_rls.sql` ganhou três blocos: ordem de serviço sob RLS como papel de
  empresa, verificação de que `anon` não executa nenhuma RPC
  administrativa, e uma assertiva genérica que falha se **qualquer**
  tabela ficar com RLS habilitada e sem policy.

O último foi verificado contra o bug original: derrubando as policies de
`work_orders`, a assertiva falha com a mensagem correta.

## O que a suíte ainda não pegava — e o formulário pegou

Percorrer as 6 etapas do licenciamento num navegador, autenticado como
empresa, contra o banco real, encontrou quatro defeitos que nenhum teste
tinha alcançado:

1. **`is_company_active` era SECURITY INVOKER** — nenhuma empresa
   conseguia nomear contratante ou subcontratada (art. 11). Ver
   `SECURITY.md`. Agora coberto por `06_autoridade_decisoria.sql`.
2. **`ErrorNote` escrevia "[object Object]".** O erro do PostgREST não é
   uma `Error`, e o componente caía em `String(error)`. Toda recusa do
   banco — que é onde vivem as regras deste sistema — chegava ilegível ao
   usuário. Foi esse bug que escondeu o defeito nº 1.
3. **`navigate('/')` após o login** levava o usuário ao portal público em
   vez do painel do seu perfil, e nada o tirava de lá.
4. **A camada de rótulo do mapa exigia `glyphs`**, propriedade que o
   estilo raster de fallback não tem: o editor de geometria subia com
   erro no console.

Nenhum deles é detectável por `tsc`, por teste de unidade ou por suíte
SQL. São a razão de a verificação visual não ser opcional.

## Lacunas conhecidas

- **Sem testes de componente React.** A lógica pura (`rules`, `geo`,
  `licensing`) está coberta; as telas não. `jsdom` já é dependência de
  desenvolvimento — falta a Testing Library.
- **Sem E2E na suíte.** A caminhada pelas 6 etapas foi feita com
  Playwright contra um shim local de PostgREST/GoTrue, fora do
  repositório. Virar teste de regressão exige um Supabase de staging.
- **Storage aplicado, mas sem teste automatizado.** A migration 06
  finalmente rodou num projeto real: 6 buckets privados e 5 políticas
  criadas e verificadas por consulta. Continua sem teste na suíte local,
  porque o schema `storage` não existe fora do Supabase — a migration se
  autodesativa ali.
- **Sem teste de carga.** A consulta espacial tem índice GiST, mas o
  comportamento com dezenas de milhares de intervenções não foi medido.
