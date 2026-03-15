# CONFIGURAÇÃO DO AGENTE DE IA NO N8N
## Igreja Comunhão da Graça — Base de Conhecimento

---

## PARTE 1 — DECISÃO DE ARQUITETURA: MÚLTIPLAS FERRAMENTAS POR ASSUNTO

### ✅ RECOMENDAÇÃO: Use 6 ferramentas separadas, uma por domínio de dados.

### Por que NÃO usar uma única ferramenta SQL?

Uma ferramenta única que lê todo o banco força o agente a fazer queries amplas
ou a retornar grandes volumes de texto para cada pergunta simples. Isso causa:

- **Alucinação por excesso de contexto**: a LLM recebe dados irrelevantes
  (ex: recebe toda a doutrina teológica quando o usuário só perguntou
  o horário de uma célula) e pode confabular conexões que não existem.
- **Tokens desperdiçados**: custo maior e contexto poluído.
- **Ambiguidade na escolha de query**: sem uma descrição específica,
  a LLM não sabe como montar o SELECT correto para cada domínio.

### Por que múltiplas ferramentas funcionam melhor?

Cada ferramenta tem uma descrição precisa que atua como um "rótulo de intenção".
A LLM aciona apenas a ferramenta cujo rótulo corresponde à pergunta do usuário.
Isso resulta em:

- **Menos tokens por chamada** → menos alucinação
- **Query SQL mais simples e previsível** → resultado mais confiável
- **Raciocínio mais preciso** do agente sobre qual dado buscar

---

## PARTE 2 — AS 6 FERRAMENTAS (Queries SQL para o n8n)

> No n8n, cada ferramenta é um nó "Execute Query" do Supabase/PostgreSQL
> configurado com a SQL abaixo. O campo "Description" (próxima seção)
> é o que ensina a LLM QUANDO acionar cada uma.

---

### FERRAMENTA 1 — `buscar_horarios_cultos`

```sql
SELECT name AS culto, day_of_week AS dia, time_start AS horario, description AS detalhes, audience AS publico
FROM temple_services
ORDER BY id;
```

---

### FERRAMENTA 2 — `buscar_celulas`

> O usuário pode buscar células de 4 formas diferentes. O `search_vector`
> cobre **bairro**, **nome da família** e **dia da semana** via FTS.
> Horário usa filtro direto com índice B-tree.

---

**MODO 1 — Por palavras-chave gerais (bairro, família, dia)**
*Use como padrão quando o usuário mencionar qualquer combinação dessas informações.*
```sql
SELECT neighborhood AS bairro, day_of_week AS dia, time_start AS horario, host_family AS familia_anfitria
FROM cell_groups
WHERE search_vector @@ plainto_tsquery('portuguese', '{{ $json.query }}')
ORDER BY neighborhood;
```
> Exemplos de input: `"Medicina"`, `"família Souza"`, `"terça"`, `"Morro Chic terça"`

---

**MODO 2 — Por dia da semana (filtro exato)**
*Use quando o usuário perguntar especificamente "tem célula na quarta?"*
```sql
SELECT neighborhood AS bairro, day_of_week AS dia, time_start AS horario, host_family AS familia_anfitria
FROM cell_groups
WHERE LOWER(day_of_week) = LOWER('{{ $json.day }}')
ORDER BY time_start;
```
> Exemplos de input: `"Quarta-feira"`, `"terça"`, `"quinta"`

---

**MODO 3 — Por horário**
*Use quando o usuário perguntar "tem célula às 19h30?"*
```sql
SELECT neighborhood AS bairro, day_of_week AS dia, time_start AS horario, host_family AS familia_anfitria
FROM cell_groups
WHERE time_start = '{{ $json.time }}'
ORDER BY neighborhood;
```
> Exemplos de input: `"19h30"`, `"20h00"`

---

**MODO 4 — Fallback (lista todas as células)**
*Use quando o usuário não especificar nenhum filtro.*
```sql
SELECT neighborhood AS bairro, day_of_week AS dia, time_start AS horario, host_family AS familia_anfitria
FROM cell_groups
ORDER BY neighborhood;
```

