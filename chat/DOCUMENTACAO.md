# DOCUMENTAÇÃO — Interface de Chat com o Graça Bot

> Interface web de chat para o assistente virtual da Igreja Comunhão da Graça,
> integrado ao agente n8n via webhook HTTP.

---

## Sumário

1. [Estrutura do Projeto](#1-estrutura-do-projeto)
2. [Funcionamento da Interface](#2-funcionamento-da-interface)
3. [Gravação de Áudio (MediaRecorder API)](#3-gravação-de-áudio-mediarecorder-api)
4. [Comunicação com o Webhook do n8n](#4-comunicação-com-o-webhook-do-n8n)
5. [Como Configurar a URL do Webhook](#5-como-configurar-a-url-do-webhook)
6. [Como Rodar o Projeto Localmente](#6-como-rodar-o-projeto-localmente)
7. [Como Adaptar para Produção](#7-como-adaptar-para-produção)
8. [Referência dos Arquivos](#8-referência-dos-arquivos)

---

## 1. Estrutura do Projeto

```
chat/
├── index.html       → Estrutura HTML da página de chat
├── style.css        → Estilos visuais (responsivo, tema da igreja)
├── script.js        → Toda a lógica: envio, áudio, integração n8n
└── DOCUMENTACAO.md  → Esta documentação
```

O projeto **não usa frameworks, bibliotecas externas nem dependências npm**.
É HTML + CSS + JavaScript puro, rodando diretamente no navegador.

---

## 2. Funcionamento da Interface

### Layout geral

```
┌──────────────────────────────────┐
│  CABEÇALHO (Graça Bot · Online)  │
├──────────────────────────────────┤
│                                  │
│   [mensagem do bot] ←            │
│                                  │
│              → [mensagem usuário]│
│                                  │
│   [mensagem do bot] ←            │
│   ... indicador de digitando ... │
│                                  │
├──────────────────────────────────┤
│  [barra de gravação - se ativa]  │
├──────────────────────────────────┤
│  [ Campo de texto ] [Envio] [🎙️] │
└──────────────────────────────────┘
```

### Componentes principais

| Componente | Descrição |
|---|---|
| **Cabeçalho** | Nome do bot, avatar e indicador de status online |
| **Área de mensagens** | Histórico com scroll; mensagens do usuário à direita (azul), do bot à esquerda (branco) |
| **Indicador "digitando…"** | Exibido enquanto aguarda resposta do n8n |
| **Barra de gravação** | Aparece ao iniciar gravação de áudio, com cronômetro e botão cancelar |
| **Campo de texto** | Textarea que se expande automaticamente até 120 px |
| **Botão Enviar** | Ícone de avião; envia texto via POST JSON |
| **Botão Microfone** | Alterna iniciar/parar gravação; fica vermelho durante gravação |
| **Botão de scroll** | Aparece ao subir o histórico; rola de volta ao fim |

### Animações

- **Bolhas de mensagem**: entrada com `translateY` + `scale` (0.22 s)
- **Indicador digitando**: três pontos com bounce defasado
- **Barra de gravação**: slide-up ao aparecer
- **Pulso de gravação**: círculo vermelho com box-shadow pulsante

### Responsividade

| Tela | Comportamento |
|---|---|
| Desktop (> 768 px) | Chat centralizado, max-width 860 px, bordas arredondadas |
| Tablet (≤ 768 px) | Chat ocupa 100% da tela, altura 100dvh, sem bordas |
| Smartphone (≤ 390 px) | Paddings reduzidos, bolhas mais largas (92% da tela) |

---

## 3. Gravação de Áudio (MediaRecorder API)

### Fluxo de gravação

```
Usuário clica em 🎙️
        │
        ▼
navigator.mediaDevices.getUserMedia({ audio: true })
        │ permissão concedida
        ▼
new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        │
        ▼
mediaRecorder.start(250ms)  ← coleta chunks a cada 250 ms
        │
        │ usuário clica em 🎙️ novamente (parar)
        ▼
mediaRecorder.stop()
        │
        ▼
ondataavailable → junta chunks → new Blob(chunks, type)
        │
        ├─ exibe player <audio> no chat (lado do usuário)
        │
        └─ sendAudioToN8n(blob) → POST multipart/form-data
```

### Formatos suportados (prioridade)

O `script.js` testa os formatos nesta ordem e usa o primeiro suportado:

1. `audio/webm;codecs=opus` (Chrome, Edge, Firefox)
2. `audio/webm`
3. `audio/ogg;codecs=opus` (Firefox)
4. `audio/ogg`
5. `audio/mp4` (Safari)

### Cancelamento

O botão **×** na barra de gravação define `state.recordingCancelled = true` antes
de chamar `stop()`. O callback `onstop` checa esse flag e descarta os chunks
sem enviar nada.

### Limite de tempo

A gravação para automaticamente após `CONFIG.maxRecordingSeconds` (padrão: 120 s).
Altere esse valor no objeto `CONFIG` do `script.js`.

---

## 4. Comunicação com o Webhook do n8n

### Mensagens de texto

**Método:** `POST`  
**Content-Type:** `application/json`

**Body enviado:**

```json
{
  "chatInput": "texto digitado pelo usuário",
  "sessionId": "session_1234567890_abc123"
}
```

- `chatInput` → campo que o nó **Chat Trigger** do n8n lê por padrão.
- `sessionId` → ID único gerado por sessão de aba (via `sessionStorage`), mantém o contexto da conversa no agente.

**Resposta esperada do n8n** (qualquer dos formatos abaixo funciona):

```json
{ "output": "Olá! Como posso ajudá-lo?" }
// ou
{ "message": "Olá! Como posso ajudá-lo?" }
// ou
{ "text": "Olá! Como posso ajudá-lo?" }
// ou
[ { "output": "Olá! Como posso ajudá-lo?" } ]
// ou
"Olá! Como posso ajudá-lo?"
```

O frontend tenta extrair a resposta na ordem: `output → message → text → response → JSON.stringify`.

---

### Mensagens de áudio

**Método:** `POST`  
**Content-Type:** `multipart/form-data` (definido automaticamente pelo navegador com o `boundary`)

**Campos enviados:**

| Campo | Tipo | Conteúdo |
|---|---|---|
| `audio` | File | Arquivo de áudio gravado (e.g. `audio_1234567890.webm`) |
| `sessionId` | String | ID de sessão |
| `mimeType` | String | Tipo MIME do áudio (e.g. `audio/webm;codecs=opus`) |

**No n8n**, use um webhook trigger com **Binary Data** habilitado para receber o campo `audio`.
Em seguida, encaminhe para um nó de transcrição (ex: Whisper via OpenAI) ou processe o áudio conforme necessário.

---

### Diagrama de sequência

```
Navegador                                n8n
    │                                      │
    │── POST /webhook/graca-bot ──────────►│
    │   { chatInput, sessionId }           │
    │                                      │── AI Agent
    │                                      │── Ferramentas (SQL, Telegram...)
    │◄── 200 OK { output: "..." } ────────│
    │                                      │
    │ exibe resposta no chat               │
```

---

## 5. Como Configurar a URL do Webhook

Abra o arquivo `script.js` e localize o objeto `CONFIG` no início:

```javascript
const CONFIG = {
  webhookTextUrl:  'https://SEU_N8N/webhook/graca-bot',
  webhookAudioUrl: 'https://SEU_N8N/webhook/graca-bot-audio',
  // ...
};
```

Substitua os valores:

| Variável | Onde encontrar no n8n |
|---|---|
| `webhookTextUrl` | URL do nó **Webhook** ou **Chat Trigger** do seu workflow de texto |
| `webhookAudioUrl` | URL do nó **Webhook** configurado para receber áudio (pode ser o mesmo endpoint se o workflow tratar ambos) |

### Exemplo com n8n Cloud

```javascript
webhookTextUrl:  'https://minha-instancia.app.n8n.cloud/webhook/graca-bot',
webhookAudioUrl: 'https://minha-instancia.app.n8n.cloud/webhook/graca-bot-audio',
```

### Exemplo com n8n self-hosted

```javascript
webhookTextUrl:  'https://n8n.minha-igreja.com.br/webhook/graca-bot',
webhookAudioUrl: 'https://n8n.minha-igreja.com.br/webhook/graca-bot-audio',
```

> ⚠️ **CORS**: certifique-se de que o n8n está configurado para aceitar requisições
> do domínio onde o chat está hospedado. Em desenvolvimento local, use a extensão
> de browser "CORS Unblock" ou configure o n8n com `N8N_CORS_ORIGIN=*` (apenas em dev).

---

## 6. Como Rodar o Projeto Localmente

### Opção 1 — Extensão Live Server (VS Code) ✅ Recomendado

1. Instale a extensão **Live Server** no VS Code
2. Clique com o botão direito em `index.html`
3. Selecione **"Open with Live Server"**
4. A página abrirá em `http://127.0.0.1:5500`

### Opção 2 — Python (sem instalação extra)

```bash
# Python 3
cd chat/
python -m http.server 8080
# Acesse: http://localhost:8080
```

```bash
# Python 2
cd chat/
python -m SimpleHTTPServer 8080
```

### Opção 3 — Node.js (npx serve)

```bash
cd chat/
npx serve .
# Acesse o endereço exibido no terminal
```

### Opção 4 — Abrir diretamente (file://)

> ⚠️ **Limitação**: a gravação de áudio exige um contexto seguro (HTTPS ou localhost).
> Abrir via `file://` bloqueia o acesso ao microfone na maioria dos navegadores.
> Use sempre um servidor local.

---

## 7. Como Adaptar para Produção

### Hospedagem estática

O projeto é 100% estático (sem backend próprio). Pode ser hospedado em:

| Serviço | Gratuito | Como publicar |
|---|---|---|
| **GitHub Pages** | ✅ | Suba a pasta `chat/` no repositório e ative o Pages |
| **Netlify** | ✅ | Arraste a pasta `chat/` no painel do Netlify |
| **Vercel** | ✅ | `vercel --prod` na pasta `chat/` |
| **Cloudflare Pages** | ✅ | Conecte o repositório e aponte para a pasta `chat/` |

### Configurar HTTPS

**Obrigatório em produção** — o acesso ao microfone (`getUserMedia`) só funciona em:
- `https://` (qualquer domínio com SSL)
- `http://localhost` (apenas desenvolvimento)

Todos os serviços acima já fornecem SSL gratuito.

### Variáveis de configuração

Para não expor as URLs do webhook no código-fonte público, considere:

**Opção A — Arquivo de configuração separado (simples):**

Crie um arquivo `config.js` (fora do repositório / no `.gitignore`):

```javascript
// config.js — NÃO versionar este arquivo
window.GRACA_CONFIG = {
  webhookTextUrl:  'https://sua-url-real.com/webhook/graca-bot',
  webhookAudioUrl: 'https://sua-url-real.com/webhook/graca-bot-audio',
};
```

No `index.html`, adicione antes do `script.js`:

```html
<script src="config.js"></script>
```

No `script.js`, substitua o objeto `CONFIG` por:

```javascript
const CONFIG = {
  webhookTextUrl:  window.GRACA_CONFIG?.webhookTextUrl  ?? '',
  webhookAudioUrl: window.GRACA_CONFIG?.webhookAudioUrl ?? '',
  // ...restante das opções
};
```

**Opção B — Variáveis de ambiente via plataforma de hosting:**

Netlify, Vercel e Cloudflare Pages permitem definir variáveis de ambiente
que podem ser injetadas em build. Para um projeto estático puro (sem build),
a Opção A é mais simples.

### Autenticação (opcional)

Se quiser restringir o acesso ao chat, considerre:

- Adicionar uma tela de senha simples em JavaScript
- Usar serviços como Cloudflare Access ou Netlify Identity
- Incorporar o chat em uma página WordPress/Joomla com login existente

### CORS no n8n

Configure a variável de ambiente do n8n para aceitar o domínio do chat:

```env
N8N_CORS_ORIGIN=https://chat.sua-igreja.com.br
```

Ou use `*` para aceitar qualquer origem (não recomendado em produção):

```env
N8N_CORS_ORIGIN=*
```

---

## 8. Referência dos Arquivos

### `index.html`

Estrutura HTML semântica do chat. Seções principais:

| Elemento | ID/Classe | Função |
|---|---|---|
| `<header>` | `.chat-header` | Cabeçalho com nome e status |
| `<main>` | `#chatMessages` | Área de histórico de mensagens |
| `<div>` | `#typingIndicator` | Indicador "digitando…" |
| `<div>` | `#recordingBar` | Barra de gravação com cronômetro |
| `<footer>` | `.chat-input-area` | Campo de texto + botões |
| `<textarea>` | `#messageInput` | Campo de digitação |
| `<button>` | `#sendBtn` | Envia mensagem de texto |
| `<button>` | `#audioBtn` | Inicia/para gravação |

---

### `style.css`

Organizado em seções com comentários:

1. **Reset e variáveis** — tokens de design (cores, tipografia, raios)
2. **Body** — fundo degradê e centralização
3. **Chat Wrapper** — container principal com `flex-direction: column`
4. **Cabeçalho** — gradiente azul, avatar SVG
5. **Área de mensagens** — scroll, padrão de fundo, scrollbar personalizada
6. **Bolhas** — estilos de usuário e bot, animação de entrada
7. **Indicador digitando** — três pontos com keyframe
8. **Barra de gravação** — slide-up, pulso vermelho
9. **Área de input** — textarea auto-resize, botões circulares
10. **Responsividade** — breakpoints 768 px e 390 px
11. **Acessibilidade** — foco visível

---

### `script.js`

Organizado em seções com comentários:

| Seção | Responsabilidade |
|---|---|
| `CONFIG` | Objeto de configuração editável |
| DOM refs | Referências a elementos do HTML |
| `state` | Estado mutável da aplicação |
| Utilitários | `getCurrentTime`, `formatSeconds`, `extractBotResponse`, `sleep` |
| Renderização | `appendTextMessage`, `appendAudioMessage`, separadores de data |
| Scroll | Auto-scroll, botão de "ir ao fim" |
| Typing | `showTyping` / `hideTyping` |
| `sendTextToN8n` | `fetch` POST JSON para o webhook |
| `sendAudioToN8n` | `fetch` POST multipart para o webhook |
| Sessão | `getSessionId` com `sessionStorage` |
| `handleSendText` | Orquestra envio de texto |
| `requestBotResponse` | Exibe digitando, chama API, exibe resposta |
| Gravação | `startRecording`, `stopRecording`, `cancelRecording` |
| Timer | `startRecordingTimer` / `stopRecordingTimer` |
| Eventos | Listeners de clique, Enter, input |
| Boas-vindas | Mensagem inicial do bot |
| `init` | Ponto de entrada |

---

*Documentação gerada para o projeto Graça Bot — Igreja Comunhão da Graça — Itajubá/MG*
