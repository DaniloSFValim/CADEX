# Variáveis de ambiente

Copie `.env.example` para `.env`. Nenhum valor é embutido no código.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sim | chave anônima (pública por desenho) |
| `VITE_MAP_STYLE_URL` | não | style.json vetorial; vazio usa o fallback OSM |
| `VITE_MAP_CENTER_LNG` / `_LAT` | não | centro inicial do mapa |
| `VITE_MAP_ZOOM` | não | zoom inicial |

Sem as duas primeiras, a aplicação exibe uma tela de "backend não
configurado" e não opera. É deliberado: não há modo de demonstração com
dados falsos.

## Projeto provisionado

| | |
|---|---|
| Projeto Supabase | `cadex-niteroi` |
| Referência | `jqgcgaalqabmnevadqfy` |
| Região | `sa-east-1` (São Paulo) |
| `VITE_SUPABASE_URL` | `https://jqgcgaalqabmnevadqfy.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | painel do Supabase → Project Settings → API Keys |

A chave publicável não está versionada. Ela é pública por desenho — vai
no bundle do navegador —, mas mantê-la fora do repositório permite
rotacioná-la sem reescrever histórico.

## Segredos de servidor — nunca com prefixo `VITE_`

Tudo que começa com `VITE_` é embutido no bundle e visível a qualquer
pessoa. A `service_role` key ignora RLS e só pode existir no ambiente do
agendador (Edge Function, cron, CI), como `SUPABASE_SERVICE_ROLE_KEY`.

## Integrações que aguardam credencial

| Integração | Situação | Ponto de configuração |
|---|---|---|
| E-mail de notificação | não implementada | provedor SMTP/transacional; `notifications.channels` já prevê o canal |
| WhatsApp / SMS | não implementada | idem |
| Integração com o CISP | não implementada | `cisp_protocols.raw_payload` reservado ao payload do sistema de origem |
| Tiles vetoriais | fallback OSM em uso | `VITE_MAP_STYLE_URL` |

Nenhuma dessas foi simulada. Onde a integração não existe, não há botão
que finja enviar.