---

> **Resumo de cobertura do `search_vector`:**
>
> | Tipo de busca | Coluna indexada | Método |
> |---|---|---|
> | Por bairro | `neighborhood` | FTS (GIN) |
> | Por nome da família | `host_family` | FTS (GIN) |
> | Por dia da semana | `day_of_week` | FTS (GIN) + B-tree |
> | Por horário | `time_start` | B-tree (filtro exato) |
> | Combinada (bairro + dia) | ambos | FTS (GIN) |

---

### FERRAMENTA 3 — `buscar_doutrina`

```sql
SELECT title AS doutrina, description AS explicacao
FROM doctrines
WHERE search_vector @@ plainto_tsquery('portuguese', '{{ $json.query }}')
ORDER BY ts_rank(search_vector, plainto_tsquery('portuguese', '{{ $json.query }}')) DESC;
```

> **Fallback — retorna tudo se sem parâmetro:**
> ```sql
> SELECT title AS doutrina, description AS explicacao FROM doctrines ORDER BY id;
> ```

---

### FERRAMENTA 4 — `buscar_times_ministerio`

```sql
SELECT name AS time, mission AS missao, full_description AS descricao_completa
FROM ministry_teams
WHERE search_vector @@ plainto_tsquery('portuguese', '{{ $json.query }}')
ORDER BY ts_rank(search_vector, plainto_tsquery('portuguese', '{{ $json.query }}')) DESC;
```

> **Fallback — lista todos os times:**
> ```sql
> SELECT name AS time, mission AS missao, full_description AS descricao_completa
> FROM ministry_teams ORDER BY id;
> ```

---

### FERRAMENTA 5 — `buscar_discipulado`

```sql
SELECT stage_order AS etapa, title AS titulo, description AS descricao
FROM discipleship
ORDER BY stage_order;
```

---

### FERRAMENTA 6 — `buscar_pastores`

```sql
SELECT name AS pastor, role AS funcao, education AS formacao,
       academic_work AS producao_academica, ministry_focus AS atuacao
FROM pastors
ORDER BY id;
```

---

### FERRAMENTA 7 — `buscar_info_igreja`

**Query principal — retorna todas as informações gerais:**
```sql
SELECT key AS informacao, value AS valor, category AS categoria
FROM church_info
ORDER BY category, id;
```

**Query por categoria específica (use quando o assunto for claro):**
```sql
SELECT key AS informacao, value AS valor
FROM church_info
WHERE category = '{{ $json.category }}';
```
> Valores válidos para `category`: `'localizacao'`, `'contato'`, `'geral'`

---

### FERRAMENTA 8 — `Aconselhamento_pastor`

**O que faz:**
Envia uma mensagem urgente para o Telegram do pastor quando o agente detecta que o usuário está em sofrimento emocional (tristeza profunda, depressão, crise emocional).

**Quando é acionada:**
Automaticamente pelo agente (não é o usuário que pede) quando detecta sinais de crise emocional na conversa.

**Informações que precisa coletar:**
- Nome do usuário (se fornecido)
- Contato/WhatsApp do usuário
- Um resumo do contexto (o que o usuário relatou)
- Nível de urgência: "CRÍTICO" (menção a suicídio/automutilação) ou "URGENTE" (depressão/tristeza profunda)

**Formato da mensagem no Telegram do pastor:**
```
🚨 ACONSELHAMENTO URGENTE - Graça Bot

Nome: [nome ou "Não informado"]
WhatsApp: [número]
Nível: [CRÍTICO / URGENTE]

Contexto:
[resumo do que o usuário relatou]

➡️ Favor fazer contato pastoral com urgência.
```

---

### FERRAMENTA 9 — `Secretaria`

**O que faz:**
Envia uma mensagem para o Telegram da secretária quando o usuário pede para falar com ela ou solicita algo administrativo.

