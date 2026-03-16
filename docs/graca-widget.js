/***
 * GRAÇA WIDGET — Chat pop-up embutível
 * Igreja Comunhão da Graça
 *
 * Como usar em qualquer site:
 *   <script src="graca-widget.js"></script>
 *
 * Configuração opcional (antes do script):
 *   <script>
 *     window.GracaWidgetConfig = {
 *       webhookTextUrl: 'https://SEU_N8N/webhook/graca-bot',
 *       fetchTimeoutMs: 60000,
 *     };
 *   </script>
 */

(function () {
  'use strict';

  /* ================================================
     CONFIGURAÇÃO
  ================================================ */

  // ⚠️  webhookTextUrl e apiKey NÃO têm padrão aqui intencionalmente.
  //    Defina-os em widget/config.js (gerado a partir do .env) ANTES
  //    de carregar este script.
  const CFG = Object.assign({
    webhookTextUrl: '',
    fetchTimeoutMs: 60000,
    typingDelayMs:  1000,
    botName:        'Graça Bot',
    apiKey:         '',
  }, window.GracaWidgetConfig || {});

  if (!CFG.webhookTextUrl || !CFG.apiKey) {
    console.error('[GraçaWidget] webhookTextUrl e apiKey devem ser definidos em window.GracaWidgetConfig (widget/config.js).');
    return;
  }

  /* ================================================
     INJEÇÃO DE CSS (totalmente isolado, prefixo gcw-)
  ================================================ */

  const CSS = `
    /* ── Botão flutuante ── */
    .gcw-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1a5276 0%, #154360 100%);
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 18px rgba(26,82,118,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483646;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .gcw-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 24px rgba(26,82,118,0.55);
    }
    .gcw-fab svg { width: 28px; height: 28px; }

    /* Bolinha vermelha de notificação */
    .gcw-fab-badge {
      position: absolute;
      top: 4px; right: 4px;
      width: 12px; height: 12px;
      background: #e53935;
      border-radius: 50%;
      border: 2px solid #fff;
      display: none;
    }
    .gcw-fab-badge.visible { display: block; }

    /* ── Painel do chat ── */
    .gcw-panel {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      height: 560px;
      max-height: calc(100dvh - 110px);
      background: #e8edf2;
      border-radius: 20px;
      box-shadow: 0 16px 60px rgba(0,0,0,0.28);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483645;
      transform: scale(0.85) translateY(30px);
      opacity: 0;
      pointer-events: none;
      transform-origin: bottom right;
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
    }
    .gcw-panel.gcw-open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Cabeçalho ── */
    .gcw-header {
      background: linear-gradient(135deg, #1a5276 0%, #154360 100%);
      color: #fff;
      padding: 13px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .gcw-avatar {
      width: 38px; height: 38px;
      border-radius: 50%;
      background: rgba(255,255,255,0.13);
      border: 2px solid rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .gcw-avatar svg { width: 100%; height: 100%; }
    .gcw-header-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
    .gcw-header-name { font-family: system-ui,sans-serif; font-size: 15px; font-weight: 700; }
    .gcw-header-status {
      font-family: system-ui,sans-serif;
      font-size: 11px;
      opacity: 0.82;
      display: flex; align-items: center; gap: 4px;
    }
    .gcw-header-status::before {
      content: '';
      display: inline-block;
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #4cde80;
      animation: gcw-pulse-online 2s infinite;
    }
    @keyframes gcw-pulse-online {
      0%,100% { opacity:1; } 50% { opacity:0.4; }
    }
    .gcw-close-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      cursor: pointer;
      border-radius: 50%;
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .gcw-close-btn:hover { background: rgba(255,255,255,0.28); }
    .gcw-close-btn svg { width: 18px; height: 18px; }

    /* ── Mensagens ── */
    .gcw-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scroll-behavior: smooth;
      background-color: #e8edf2;
      background-image: radial-gradient(circle at 1px 1px, rgba(26,82,118,0.05) 1px, transparent 0);
      background-size: 28px 28px;
    }
    .gcw-messages::-webkit-scrollbar { width: 4px; }
    .gcw-messages::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }

    /* Separador de data */
    .gcw-date-sep {
      text-align: center;
      margin: 10px 0 4px;
      font-family: system-ui,sans-serif;
      font-size: 11px;
      color: #6b7c8e;
    }
    .gcw-date-sep span {
      background: rgba(255,255,255,0.75);
      padding: 2px 10px;
      border-radius: 10px;
      font-weight: 600;
    }

    /* Bolha */
    .gcw-msg {
      display: flex;
      flex-direction: column;
      max-width: 80%;
      animation: gcw-msg-in 0.2s ease both;
    }
    @keyframes gcw-msg-in {
      from { opacity:0; transform:translateY(8px) scale(0.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    .gcw-msg--user { align-self: flex-end; align-items: flex-end; }
    .gcw-msg--bot  { align-self: flex-start; align-items: flex-start; }

    .gcw-bubble {
      padding: 9px 13px;
      border-radius: 18px;
      font-family: system-ui,sans-serif;
      font-size: 14px;
      line-height: 1.5;
      word-break: break-word;
    }
    .gcw-msg--user  .gcw-bubble {
      background: #1a5276;
      color: #fff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 2px 6px rgba(26,82,118,0.3);
    }
    .gcw-msg--bot   .gcw-bubble {
      background: #fff;
      color: #1a1a1a;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .gcw-msg--error .gcw-bubble {
      background: #fde8e8;
      color: #c0392b;
      border: 1px solid #f5b7b1;
      font-style: italic;
      border-radius: 12px;
    }
    .gcw-msg-time {
      font-family: system-ui,sans-serif;
      font-size: 10px;
      color: #8a9ab0;
      margin-top: 2px;
      padding: 0 3px;
    }

    /* ── Digitando ── */
    .gcw-typing {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px 2px;
      flex-shrink: 0;
    }
    .gcw-typing-dots {
      background: #fff;
      border-radius: 14px;
      border-bottom-left-radius: 3px;
      padding: 8px 12px;
      display: flex;
      gap: 4px;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .gcw-typing-dots span {
      width: 6px; height: 6px;
      background: #94a3b8;
      border-radius: 50%;
      display: inline-block;
      animation: gcw-dot 1.2s infinite;
    }
    .gcw-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .gcw-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes gcw-dot {
      0%,80%,100% { transform:translateY(0); opacity:0.5; }
      40%          { transform:translateY(-5px); opacity:1; }
    }
    .gcw-typing-label {
      font-family: system-ui,sans-serif;
      font-size: 11px;
      color: #6b7c8e;
      font-style: italic;
    }

    /* ── Input ── */
    .gcw-input-area {
      background: #fff;
      border-top: 1px solid #d0d7de;
      padding: 8px 10px;
      display: flex;
      align-items: flex-end;
      gap: 7px;
      flex-shrink: 0;
    }
    .gcw-input-wrap {
      flex: 1;
      background: #f0f2f5;
      border-radius: 22px;
      border: 1.5px solid transparent;
      padding: 2px 8px;
      display: flex;
      align-items: center;
      transition: border-color 0.15s, background 0.15s;
    }
    .gcw-input-wrap:focus-within {
      border-color: #2e86c1;
      background: #fff;
    }
    .gcw-input {
      width: 100%;
      border: none;
      background: transparent;
      font-family: system-ui,sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      resize: none;
      outline: none;
      max-height: 100px;
      min-height: 34px;
      padding: 7px 4px;
      line-height: 1.4;
      overflow-y: hidden;
    }
    .gcw-input::placeholder { color: #9da8b5; }
    .gcw-send-btn {
      width: 40px; height: 40px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #1a5276 0%, #154360 100%);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(26,82,118,0.35);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .gcw-send-btn:hover  { transform: scale(1.08); }
    .gcw-send-btn:active { transform: scale(0.94); }
    .gcw-send-btn svg { width: 20px; height: 20px; }
    .gcw-send-btn:disabled { opacity: 0.45; cursor: default; transform: none; }

    /* ── Links dentro do bot ── */
    .gcw-msg--bot a { color: #2e86c1; text-decoration: underline; word-break: break-all; }

    /* ── Mobile: painel full-screen ── */
    @media (max-width: 480px) {
      .gcw-panel {
        width: 100%;
        height: 100%;
        bottom: 0; right: 0;
        border-radius: 0;
      }
      .gcw-fab {
        bottom: 18px; right: 18px;
      }
    }
  `;

  /* ================================================
     INJEÇÃO DO CSS NO <head>
  ================================================ */

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'gcw-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ================================================
     CRIAÇÃO DO HTML DO WIDGET
  ================================================ */

  function buildHTML() {
    // Botão flutuante
    const fab = document.createElement('button');
    fab.className = 'gcw-fab';
    fab.setAttribute('aria-label', 'Abrir chat');
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
      <span class="gcw-fab-badge" id="gcw-badge"></span>`;

    // Painel
    const panel = document.createElement('div');
    panel.className = 'gcw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat Graça Bot');
    panel.innerHTML = `
      <!-- Cabeçalho -->
      <div class="gcw-header">
        <div class="gcw-avatar">
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="20" fill="rgba(255,255,255,0.15)"/>
            <rect x="17" y="8" width="6" height="24" rx="3" fill="white"/>
            <rect x="8" y="17" width="24" height="6" rx="3" fill="white"/>
          </svg>
        </div>
        <div class="gcw-header-info">
          <span class="gcw-header-name">${CFG.botName}</span>
          <span class="gcw-header-status" id="gcw-status">Conectando…</span>
        </div>
        <button class="gcw-close-btn" id="gcw-close" aria-label="Fechar chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Mensagens -->
      <div class="gcw-messages" id="gcw-messages" role="log" aria-live="polite"></div>

      <!-- Digitando -->
      <div class="gcw-typing" id="gcw-typing" style="display:none">
        <div class="gcw-typing-dots"><span></span><span></span><span></span></div>
        <span class="gcw-typing-label">${CFG.botName} está digitando…</span>
      </div>

      <!-- Input -->
      <div class="gcw-input-area">
        <div class="gcw-input-wrap">
          <textarea
            id="gcw-input"
            class="gcw-input"
            placeholder="Digite uma mensagem…"
            rows="1"
            maxlength="2000"
            aria-label="Campo de mensagem"
          ></textarea>
        </div>
        <button class="gcw-send-btn" id="gcw-send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    return { fab, panel };
  }

  /* ================================================
     LÓGICA PRINCIPAL (IIFE interna)
  ================================================ */

  function initWidget(fab, panel) {

    const messagesEl = panel.querySelector('#gcw-messages');
    const typingEl   = panel.querySelector('#gcw-typing');
    const inputEl    = panel.querySelector('#gcw-input');
    const sendEl     = panel.querySelector('#gcw-send');
    const closeEl    = panel.querySelector('#gcw-close');
    const statusEl   = panel.querySelector('#gcw-status');
    const badgeEl    = document.getElementById('gcw-badge');

    const state = {
      open:         false,
      initialized:  false,   // teste de conexão já foi feito?
      botAvailable: false,
      isSending:    false,
    };

    /* ── Sessão ── */
    function getSessionId() {
      let id = sessionStorage.getItem('gcw_session');
      if (!id) {
        id = 'gcw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('gcw_session', id);
      }
      return id;
    }

    /* ── Tempo ── */
    function now() {
      return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    /* ── Escape HTML + linkify ── */
    function safeHtml(text) {
      const esc = text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        .replace(/\n/g,'<br>');
      return esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    /* ── Separador de data ── */
    let lastDate = null;
    function maybeInsertDate() {
      const label = 'Hoje';
      if (label !== lastDate) {
        lastDate = label;
        const d = document.createElement('div');
        d.className = 'gcw-date-sep';
        d.innerHTML = `<span>${label}</span>`;
        messagesEl.appendChild(d);
      }
    }

    /* ── Inserir mensagem ── */
    function addMessage(text, type /* 'user' | 'bot' | 'error' */) {
      maybeInsertDate();
      const wrap   = document.createElement('div');
      wrap.className = `gcw-msg gcw-msg--${type}`;
      const bubble = document.createElement('div');
      bubble.className = 'gcw-bubble';
      bubble.innerHTML = safeHtml(text);
      const time   = document.createElement('span');
      time.className = 'gcw-msg-time';
      time.textContent = now();
      wrap.appendChild(bubble);
      wrap.appendChild(time);
      messagesEl.appendChild(wrap);
      scrollDown();

      // Mostra badge se painel fechado e mensagem é do bot
      if (!state.open && type === 'bot') {
        badgeEl.classList.add('visible');
      }
    }

    /* ── Scroll ── */
    function scrollDown() {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    /* ── Typing indicator ── */
    function showTyping() { typingEl.style.display = 'flex'; scrollDown(); }
    function hideTyping() { typingEl.style.display = 'none'; }

    /* ── Controle do input ── */
    function setEnabled(val) {
      inputEl.disabled  = !val;
      sendEl.disabled   = !val;
    }

    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
      inputEl.style.overflowY = inputEl.scrollHeight > 100 ? 'auto' : 'hidden';
    }

    /* ── Fetch com timeout ── */
    async function fetchWithTimeout(url, options) {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), CFG.fetchTimeoutMs);
      try {
        return await fetch(url, { ...options, signal: ctrl.signal });
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new Error('timeout');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    /* ── Parse da resposta (texto ou JSON) ── */
    async function parseBody(res) {
      const txt = await res.text();
      try {
        const json = JSON.parse(txt);
        if (Array.isArray(json)) return json[0]?.output ?? json[0]?.message ?? JSON.stringify(json[0]);
        return json.output ?? json.message ?? json.text ?? json.response ?? JSON.stringify(json);
      } catch {
        return txt.trim();
      }
    }

    /* ── Teste de conexão ── */
    async function checkConnection() {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch(CFG.webhookTextUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CFG.apiKey,
          },
          body: JSON.stringify({ chatInput: '__ping__', sessionId: getSessionId() }),
          signal: ctrl.signal,
        });
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }

    /* ── Enviar texto para o n8n ── */
    async function sendText(text) {
      const res = await fetchWithTimeout(CFG.webhookTextUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CFG.apiKey,
        },
        body: JSON.stringify({ chatInput: text, sessionId: getSessionId() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseBody(res);
    }

    /* ── Fluxo de resposta do bot ── */
    async function getBotReply(apiFn) {
      state.isSending = true;
      setEnabled(false);
      showTyping();

      await new Promise(r => setTimeout(r, CFG.typingDelayMs));

      try {
        const reply = await apiFn();
        hideTyping();
        addMessage(reply, 'bot');
      } catch (err) {
        hideTyping();
        const msg = err.message === 'timeout'
          ? 'O assistente demorou para responder. Tente novamente.'
          : 'O assistente está indisponível no momento.';
        addMessage(msg, 'error');
      } finally {
        state.isSending = false;
        setEnabled(state.botAvailable);
        inputEl.focus();
      }
    }

    /* ── Enviar mensagem ── */
    function handleSend() {
      const text = inputEl.value.trim();
      if (!text || state.isSending) return;
      if (!state.botAvailable) {
        addMessage(text, 'user');
        inputEl.value = '';
        autoResize();
        addMessage('O assistente está indisponível no momento. Tente novamente mais tarde.', 'error');
        return;
      }
      inputEl.value = '';
      autoResize();
      addMessage(text, 'user');
      getBotReply(() => sendText(text));
    }

    /* ── Inicialização da conversa (executada na 1ª abertura) ── */
    async function initConversation() {
      state.initialized = true;
      setEnabled(false);
      statusEl.textContent = 'Conectando…';

      const ok = await checkConnection();
      state.botAvailable = ok;

      if (ok) {
        statusEl.textContent = 'Online';
        setEnabled(true);
        addMessage(
          `Olá! Sou o assistente virtual da Igreja Comunhão da Graça. 😊\n\nPosso ajudá-lo com informações sobre:\n• Horários de cultos e células\n• Nossa doutrina e teologia reformada\n• Times de ministério e voluntariado\n• Processo de discipulado\n• Corpo pastoral\n\nComo posso servir você hoje?`,
          'bot'
        );
      } else {
        statusEl.textContent = 'Indisponível';
        setEnabled(false);
        addMessage('O assistente está indisponível no momento. Tente novamente mais tarde.', 'error');
      }
    }

    /* ── Abrir / fechar painel ── */
    function openPanel() {
      state.open = true;
      panel.classList.add('gcw-open');
      fab.style.display = 'none';
      badgeEl.classList.remove('visible');

      // Primeira abertura: testa conexão e exibe boas-vindas
      if (!state.initialized) {
        initConversation();
      } else {
        inputEl.focus();
      }
    }

    function closePanel() {
      state.open = false;
      panel.classList.remove('gcw-open');
      fab.style.display = 'flex';
      fab.setAttribute('aria-label', 'Abrir chat');
    }

    /* ── Eventos ── */
    fab.addEventListener('click', () => state.open ? closePanel() : openPanel());
    closeEl.addEventListener('click', closePanel);

    sendEl.addEventListener('click', handleSend);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    inputEl.addEventListener('input', autoResize);

    // Fecha com Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) closePanel();
    });
  }

  /* ================================================
     PONTO DE ENTRADA
  ================================================ */

  function mount() {
    if (document.getElementById('gcw-styles')) return; // já montado
    injectStyles();
    const { fab, panel } = buildHTML();
    initWidget(fab, panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
