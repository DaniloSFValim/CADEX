# Auditoria geral do CADEX — novembro de 2026

Escopo: frontend, banco de produção (leitura), permissões, integrações, desempenho e uso real.
Método: além da leitura do código, o sistema foi exercitado de verdade — navegador contra as
páginas públicas de produção, chamadas à API como visitante, consultas ao banco de produção,
logs das últimas 24 horas e a suíte completa (banco, unidade e telas).

## O que não foi possível verificar

- **Área restrita em produção, com login.** Não há credencial de teste. Os fluxos logados foram
  verificados pela suíte de telas (149 testes, backend simulado) e pela suíte do banco (47
  arquivos, Postgres real com todas as migrações), não clicando em produção.
- **Cabeçalhos novos e a regra de `/assets`** (`vercel.json`): só passam a valer no deploy.
- **Tentativas de gravação como visitante em produção**: não foram feitas. A recusa foi conferida
  pelas políticas e pelos privilégios lidos do banco.

## Problemas encontrados

| # | Gravidade | Problema | Onde | Situação |
|---|-----------|----------|------|----------|
| 1 | Alta | Corrigir início e conclusão de uma licença já concluída, no mesmo salvamento, era recusado pelo banco, embora os dados estivessem certos. Um usuário recebeu o erro 28 vezes em 9 minutos (10/11). | `salvar_licenca` | Corrigido |
| 2 | Alta | Toda página pública do mapa recebia 401 ao buscar os tipos de obra: a política chamava `is_servidor()`, que o visitante não pode executar. 42 ocorrências em 24 h. | política `tipos_ler` | Corrigido |
| 3 | Média | Número de licença repetido era informado como "Já existe uma empresa cadastrada com este CNPJ". Ocorreu em produção em 10/11. | `errorMessage` | Corrigido |
| 4 | Média | Indicadores públicos: "de 38 cadastradas e ativas" ao lado de uma consulta que lista 33 empresas. | `estatisticas_publicas` | Corrigido |
| 5 | Média | Erro de tela não tratado deixava a página em branco, sem explicação. | `main.tsx` | Corrigido |
| 6 | Média | Falha de rede ao ler o perfil aparecia como "não está autorizado a usar o sistema". | `auth.tsx`, `App.tsx` | Corrigido |
| 7 | Média | Mapa de marcação de trecho podia desenhar dados desatualizados quando o mapa carregava depois dos dados. | `DesenhoArea.tsx` | Corrigido |
| 8 | Média | Exportação de licenças incluía licenças da empresa de teste. | `relatorioLicencas.ts` | Corrigido |
| 9 | Baixa | Filtro da consulta pública oferecia "EM ANÁLISE" e "VENCIDA", que nunca trazem resultado. | `Consulta.tsx` | Corrigido |
| 10 | Baixa | Avisos do mapa em inglês ("Use Ctrl + scroll to zoom the map"). | mapas | Corrigido |
| 11 | Baixa | Faltavam `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Arquivo de versão antiga em `/assets` devolvia a página inicial em vez de 404. | `vercel.json` | Corrigido |
| 12 | Baixa | Erro ao carregar órgãos na ficha da empresa era descartado em silêncio. | `EmpresaPage.tsx` | Corrigido |
| 13 | Baixa | Duas políticas reavaliavam `auth.uid()` a cada linha. | banco | Corrigido |
| 14 | Baixa | 7 avisos do lint; 3 arquivos sem uso. | vários | Corrigido |

## O que está certo (verificado)

- **Permissões no banco, não só na tela.** Todas as 26 tabelas têm RLS. O visitante não lê
  nenhuma tabela de dados nem chama função restrita (conferido na API de produção). As funções
  `admin_*` conferem `is_administrador()`, que exige verificação em duas etapas. Excluir licença
  direto pela API é barrado por gatilho.
- **Integridade dos dados de produção.** 235 licenças e 39 empresas: nenhum órfão, nenhum
  número duplicado, nenhuma data invertida, nenhuma licença deferida sem número ou sem trecho,
  nenhuma coordenada fora de Niterói, arquivos do storage e registros batem.
- **Retenção das comunicações.** O job diário rodou com sucesso nas duas últimas noites.
- **Dependências.** `npm audit`: 0 vulnerabilidades.
- **Responsividade.** Nenhuma página pública de produção rola na horizontal em 390 px.

## Pendências que dependem de decisão

1. **Leitura sem segunda etapa.** `is_servidor()` não exige a verificação em duas etapas: quem
   tem só a senha de um gestor lê empresas e licenças (não grava). O CISP entra sem segunda
   etapa por desenho. Exigir para todos é decisão de operação.
2. **Proteção contra senha vazada** está desligada no Supabase Auth (painel do Supabase).
3. **Verificação pública de documento** ainda responde para documento emitido à empresa de teste.
   Bloquear impede testar a própria verificação.
4. **Licenças no mapa de empresa não deferida nem apta**, e **Diário Oficial com "em saneamento"**:
   seguem como estavam.
5. **Dados**: licenças 116/2024, 121/2025 e 130/2025 com conclusão em dezembro de 2026 (futuro);
   dois trechos sem bairro.
6. **Legado sem uso**: tabelas `funcionarios`, `veiculos`, `responsaveis_tecnicos` (vazias),
   `licencas_decisao_backup` (72 linhas) e seis buckets vazios. Nada foi apagado.
7. **Criar representante de empresa** exige administrador que também seja gestor; administrador
   de outro perfil recebe recusa do banco (a conta é desfeita, sem resíduo).

## Recomendações para depois

- Política de segurança de conteúdo (CSP): exige teste em produção com mapa, PDF e Supabase.
- Usuário de teste em produção, para auditorias futuras cobrirem a área restrita de verdade.
- O pacote do mapa tem 1,1 MB (296 kB comprimido); já é carregado só nas telas com mapa.