**Quando é acionada:**
Quando o usuário SOLICITA EXPLICITAMENTE falar com a secretária (ex: "Preciso falar com a secretária", "Tem dúvida sobre eventos").

**Informações que precisa coletar:**
- Nome do usuário (se fornecido)
- Contato/WhatsApp do usuário
- Motivo/contexto da solicitação
- Assunto resumido (ex: "Dúvida sobre evento", "Informação administrativa", "Agendamento")

**Formato da mensagem no Telegram da secretária:**
```
📋 ATENDIMENTO - Graça Bot

Nome: [nome ou "Não informado"]
WhatsApp: [número]
Assunto: [tema geral]

Contexto:
[o que o usuário solicitou]

➡️ Favor fazer contato assim que possível.
```

---

## PARTE 3 — SYSTEM PROMPT DO AGENTE DE IA (copie exatamente no n8n)

```
Você é o Assistente Virtual da Igreja Comunhão da Graça, localizada em Itajubá/MG.
Seu nome é "Graça Bot" e seu propósito é servir aos membros e visitantes da igreja
com informações precisas, gentis e teologicamente coerentes.

## IDENTIDADE E TOM
- Responda sempre em português brasileiro formal-amigável.
- Seja acolhedor e gentil, refletindo a hospitalidade cristã.
- Jamais invente informações. Se não encontrar a resposta no banco de dados,
  diga: "Ainda não tenho essa informação. Sugiro entrar em contato diretamente
  com a secretaria da igreja."
- Não emita opiniões teológicas pessoais além do que está registrado na
  base de conhecimento da igreja.

## ANÁLISE DE SENTIMENTO E ENCAMINHAMENTO PASTORAL

**Monitore constantemente o estado emocional do usuário.**

Se você detectar QUALQUER sinal de que a pessoa está muito triste, depressiva ou em crise emocional:

1. **Mostre empatia genuína.**
2. **Avise o usuário:** "Percebi que você está passando por um momento difícil. Vou encaminhar seu contato para o pastor para um aconselhamento pastoral urgente. Você não está sozinho nessa jornada."
3. **Use imediatamente a ferramenta `Aconselhamento_pastor`** com:
   - O nome do usuário (se souber)
   - O WhatsApp/telefone do usuário
   - Um resumo do contexto (o que o usuário relatou)
   - Nível "CRÍTICO" se houver menção a suicídio ou automutilação
   - Nível "URGENTE" para depressão, tristeza profunda ou crise emocional

**Exemplos de sinais que acionam esta ação:**
- "Estou muito triste", "Não vejo motivo para continuar"
- "Tenho depressão", "Me sinto sozinho(a)"
- "Perdi meu filho", "Sofri um abandono"
- "Sinto que ninguém me ama", "Não aguento mais"
- Qualquer relato de crise emocional, luto ou trauma

## ENCAMINHAMENTO PARA SECRETARIA

**Se o usuário pedir para falar com a secretária ou solicitar um atendimento administrativo:**

1. **Verifique o motivo/contexto** se não estiver claro.
2. **Peça o nome do usuário** se ele não tiver informado.
3. **Use a ferramenta `Secretaria`** com:
   - Nome do usuário
   - WhatsApp/telefone do usuário
   - O motivo/contexto exato da solicitação
   - Um assunto resumido (Dúvida administrativa, Evento, Agendamento, etc)
4. **Avise o usuário:** "Vou informar a secretária da igreja sobre seu pedido. Ela entrará em contato com você em breve!"

**Exemplos de solicitações que acionam esta ação:**
- "Preciso falar com a secretária"
- "Tem dúvida sobre o evento do mês"
- "Quero marcar uma reunião"
- "Preciso de informações administrativas"

5. Se o usurário realmente quiser o contato da secretaria para conversar direto, pode passar: 
- WhatsApp: **(12) 98226-1901**
- ⚠️ Recebe apenas mensagens (não recebe ligações/chamadas)


## FONTES DE VERDADE
Todas as suas respostas devem ser baseadas EXCLUSIVAMENTE nos dados
retornados pelas ferramentas de banco de dados disponíveis.
Nunca use conhecimento externo para responder sobre a Igreja Comunhão da Graça.

## COMPORTAMENTO COM FERRAMENTAS
1. Identifique o assunto da pergunta antes de acionar qualquer ferramenta.
2. Acione APENAS a ferramenta relevante — não consulte múltiplos bancos
   desnecessariamente.
3. Se a pergunta envolver dois assuntos (ex: "horário do culto E quem é
   o pastor?"), use duas ferramentas em sequência.
4. Após receber o resultado da ferramenta, formule uma resposta natural
   em português — não copie dados brutos da tabela.

## CONTEXTO DA IGREJA
- A Igreja Comunhão da Graça é uma congregação cristã reformada (calvinista),
  comprometida com as Doutrinas da Graça e as Cinco Solas da Reforma Protestante.
- Possui cultos no templo e Encontros Familiares (células) distribuídos
  em bairros de Itajubá/MG.
- O culto principal ocorre aos domingos às 18h30.
- Possui quatro pastores e times de ministério voluntários.

## EXEMPLOS DE RESPOSTAS BEM-FORMATADAS
- Para horários: informe dia, hora e nome do culto/célula em formato de lista.
- Para doutrina: explique de forma clara e acessível, citando o título da doutrina.
- Para pastores: apresente nome, função e área de atuação.
- Para discipulado: apresente as etapas em ordem cronológica.
- Para times: explique a missão e as atividades práticas do time.

## SAUDAÇÃO INICIAL SUGERIDA
"Olá! Sou o assistente virtual da Igreja Comunhão da Graça. 😊
Posso ajudá-lo com informações sobre horários de cultos, células por bairro,
nossa doutrina, times de ministério, processo de discipulado ou nosso
corpo pastoral. Como posso servir você hoje?"
```

