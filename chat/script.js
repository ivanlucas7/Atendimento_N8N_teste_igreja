/* ================================================
   GRAÇA BOT — INTERFACE DE CHAT
   Integração com n8n via Webhook HTTP
   ================================================ */

/* ================================================
   ⚙️  CONFIGURAÇÃO — ALTERE AQUI
   ================================================ */

const CONFIG = {
  /**
   * URL do webhook do n8n para mensagens de TEXTO.
   * Ex: https://seu-n8n.com/webhook/graca-bot
   */
  webhookTextUrl: 'https://lucas5477.app.n8n.cloud/webhook/chat-igreja',

  /**
   * URL do webhook do n8n para mensagens de ÁUDIO.
   * Pode ser a mesma do texto ou um endpoint diferente.
   * Ex: https://seu-n8n.com/webhook/graca-bot-audio
   */
  webhookAudioUrl: 'https://SEU_N8N/webhook/graca-bot-audio',

  /**
   * Nome exibido no chat para as respostas do bot.
   */
  botName: 'Graça Bot',

  /**
   * Tempo máximo de gravação de áudio em segundos.
   * Após esse tempo, a gravação para automaticamente.
   */
  maxRecordingSeconds: 120,

  /**
   * Simular delay de "digitando..." em ms.
   * Dá uma sensação mais natural à conversa.
   */
  typingDelayMs: 1200,

  /**
   * Tempo máximo de espera pela resposta do webhook do n8n (em ms).
   * Agentes de IA costumam demorar 10–40 s. Aumente se necessário.
   * Ex: 60000 = 60 segundos, 120000 = 2 minutos.
   */
  fetchTimeoutMs: 60000,

  /**
   * Chave secreta enviada no header x-api-key.
   * Configure o mesmo valor no nó Webhook do n8n:
   *   Authentication → Header Auth → Name: x-api-key → Value: (esta chave)
   */
  apiKey: 'gcig-2026-xK9q7mP3-vR8sL5nQ',
};

/* ================================================
   REFERÊNCIAS AOS ELEMENTOS DO DOM
   ================================================ */

const chatMessages    = document.getElementById('chatMessages');
const messageInput    = document.getElementById('messageInput');
const sendBtn         = document.getElementById('sendBtn');
const audioBtn        = document.getElementById('audioBtn');
const typingIndicator = document.getElementById('typingIndicator');
const recordingBar    = document.getElementById('recordingBar');
const cancelRecordBtn = document.getElementById('cancelRecordingBtn');
const recordingTimer  = document.getElementById('recordingTimer');
const headerStatus    = document.getElementById('headerStatus');

/* ================================================
   ESTADO DA APLICAÇÃO
   ================================================ */

const state = {
  isRecording:   false,       // Está gravando áudio?
  mediaRecorder: null,        // Instância do MediaRecorder
  audioChunks:   [],          // Chunks de áudio coletados
  timerInterval: null,        // Intervalo do cronômetro de gravação
  timerSeconds:  0,           // Segundos gravados
  recordingCancelled: false,  // Gravação foi cancelada?
  isSending:     false,       // Requisição em andamento?
  botAvailable:  false,       // Webhook respondeu na inicialização?
};

/* ================================================
   UTILIDADES GERAIS
   ================================================ */

/**
 * Retorna a hora atual formatada como "HH:MM".
 */
function getCurrentTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna a data atual formatada para o separador de data.
 */
function getDateLabel() {
  const d = new Date();
  const hoje = new Date();
  // Compara apenas data (sem hora)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Formata segundos como "M:SS".
 */
function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Resolve a resposta do agente, independente do formato retornado pelo n8n.
 * O n8n pode retornar { output }, { message }, { text }, string simples, etc.
 */
function extractBotResponse(data) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return first?.output ?? first?.message ?? first?.text ?? first?.response ?? JSON.stringify(first);
  }
  return data?.output ?? data?.message ?? data?.text ?? data?.response ?? JSON.stringify(data);
}