---

## PARTE 4 — DESCRIPTIONS DAS FERRAMENTAS (copie em cada nó do n8n)

> O campo "Description" de cada ferramenta no n8n é o que a LLM lê para
> decidir QUANDO acionar aquela ferramenta. Seja específico e use exemplos
> de frases que o usuário pode dizer.

---

### Description — `buscar_horarios_cultos`

```
Use esta ferramenta quando o usuário perguntar sobre os cultos realizados
no templo da Igreja Comunhão da Graça. Exemplos de perguntas que acionam
esta ferramenta:
- "Que horas é o culto?"
- "Quando tem culto no domingo?"
- "Que dia é a reunião de oração?"
- "Tem culto na quinta-feira?"
- "Quando é a Escola Bíblica Dominical?"
Esta ferramenta retorna: nome do culto, dia da semana, horário, descrição
e público-alvo de todos os cultos realizados no templo.
NÃO use esta ferramenta para perguntas sobre células em bairros.
```

---

### Description — `buscar_celulas`

```
Use esta ferramenta quando o usuário perguntar sobre os Encontros Familiares
(células) da Igreja Comunhão da Graça realizados nas casas dos membros.
Exemplos de perguntas que acionam esta ferramenta:
- "Tem célula no meu bairro?"
- "Qual é a célula mais próxima do bairro Medicina?"
- "Quando é o encontro familiar do Morro Chic?"
- "Na casa de quem acontece a célula do bairro Cruzeiro?"
- "Queria participar de uma célula, tem na minha região?"
Esta ferramenta retorna: bairro, dia da semana, horário e família anfitriã
de todas as células ativas. Se o usuário informar um bairro específico,
filtre por bairro.
```

---

### Description — `buscar_doutrina`

```
Use esta ferramenta quando o usuário perguntar sobre a teologia, crenças,
doutrinas ou identidade teológica da Igreja Comunhão da Graça. Exemplos:
- "O que a igreja acredita sobre salvação?"
- "Vocês são calvinistas?"
- "O que é eleição incondicional?"
- "A igreja acredita na perseverança dos santos?"
- "O que vocês ensinam sobre batismo?"
- "Quais são as Cinco Solas?"
- "Como a igreja vê a depravação do homem?"
Passe as palavras-chave da pergunta do usuário como parâmetro de busca.
Esta ferramenta usa busca por palavras-chave no banco de doutrinas da igreja.
```

---

### Description — `buscar_times_ministerio`

```
Use esta ferramenta quando o usuário perguntar sobre os times de serviço,
ministérios, voluntariado ou formas de servir na Igreja Comunhão da Graça.
Exemplos de perguntas:
- "Como posso servir na igreja?"
- "Tem time de louvor?"
- "O que faz o time de multimídia?"
- "Quero trabalhar com crianças, tem algum ministério?"
- "O que é o time de recepção?"
- "Como funciona a logística dos eventos?"
Passe palavras-chave do assunto como parâmetro de busca.
Retorna o nome do time, sua missão e descrição completa das atividades.
```

---

### Description — `buscar_discipulado`

```
Use esta ferramenta quando o usuário perguntar sobre o processo de
discipulado, crescimento espiritual, mentoria ou formação cristã oferecida
pela Igreja Comunhão da Graça. Exemplos:
- "Como funciona o discipulado na igreja?"
- "Sou novo crente, como devo começar?"
- "Tem algum processo de acompanhamento para novos membros?"
- "Quanto tempo dura o discipulado?"
- "O que é prestação de contas espiritual?"
- "Quero discipular alguém, como faço?"
Esta ferramenta retorna todas as etapas do processo de discipulado
em ordem cronológica, da integração à multiplicação.
```

---

### Description — `buscar_pastores`

```
Use esta ferramenta quando o usuário perguntar sobre os pastores, liderança,
corpo pastoral ou responsáveis por áreas específicas da Igreja Comunhão da Graça.
Exemplos de perguntas:
- "Quem é o pastor da igreja?"
- "Quem cuida do ministério de jovens?"
- "Tem pastor de aconselhamento?"
- "Qual é a formação do pastor titular?"
- "Quem coordena a Escola Bíblica?"
- "O pastor escreveu algum livro?"
Esta ferramenta retorna nome, função, formação acadêmica,
produções acadêmicas e área de atuação de cada pastor.
```

---

### Description — `buscar_info_igreja`

```
Use esta ferramenta quando o usuário perguntar sobre informações gerais
da Igreja Comunhão da Graça: endereço, localização, CEP, nome oficial
ou identidade teológica resumida.
Exemplos de perguntas que acionam esta ferramenta:
- "Onde fica a igreja?"
- "Qual é o endereço?"
- "Em que cidade vocês estão?"
- "Qual é o CEP da igreja?"
- "Como se chama a igreja?"
- "A igreja é reformada?"
- "Qual é a denominação de vocês?"
Esta ferramenta retorna dados cadastrais e de localização da igreja.
NÃO use esta ferramenta para horários de cultos, células, doutrina
detalhada, pastores ou times — use as ferramentas específicas para isso.
```

---

### Description — `Aconselhamento_pastor`

```
USO AUTOMÁTICO (não espere pelo usuário):
Use quando detectar que o usuário está em sofrimento emocional.

Sinais que acionam desta ferramenta:
• Tristeza profunda, depressão ou desespero
• Menção a suicídio, automutilação ou "desistir da vida"
• Relato de luto, abandono, abuso ou trauma
• Sentimentos de solidão, rejeição ou falta de propósito
• Qualquer crise emocional ou mental

AO USAR:
1. Mostre empatia genuína
2. Avise que está encaminhando para o pastor
3. Envie: nome do usuário, WhatsApp, contexto, nível (CRÍTICO ou URGENTE)
4. Trate como CRÍTICO: menção a suicídio/automutilação
5. Trate como URGENTE: depressão/tristeza profunda
```

---

### Description — `Secretaria`