/* ================================================
   RENDERIZAÇÃO DE MENSAGENS
   ================================================ */

/**
 * Adiciona um separador de data no chat (se necessário).
 * Evita repetir o separador na mesma sessão.
 */
let lastDateLabel = null;
function insertDateSeparatorIfNeeded() {
  const label = getDateLabel();
  if (label !== lastDateLabel) {
    lastDateLabel = label;
    const sep = document.createElement('div');
    sep.className = 'chat-date-separator';
    sep.innerHTML = `<span>${label}</span>`;
    chatMessages.appendChild(sep);
  }
}

/**
 * Cria e insere uma bolha de mensagem de texto no chat.
 *
 * @param {string}  text    - Conteúdo da mensagem.
 * @param {'user'|'bot'|'error'} sender - Remetente.
 * @returns {HTMLElement}   - Elemento criado.
 */
function appendTextMessage(text, sender) {
  insertDateSeparatorIfNeeded();

  const wrapper = document.createElement('div');
  wrapper.className = `message message--${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';

  // Permite quebras de linha e converte URLs em links clicáveis
  bubble.innerHTML = linkifyAndEscape(text);

  const time = document.createElement('span');
  time.className = 'message__time';
  time.textContent = getCurrentTime();

  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  chatMessages.appendChild(wrapper);

  scrollToBottom();
  return wrapper;
}

/**
 * Cria e insere uma bolha de mensagem de áudio no chat.
 *
 * @param {Blob}    audioBlob - Blob do áudio gravado.
 * @param {'user'|'bot'} sender - Remetente.
 */
function appendAudioMessage(audioBlob, sender) {
  insertDateSeparatorIfNeeded();

  const url = URL.createObjectURL(audioBlob);

  const wrapper = document.createElement('div');
  wrapper.className = `message message--${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';

  const audio = document.createElement('audio');
  audio.className = 'message__audio';
  audio.controls = true;
  audio.src = url;
  audio.preload = 'metadata';

  bubble.appendChild(audio);

  const time = document.createElement('span');
  time.className = 'message__time';
  time.textContent = getCurrentTime();

  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  chatMessages.appendChild(wrapper);

  scrollToBottom();
}

/**
 * Escapa HTML e transforma URLs em <a> clicáveis.
 */
function linkifyAndEscape(text) {
  // Escapa caracteres especiais HTML
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Converte quebras de linha em <br>
  const withBr = escaped.replace(/\n/g, '<br>');

  // Transforma URLs em links clicáveis
  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  return withBr.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/* ================================================
   SCROLL AUTOMÁTICO
   ================================================ */

/** Botão de scroll para baixo (criado dinamicamente) */
const scrollBtn = document.createElement('button');
scrollBtn.className = 'scroll-down-btn';
scrollBtn.title = 'Ir para o final';
scrollBtn.setAttribute('aria-label', 'Ir para o final das mensagens');
scrollBtn.innerHTML = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>`;
document.querySelector('.chat-wrapper').appendChild(scrollBtn);

scrollBtn.addEventListener('click', () => scrollToBottom(true));

/**
 * Rola a área de mensagens para o final.
 * @param {boolean} force - Forçar mesmo se o usuário subiu manualmente.
 */
function scrollToBottom(force = false) {
  const el = chatMessages;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

  // Auto-scroll só se estiver a menos de 120px do fundo (ou forçado)
  if (force || distanceFromBottom < 120) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }
}

// Mostra/oculta o botão de "ir ao fim" conforme scroll
chatMessages.addEventListener('scroll', () => {
  const el = chatMessages;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  scrollBtn.classList.toggle('visible', distanceFromBottom > 180);
});

/* ================================================
   INDICADOR DE DIGITAÇÃO
   ================================================ */

function showTyping() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.style.display = 'none';
}

/* ================================================
   HELPER — FETCH COM TIMEOUT
   ================================================ */

/**
 * Wrapper do fetch que aborta automaticamente após CONFIG.fetchTimeoutMs.
 * Lança um erro com mensagem amigável em caso de timeout.
 *
 * @param {string}      url    - URL da requisição.
 * @param {RequestInit} options - Opções do fetch.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `⏱️ O assistente demorou mais de ${CONFIG.fetchTimeoutMs / 1000} segundos para responder. ` +
        'Tente novamente ou aguarde um momento.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}

/* ================================================
   HELPER — PARSE DA RESPOSTA DO WEBHOOK
   ================================================ */

/**
 * Lê o corpo da resposta como texto e tenta parsear como JSON.
 * Se não for JSON válido, retorna o texto puro diretamente.
 * Isso cobre tanto webhooks configurados como "Text" quanto "JSON" no n8n.
 */
async function parseResponseBody(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return extractBotResponse(json);
  } catch {
    // Resposta é texto puro (ex: nó "Respond to Webhook" com Respond With: Text)
    return text.trim();
  }
}

/* ================================================
   COMUNICAÇÃO COM O N8N — TEXTO
   ================================================ */

/**
 * Envia mensagem de texto para o webhook do n8n.
 * Formato: POST application/json
 * Body: { "chatInput": "<mensagem do usuário>", "sessionId": "<id da sessão>" }
 */
async function sendTextToN8n(text) {
  const payload = {
    chatInput: text,
    sessionId: getSessionId(),
  };

  const response = await fetchWithTimeout(CONFIG.webhookTextUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return parseResponseBody(response);
}

/* ================================================
   COMUNICAÇÃO COM O N8N — ÁUDIO
   ================================================ */

/**
 * Envia áudio para o webhook do n8n.
 * Formato: POST multipart/form-data
 * Campos: audio (arquivo), sessionId (string)
 */
async function sendAudioToN8n(audioBlob) {
  const formData = new FormData();
  const fileName = `audio_${Date.now()}.webm`;
  formData.append('audio', audioBlob, fileName);
  formData.append('sessionId', getSessionId());
  formData.append('mimeType', audioBlob.type || 'audio/webm');

  const response = await fetchWithTimeout(CONFIG.webhookAudioUrl, {
    method: 'POST',
    headers: { 'x-api-key': CONFIG.apiKey },
    body: formData,
    // NÃO defina Content-Type — o browser define automaticamente com o boundary
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return parseResponseBody(response);
}

/* ================================================
   SESSÃO — ID ÚNICO POR CONVERSA
   ================================================ */

/**
 * Gera ou recupera um ID de sessão para manter contexto no n8n.
 * Armazenado no sessionStorage (limpa ao fechar a aba).
 */
function getSessionId() {
  let id = sessionStorage.getItem('graca_session_id');
  if (!id) {
    id = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('graca_session_id', id);
  }
  return id;
}

/* ================================================
   FLUXO DE ENVIO DE TEXTO
   ================================================ */

async function handleSendText() {
  const text = messageInput.value.trim();
  if (!text || state.isSending) return;

  // Bloqueia envio se o assistente estiver indisponível
  if (!state.botAvailable) {
    appendTextMessage(text, 'user');
    messageInput.value = '';
    autoResizeTextarea();
    appendTextMessage('O assistente está indisponível no momento. Tente novamente mais tarde.', 'error');
    return;
  }

  // Limpa o input e redimensiona
  messageInput.value = '';
  autoResizeTextarea();

  // Exibe a mensagem do usuário
  appendTextMessage(text, 'user');

  // Inicia fluxo de resposta do bot
  await requestBotResponse(() => sendTextToN8n(text));
}

/* ================================================
   FLUXO DE RESPOSTA DO BOT (compartilhado)
   ================================================ */

/**
 * Exibe typing, aguarda a resposta da API e insere no chat.
 * @param {Function} apiFn - Função assíncrona que chama o webhook.
 */
async function requestBotResponse(apiFn) {
  state.isSending = true;
  setInputEnabled(false);

  // Delay mínimo para animação de "digitando..."
  showTyping();
  await sleep(CONFIG.typingDelayMs);

  try {
    const botReply = await apiFn();
    hideTyping();
    appendTextMessage(botReply, 'bot');
  } catch (err) {
    hideTyping();
    console.error('[GraçaBot] Erro ao chamar o webhook:', err);

    // Timeout = mensagem específica; qualquer outro erro = mensagem simples
    const userMsg = err.name === 'AbortError' || err.message?.startsWith('⏱️')
      ? 'O assistente demorou para responder. Tente novamente em instantes.'
      : 'O assistente está indisponível no momento. Tente novamente mais tarde.';

    appendTextMessage(userMsg, 'error');
  } finally {
    state.isSending = false;
    setInputEnabled(true);
    messageInput.focus();
  }
}

/* ================================================
   GRAVAÇÃO DE ÁUDIO
   ================================================ */

/**
 * Solicita permissão de microfone e inicia a gravação.
 */
async function startRecording() {
  if (state.isRecording) return;

  // Verifica suporte da API
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Seu navegador não suporta gravação de áudio. Use Chrome, Firefox ou Safari moderno.');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      alert('Permissão de microfone negada. Habilite o microfone nas configurações do navegador.');
    } else {
      alert('Erro ao acessar o microfone: ' + err.message);
    }
    return;
  }

  // Determina o melhor formato suportado
  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : {};

  state.audioChunks = [];
  state.recordingCancelled = false;
  state.mediaRecorder = new MediaRecorder(stream, options);

  // Coleta os chunks de áudio
  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      state.audioChunks.push(e.data);
    }
  };

  // Ao parar, processa o áudio (se não cancelado)
  state.mediaRecorder.onstop = async () => {
    // Para as faixas de áudio do stream
    stream.getTracks().forEach(t => t.stop());

    if (state.recordingCancelled) {
      state.audioChunks = [];
      return;
    }

    const blob = new Blob(state.audioChunks, { type: mimeType || 'audio/webm' });
    state.audioChunks = [];

    if (blob.size === 0) {
      appendTextMessage('⚠️ Gravação vazia. Tente novamente.', 'error');
      return;
    }

    // Exibe o áudio gravado no chat (lado do usuário)
    appendAudioMessage(blob, 'user');

    // Envia para o n8n
    await requestBotResponse(() => sendAudioToN8n(blob));
  };

  // Inicia a gravação coletando em intervalos de 250ms
  state.mediaRecorder.start(250);
  state.isRecording = true;

  // Atualiza a UI
  showRecordingBar();
  startRecordingTimer();
  audioBtn.classList.add('recording');

  // Para automaticamente após o tempo máximo
  setTimeout(() => {
    if (state.isRecording) stopRecording();
  }, CONFIG.maxRecordingSeconds * 1000);
}

/**
 * Para a gravação e processa o áudio.
 */
function stopRecording() {
  if (!state.isRecording) return;

  state.isRecording = false;
  state.mediaRecorder.stop();

  hideRecordingBar();
  stopRecordingTimer();
  audioBtn.classList.remove('recording');
}

/**
 * Cancela a gravação sem enviar o áudio.
 */
function cancelRecording() {
  if (!state.isRecording) return;

  state.recordingCancelled = true;
  state.isRecording = false;
  state.mediaRecorder.stop();

  hideRecordingBar();
  stopRecordingTimer();
  audioBtn.classList.remove('recording');
}

/**
 * Retorna o primeiro formato de áudio suportado pelo navegador.
 */
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/* ================================================
   CRONÔMETRO DE GRAVAÇÃO
   ================================================ */

function startRecordingTimer() {
  state.timerSeconds = 0;
  recordingTimer.textContent = '0:00';
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    recordingTimer.textContent = formatSeconds(state.timerSeconds);
  }, 1000);
}

function stopRecordingTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

/* ================================================
   UI DE GRAVAÇÃO
   ================================================ */

function showRecordingBar() {
  recordingBar.style.display = 'flex';
}

function hideRecordingBar() {
  recordingBar.style.display = 'none';
}

/* ================================================
   CONTROLE DO INPUT
   ================================================ */

/**
 * Habilita ou desabilita os controles durante o envio.
 */
function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  sendBtn.style.opacity = enabled ? '1' : '0.5';
}

/**
 * Redimensiona o textarea automaticamente conforme o conteúdo.
 */
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

  // Habilita/desabilita scroll interno ao atingir o máximo
  if (messageInput.scrollHeight > 120) {
    messageInput.style.overflowY = 'auto';
  } else {
    messageInput.style.overflowY = 'hidden';
  }
}

/* ================================================
   UTILITÁRIO — SLEEP
   ================================================ */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================================================
   STATUS DE CONEXÃO
   ================================================ */

/**
 * Atualiza o status no cabeçalho conforme a conectividade.
 */
function updateConnectionStatus() {
  if (navigator.onLine) {
    headerStatus.textContent = 'Online';
  } else {
    headerStatus.textContent = 'Sem conexão';
  }
}

window.addEventListener('online',  updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

/* ================================================
   EVENTOS DE INTERFACE
   ================================================ */

// Enviar mensagem ao clicar no botão
sendBtn.addEventListener('click', handleSendText);

// Enviar mensagem com Enter (Shift+Enter = nova linha)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendText();
  }
});

// Redimensionar textarea ao digitar
messageInput.addEventListener('input', autoResizeTextarea);

// Botão de áudio: alterna iniciar/parar gravação
audioBtn.addEventListener('click', () => {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Cancelar gravação
cancelRecordBtn.addEventListener('click', cancelRecording);

/* ================================================
   TESTE DE CONEXÃO COM O WEBHOOK
   ================================================ */

/**
 * Testa se o webhook do n8n está acessível.
 * Usa um timeout curto (5 s) para não travar a inicialização.
 * Retorna true se qualquer resposta HTTP for recebida (mesmo 4xx/5xx),
 * pois isso confirma que o servidor está no ar.
 * Retorna false apenas em caso de falha de rede ou timeout.
 */
async function checkWebhookReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(CONFIG.webhookTextUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.apiKey,
      },
      body: JSON.stringify({ chatInput: '__ping__', sessionId: getSessionId() }),
      signal: controller.signal,
    });
    return true; // qualquer resposta HTTP = servidor acessível
  } catch {
    return false; // falha de rede ou timeout
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================
   INICIALIZAÇÃO E BOAS-VINDAS
   ================================================ */

/**
 * Testa a conexão e exibe a saudação adequada:
 * - Sucesso: mensagem de boas-vindas do Graça Bot
 * - Falha:   aviso de indisponibilidade
 */
async function init() {
  updateConnectionStatus();
  messageInput.focus();

  // Mostra "Conectando..." enquanto testa
  headerStatus.textContent = 'Conectando…';
  setInputEnabled(false);

  const online = await checkWebhookReachable();

  state.botAvailable = online;

  insertDateSeparatorIfNeeded();

  if (online) {
    headerStatus.textContent = 'Online';
    setInputEnabled(true);
    appendTextMessage(
      `Olá! Sou o assistente virtual da Igreja Comunhão da Graça. 😊

Posso ajudá-lo com informações sobre:
• Horários de cultos e células
• Nossa doutrina e teologia reformada
• Times de ministério e voluntariado
• Processo de discipulado
• Corpo pastoral

Como posso servir você hoje?`,
      'bot'
    );
  } else {
    headerStatus.textContent = 'Indisponível';
    setInputEnabled(false);
    appendTextMessage(
      'O assistente está indisponível no momento. Verifique sua conexão ou tente novamente mais tarde.',
      'error'
    );
  }
}

// Aguarda o DOM estar pronto
document.addEventListener('DOMContentLoaded', init);