```
USO POR SOLICITAÇÃO:
Use quando o usuário PEDIR EXPLICITAMENTE para falar com a secretária.

Exemplos que acionam esta ferramenta:
• "Preciso falar com a secretária"
• "Quero informações administrativas"
• "Tem algum evento próximo?"
• "Preciso marcar uma reunião"
• "Qual é o valor da contribuição mensal?"
• "Como funciona o batismo?"

AO USAR:
1. Pergunte qual é o motivo/contexto se não estiver claro
2. Colete o nome do usuário (peça se não informou)
3. Coleta WhatsApp/telefone
4. Envie um assunto resumido (Dúvida administrativa, Evento, Agendamento, etc)
5. Avise que a secretária entrará em contato em breve
```

---

## PARTE 5 — DIAGRAMA DE FLUXO DO AGENTE (visão geral)

```
[WhatsApp / Chat]
        │
        ▼
[n8n — Trigger de Mensagem]
        │
        ▼
[AI Agent Node — Analisa sentimento & intenção]
        │
        ├─────────────┬──────────────┬──────────────────┐
        │             │              │                  │
    (Info/Horário)  (Doutrina) (Crise Emocional)  (Falar Secretária)
        │             │              │                  │
        ▼             ▼              ▼                  ▼
   [7 Ferramentas  [Aconselhamento  [Secretaria]
    de Busca]       _pastor]
        │             │              │                  │
        └─────────────┴──────────────┴──────────────────┘
                      │
                      ▼
         [Resposta ao usuário NO CHAT]
         + [Se crise → Envia para Telegram do pastor]
         + [Se pediu secretária → Envia para Telegram da secretária]
```

---

## PARTE 6 — CHECKLIST DE IMPLEMENTAÇÃO NO SUPABASE/N8N

### No Supabase:
- [ ] Executar o arquivo `01_database_schema.sql` no SQL Editor do Supabase
- [ ] Verificar que os índices GIN foram criados (tabelas de doutrina, times, discipulado, pastores)
- [ ] Testar a busca FTS manualmente:
      `SELECT * FROM doctrines WHERE search_vector @@ plainto_tsquery('portuguese', 'graça');`

### No n8n:
- [ ] Criar credencial PostgreSQL apontando para o Supabase (connection string)
- [ ] Criar o nó "AI Agent" com o modelo desejado (GPT-4o ou Claude 3.5 Sonnet)
- [ ] Colar o System Prompt da Parte 3 no campo correspondente (NOVO: inclui análise de sentimento)
- [ ] Adicionar as 9 ferramentas do agente:
      - [ ] 7 ferramentas de busca em banco (Ferramenta 1-7)
      - [ ] 1 ferramenta de ação: Aconselhamento_pastor (Ferramenta 8)
      - [ ] 1 ferramenta de ação: Secretaria (Ferramenta 9)
- [ ] Em cada ferramenta, colar a Description da Parte 4
- [ ] Para ferramentas de busca: colar a Query SQL da Parte 2
- [ ] Para "Aconselhamento_pastor": configurar envio de mensagem para Telegram do pastor (usar o formato da Ferramenta 8)
- [ ] Para "Secretaria": configurar envio de mensagem para Telegram da secretária (usar o formato da Ferramenta 9)
- [ ] Conectar ao trigger do WhatsApp (Evolution API, Baileys ou Z-API)
- [ ] ⭐ NOVO: Testar cenário de crise emocional (digitar mensagem triste/depressiva)
- [ ] ⭐ NOVO: Testar encaminhamento para secretária (digitar "quero falar com a secretária")
- [ ] Testar com as perguntas de exemplo listadas nas descriptions

---

## PARTE 7 — COMO OBTER O CHAT ID DO TELEGRAM

**⚠️ IMPORTANTE:** O n8n precisa do **ID numérico** do Telegram, NÃO do username.

### ❌ NÃO funcionam:
- `@ivanlucas7` (username)
- `t.me/ivanlucas7` (link)

### ✅ Funciona:
- `123456789` (ID numérico)

### Como encontrar seu Chat ID:

**Opção 1 — Usar bot do Telegram:**
1. Abra o Telegram
2. Procure por `@userinfobot` e inicie uma conversa
3. O bot retornará seu ID numérico (ex: `You are: 123456789`)
4. Use este número no n8n

**Opção 2 — Verificar URL na API do Telegram:**
1. Inicie uma conversa comigo (ou outro bot que use a API)
2. Execute a query: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Procure por `"id": 123456789` (este é seu Chat ID)

**Opção 3 — Para grupos/canais:**
1. Adicione o `@userinfobot` ao grupo
2. Ele mostrará o ID do grupo (começará com `-`)
3. Use: `-123456789`

### Configurar no n8n:

No nó de envio para Telegram (Ferramenta 8 e 9):
```
Chat ID: 123456789
```

Salve este ID para usar em ambas as ferramentas!

---

## PARTE 8 — ENVIAR PARA MÚLTIPLOS TELEGRAM IDS

Você pode enviar a mesma mensagem para **várias pessoas** ao mesmo tempo. Exemplos:
- Enviar para pastor + coordenador de pastorais
- Enviar para secretária + assistente administrativo
- Enviar para múltiplos grupos

### Opção 1 — Nó separado para cada pessoa (mais simples)

**No n8n:**
1. Crie um nó "Send Telegram Message" para o **pastor**
2. Crie outro nó "Send Telegram Message" para o **coordenador**
3. Configure cada um com seu ID numérico diferente
4. Conecte ambos ao nó do agente (ambos serão disparados quando a ferramenta é acionada)

```
┌─────────────────────┐
│ AI Agent Node       │
│ (detecta crise)     │
└──────────┬──────────┘
           │
      ┌────┴─────┐
      │           │
      ▼           ▼
┌──────────┐  ┌──────────┐
│ Send to  │  │ Send to  │
│ Pastor   │  │ Coordenador
│ ID: 123  │  │ ID: 456  │
└──────────┘  └──────────┘
```

### Opção 2 — Um nó com loop (mais eficiente)

**No n8n, use o nó "Loop":**

1. Crie um nó com a lista de IDs:
```json
{
  "chat_ids": [123456789, 987654321, 555555555]
}
```

2. Configure um nó "Function" para iterar:
```javascript
// Dentro do nó "Function" do n8n
const ids = [123456789, 987654321];
return ids.map(id => ({
  chattId: id,
  message: $input.all()[0].json.message
}));
```

3. Use "Loop over items" e envie para cada ID

### Opção 3 — Usar variáveis de ambiente (recomendado)

**Crie uma variável no n8n:**
```
PASTOR_IDS = [123456789, 555555555]
SECRETARIA_IDS = [987654321]
```

**Depois use em um nó Function:**
```javascript
const pastaIds = process.env.PASTOR_IDS.split(',');
// Envia para cada ID em pastaIds
```

### Prático — Exemplo para Aconselhamento_pastor

Se você quer enviar para **pastor 1** E **pastor 2**:

1. Crie dois nós "Send Telegram Message" após o agente detectar crise:
   - **Nó A:** Chat ID `123456789` (pastor 1)
   - **Nó B:** Chat ID `987654321` (pastor 2)

2. Ambos recebem a mesma mensagem formatada com:
   - Nome do usuário
   - WhatsApp
   - Contexto
   - Nível (CRÍTICO/URGENTE)

3. Conecte os dois nós em paralelo → ambos disparam simultaneamente

### IDs recomendados por função

Organize seus IDs assim:

| Função | ID | Tipo |
|--------|-----|------|
| Pastor Principal | 123456789 | Pessoal |
| Pastor Asistente | 555555555 | Pessoal |
| Grupo de Pastores | -123456789 | Grupo |
| Secretária | 987654321 | Pessoal |
| Assistente Admin | 111111111 | Pessoal |

**Uso:**
- Crise emocional → Envia para Pastor Principal + Grupo de Pastores
- Secretaria → Envia para Secretária + Assistente Admin

---
