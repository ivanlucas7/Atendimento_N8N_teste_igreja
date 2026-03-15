-- ============================================================
-- BANCO DE CONHECIMENTO - IGREJA COMUNHÃO DA GRAÇA
-- Supabase / PostgreSQL
-- Arquiteto: Agente IA Sênior | Data: 2026-02-28
-- ============================================================
-- DECISÃO DE MODELAGEM:
-- Estrutura HÍBRIDA:
--   • Tabelas normalizadas para dados estruturados (schedules, pastors, cells)
--   • Colunas TEXT para descrições longas (doctrine, teams, discipleship)
--   • Coluna gerada `search_vector` (tsvector, pt-BR) em tabelas textuais
--     para Full-Text Search eficiente sem embeddings externos.
-- Esta escolha acelera buscas semânticas leves via SQL puro e elimina
-- dependência de extensão pgvector para o MVP.
-- ============================================================

-- Habilite a extensão de Full-Text Search (já disponível no PostgreSQL padrão)
-- Nenhuma extensão extra é necessária para tsvector.

-- ============================================================
-- TABELA 1: INFORMAÇÕES GERAIS DA IGREJA
-- ============================================================
CREATE TABLE IF NOT EXISTS church_info (
    id          SERIAL PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,   -- identificador semântico da info
    value       TEXT NOT NULL,          -- valor legível
    category    TEXT NOT NULL           -- ex: 'contato', 'localizacao', 'geral'
);

-- ============================================================
-- TABELA 2: CULTOS NO TEMPLO
-- ============================================================
CREATE TABLE IF NOT EXISTS temple_services (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,          -- nome do culto/reunião
    day_of_week TEXT NOT NULL,          -- ex: 'Domingo', 'Quinta-feira'
    time_start  TEXT NOT NULL,          -- ex: '09h00'
    description TEXT,                  -- detalhes adicionais
    audience    TEXT DEFAULT 'Todas as idades'
);

-- ============================================================
-- TABELA 3: CÉLULAS (ENCONTROS FAMILIARES)
-- Com coluna tsvector para busca por bairro via Full-Text Search
-- e índice B-tree para lookup exato rápido.
-- ============================================================
CREATE TABLE IF NOT EXISTS cell_groups (
    id              SERIAL PRIMARY KEY,
    neighborhood    TEXT NOT NULL,      -- bairro
    day_of_week     TEXT NOT NULL,
    time_start      TEXT NOT NULL,      -- ex: '19h30'
    host_family     TEXT NOT NULL,      -- nome da família anfitriã
    notes           TEXT,               -- observações opcionais
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('portuguese',
                            coalesce(neighborhood, '')  || ' ' ||
                            coalesce(host_family, '')   || ' ' ||
                            coalesce(day_of_week, '')   || ' ' ||
                            coalesce(notes, '')
                        )
                    ) STORED
);

-- Índice GIN para Full-Text Search
-- Cobre buscas por: bairro, nome da família, dia da semana e notas
CREATE INDEX IF NOT EXISTS idx_cell_groups_fts ON cell_groups USING GIN(search_vector);

-- Índice B-tree para filtro exato por bairro (ORDER BY, lookup direto)
CREATE INDEX IF NOT EXISTS idx_cell_groups_neighborhood ON cell_groups (neighborhood);

-- Índice B-tree para filtro por dia da semana (ex: 'Terça-feira')
CREATE INDEX IF NOT EXISTS idx_cell_groups_day ON cell_groups (day_of_week);

-- Índice B-tree para filtro por horário (ex: '19h30')
CREATE INDEX IF NOT EXISTS idx_cell_groups_time ON cell_groups (time_start);

-- ============================================================
-- TABELA 4: DOUTRINA REFORMADA
-- Com coluna tsvector gerada para Full-Text Search em português
-- ============================================================
CREATE TABLE IF NOT EXISTS doctrines (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    category        TEXT DEFAULT 'Doutrina Reformada',
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(description, ''))
                    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_doctrines_fts ON doctrines USING GIN(search_vector);

-- ============================================================
-- TABELA 5: TIMES DE MINISTÉRIO
-- Com coluna tsvector gerada para Full-Text Search em português
-- ============================================================
CREATE TABLE IF NOT EXISTS ministry_teams (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    mission         TEXT NOT NULL,      -- resumo da missão
    full_description TEXT NOT NULL,     -- descrição completa
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(mission, '') || ' ' || coalesce(full_description, ''))
                    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_ministry_teams_fts ON ministry_teams USING GIN(search_vector);

-- ============================================================
-- TABELA 6: PROCESSO DE DISCIPULADO
-- Com coluna tsvector gerada para Full-Text Search
-- ============================================================
CREATE TABLE IF NOT EXISTS discipleship (
    id              SERIAL PRIMARY KEY,
    stage_order     INTEGER NOT NULL,   -- ordem da etapa
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(description, ''))
                    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_discipleship_fts ON discipleship USING GIN(search_vector);

-- ============================================================
-- TABELA 7: CORPO PASTORAL
-- Com coluna tsvector gerada para Full-Text Search
-- ============================================================
CREATE TABLE IF NOT EXISTS pastors (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL,      -- ex: 'Pastor Titular'
    education       TEXT NOT NULL,
    academic_work   TEXT,
    ministry_focus  TEXT NOT NULL,
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(role, '') || ' ' || coalesce(education, '') || ' ' || coalesce(academic_work, '') || ' ' || coalesce(ministry_focus, ''))
                    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_pastors_fts ON pastors USING GIN(search_vector);


-- ============================================================
-- ============================================================
-- INSERT DATA
-- ============================================================
-- ============================================================

-- ============================================================
-- 1. INFORMAÇÕES GERAIS
-- ============================================================
INSERT INTO church_info (key, value, category) VALUES
('nome_igreja',     'Igreja Comunhão da Graça',             'geral'),
('endereco',        'Rua das Oliveiras, 245 – Centro',      'localizacao'),
('cidade_estado',   'Itajubá/MG',                           'localizacao'),
('cep',             '37500-000',                            'localizacao'),
('endereco_completo','Rua das Oliveiras, 245 – Centro – Itajubá/MG | CEP: 37500-000', 'localizacao'),
('identidade_teologica', 'Igreja Reformada / Calvinista – Filiada às Doutrinas da Graça e às Cinco Solas da Reforma Protestante', 'geral');

-- ============================================================
-- 2. CULTOS NO TEMPLO
-- ============================================================
INSERT INTO temple_services (name, day_of_week, time_start, description, audience) VALUES
(
    'Escola Bíblica Dominical',
    'Domingo',
    '09h00',
    'Classes de estudo bíblico para todas as faixas etárias realizadas no templo antes do culto principal.',
    'Todas as idades'
),
(
    'Culto de Adoração (Principal)',
    'Domingo',
    '18h30',
    'Culto principal da semana com louvor congregacional, pregação expositiva e administração dos sacramentos quando aplicável.',
    'Toda a congregação'
),
(
    'Reunião de Oração e Exposição',
    'Quinta-feira',
    '19h30',
    'Reunião midweek focada em oração coletiva e exposição bíblica aprofundada da Palavra.',
    'Toda a congregação'
);

-- ============================================================
-- 3. CÉLULAS (ENCONTROS FAMILIARES)
-- ============================================================
INSERT INTO cell_groups (neighborhood, day_of_week, time_start, host_family, notes) VALUES
('Medicina',    'Quarta-feira',  '19h30', 'Família Souza',    NULL),
('Morro Chic',  'Terça-feira',   '20h00', 'Família Oliveira', NULL),
('Varginha',    'Quinta-feira',  '19h30', 'Família Santos',   NULL),
('São Vicente', 'Sexta-feira',   '20h00', 'Família Almeida',  NULL),
('Rebourgeon',  'Quarta-feira',  '20h00', 'Família Pereira',  NULL),
('BPS',         'Terça-feira',   '19h30', 'Família Rodrigues', NULL),
('Cruzeiro',    'Quinta-feira',  '20h00', 'Família Martins',  NULL),
('Avenida',     'Sexta-feira',   '19h30', 'Família Costa',    NULL),
('Estiva',      'Quarta-feira',  '19h00', 'Família Lima',     NULL),
('Santa Rita',  'Quinta-feira',  '20h00', 'Família Barbosa',  NULL);

-- ============================================================
-- 4. DOUTRINA REFORMADA
-- ============================================================
INSERT INTO doctrines (title, description) VALUES
(
    'Autoridade das Escrituras (Sola Scriptura)',
    'A Igreja Comunhão da Graça fundamenta sua fé exclusivamente nas Escrituras Sagradas, reconhecendo-as como o registro infalível da revelação de Deus, sendo a autoridade final sobre todo pensamento e conduta humana.'
),
(
    'Soberania de Deus',
    'Sustentamos a visão de que Deus exerce soberania absoluta sobre a criação, a providência e a redenção, governando todas as coisas conforme o conselho de sua própria vontade para sua glória eterna.'
),
(
    'As Cinco Solas da Reforma',
    'Professamos as "Cinco Solas" da Reforma, afirmando que a salvação é concedida apenas pela graça (Sola Gratia), por meio da fé somente (Sola Fide), fundamentada unicamente na obra meritória de Cristo (Solus Christus), revelada nas Escrituras (Sola Scriptura) para a glória de Deus (Soli Deo Gloria).'
),
(
    'Depravação Total do Homem',
    'Reconhecemos a condição de depravação total do homem, entendendo que o pecado afetou todas as faculdades humanas, tornando o indivíduo incapaz de buscar a Deus por suas próprias forças sem a regeneração prévia do Espírito.'
),
(
    'Pregação Expositiva',
    'Valorizamos a Pregação Expositiva como o centro do culto público, crendo que a exposição fiel de texto a texto das Escrituras é o método primário pelo qual o Espírito Santo edifica, santifica e instrui o corpo de Cristo.'
),
(
    'Eleição Incondicional',
    'Cremos na doutrina da Eleição Incondicional, onde Deus, antes da fundação do mundo, escolheu para si um povo, não baseado em qualquer fé ou mérito previstos no homem, mas segundo o seu beneplácito soberano.'
),
(
    'Expiação Particular (Limitada)',
    'Afirmamos a Expiação Limitada ou Particular, entendendo que a morte de Cristo na cruz teve a intenção específica e eficaz de garantir a salvação de seus eleitos, pagando integralmente por seus pecados.'
),
(
    'Graça Irresistível',
    'Ensinamos sobre a Graça Irresistível, onde o chamado externo do Evangelho é acompanhado pelo chamado interno e eficaz do Espírito Santo, que atrai o pecador ao arrependimento e fé de maneira certa e graciosa.'
),
(
    'Sacramentos (Batismo e Ceia do Senhor)',
    'Administramos os sacramentos do Batismo e da Ceia do Senhor como meios de graça que, embora não possuam poder salvífico em si mesmos, nutrem a fé dos crentes através da presença espiritual de Cristo.'
),
(
    'Perseverança dos Santos',
    'Sustentamos a Perseverança dos Santos, confiando que aqueles que foram verdadeiramente regenerados por Deus jamais cairão totalmente do estado de graça, sendo preservados pelo poder divino até o dia da glorificação final.'
);

-- ============================================================
-- 5. TIMES DE MINISTÉRIO
-- ============================================================
INSERT INTO ministry_teams (name, mission, full_description) VALUES
(
    'Time de Serviço (Diaconato e Logística)',
    'Preparar o ambiente físico para a adoração comunitária, removendo obstáculos práticos que impeçam o fiel de ouvir a Palavra.',
    'O Time de Serviço é a "mão invisível" que prepara o ambiente para a adoração comunitária. Eles são responsáveis pela montagem do templo, organização de assentos e manutenção da ordem física durante as reuniões. Além disso, gerenciam a logística de grandes eventos e conferências, garantindo que a infraestrutura atenda às necessidades da igreja. Atuam diretamente na assistência prática aos membros com dificuldades de mobilidade. O objetivo principal é que nenhum obstáculo físico impeça o fiel de ouvir a Palavra de Deus.'
),
(
    'Time de Multimídia e Tecnologia',
    'Operar na fronteira entre o Evangelho e a tecnologia, garantindo que áudio, vídeo e transmissões sirvam à proclamação fiel da mensagem.',
    'Este time opera na fronteira entre o Evangelho e a tecnologia, gerenciando áudio, projeção e transmissões. Eles cuidam da mixagem de som para que a pregação seja clara e sem ruídos, além de operar softwares de transmissão ao vivo para alcançar aqueles que não podem estar presentes. São responsáveis pela gravação e edição de sermões para o arquivo digital da igreja. Também auxiliam na manutenção de equipamentos eletrônicos e na iluminação do templo. Trabalham para que a técnica seja excelente, porém discreta, apontando sempre para a mensagem.'
),
(
    'Time de Louvor e Adoração',
    'Conduzir a congregação em adoração corporativa por meio de música teologicamente rica, alinhada à pregação e à soberania de Deus.',
    'O Time de Louvor conduz a congregação através da música, priorizando letras teologicamente ricas e bíblicas. Organiza ensaios semanais para garantir a qualidade técnica instrumental e vocal, refletindo a excelência devida ao Senhor. Este grupo não foca em entretenimento, mas na facilitação da adoração congregacional, escolhendo hinos e cânticos que exaltem a soberania de Deus. Colaboram estreitamente com os pastores para alinhar as músicas ao tema da pregação dominical. É formado por músicos regenerados que entendem o louvor como um ato de serviço espiritual.'
),
(
    'Time Infantil (Herança da Graça)',
    'Educar crianças na fé reformada durante os cultos, em ambiente seguro e doutrinariamente fiel.',
    'Focado na educação cristã de crianças durante os cultos, este time prepara lições baseadas no catecismo e em histórias bíblicas fundamentais. Eles mantêm um ambiente seguro, lúdico e doutrinariamente fiel, permitindo que os pais adorem no templo principal com tranquilidade. Organizam atividades pedagógicas que ajudam na memorização de versículos e conceitos da fé reformada. O time é composto por voluntários treinados em proteção infantil e pedagogia cristã. Buscam plantar as sementes da graça nos corações desde a mais tenra idade.'
),
(
    'Time de Recepção e Boas-Vindas',
    'Ser o primeiro contato do visitante com a Igreja Comunhão da Graça, transmitindo hospitalidade cristã e facilitando a integração.',
    'Este ministério é o primeiro contato de qualquer visitante com a Igreja Comunhão da Graça. Eles atuam nas entradas do templo com hospitalidade, orientando sobre a localização de salas, banheiros e horários. Realizam o cadastro de novos visitantes para que a liderança possa realizar um contato de acompanhamento posterior. Entregam o boletim informativo e materiais de integração, garantindo que ninguém se sinta um estranho. Trabalham para criar uma atmosfera de calor cristão que reflita o acolhimento do próprio Cristo.'
);

-- ============================================================
-- 6. PROCESSO DE DISCIPULADO
-- ============================================================
INSERT INTO discipleship (stage_order, title, description) VALUES
(1,  'Definição e Filosofia',
     'O discipulado é entendido como a reprodução da vida de Cristo através do relacionamento intencional entre um crente mais maduro e um aprendiz.'),
(2,  'Início e Designação',
     'O processo inicia com a integração do novo convertido ou membro, que é designado a um discipulador específico com afinidade de perfil.'),
(3,  'Currículo Teológico',
     'Utilizamos um currículo fundamentado nas doutrinas da graça, garantindo que a base teológica do discípulo seja sólida e inabalável.'),
(4,  'Formato dos Encontros',
     'Os encontros são semanais e presenciais, priorizando a transparência, a confissão de pecados e o encorajamento mútuo sob a luz da Palavra.'),
(5,  'Disciplinas Espirituais',
     'Enfatizamos as disciplinas espirituais clássicas: oração fervorosa, leitura bíblica metódica, jejum e a prática da piedade no cotidiano.'),
(6,  'Objetivo da Transformação',
     'O discipulado não visa apenas o conhecimento intelectual, mas a transformação do caráter e a conformidade à imagem de Jesus Cristo.'),
(7,  'Prestação de Contas (Accountability)',
     'Há um sistema de prestação de contas que ajuda o discípulo a organizar sua vida financeira, familiar e profissional para a glória de Deus.'),
(8,  'Etapas do Processo',
     'O processo é avaliado em etapas: Fundamentos da Fé, Vida Cristã Prática, Doutrinas Reformadas e, por fim, Capacitação para Discipular.'),
(9,  'Leitura Teológica Complementar',
     'Encorajamos a leitura de obras clássicas da teologia reformada como parte do crescimento intelectual e devocional do participante.'),
(10, 'Multiplicação – Grande Comissão',
     'O ciclo se completa quando o discípulo assume a responsabilidade de guiar outra pessoa, perpetuando o mandamento da Grande Comissão.');

-- ============================================================
-- 7. CORPO PASTORAL
-- ============================================================
INSERT INTO pastors (name, role, education, academic_work, ministry_focus) VALUES
(
    'Pr. Daniel Ferreira',
    'Pastor Titular',
    'Bacharel em Teologia pelo Seminário Reformado do Sul; Mestrado em Exposição Bíblica (Th.M) pelo Seminário Internacional.',
    'Autor da obra "A Soberania no Caos"; publicou mais de 40 artigos no periódico Vox Reformata sobre Eclesiologia.',
    'Especialista em plantação de igrejas urbanas e revitalização, com 18 anos de experiência no ministério da Palavra.'
),
(
    'Pr. Marcos Almeida',
    'Pastor Auxiliar – Ensino',
    'Bacharel em Teologia (STRE); Pós-graduação em Interpretação do Novo Testamento e Grego Bíblico.',
    'Desenvolveu o "Comentário Acadêmico sobre Gálatas" para uso em seminários regionais; colunista de revistas de teologia pública.',
    'Coordena a Escola Bíblica e o treinamento de novos oficiais; preletor em conferências nacionais sobre Reforma Protestante.'
),
(
    'Pr. Lucas Andrade',
    'Pastor Auxiliar – Cuidado e Aconselhamento',
    'Bacharel em Teologia; Especialização em Aconselhamento Bíblico pelo Centro de Treinamento de Conselheiros (Nanc).',
    'Criador do manual "Pastoreio Mútuo nas Células"; autor de teses sobre saúde mental e fé reformada.',
    'Focado em aconselhamento familiar, mediação de conflitos e supervisão dos Encontros Familiares (Células).'
),
(
    'Pr. Rafael Costa',
    'Pastor Auxiliar – Juventude e Formação',
    'Bacharel em Teologia Reformada; Mestrado em História da Igreja pela Universidade Mackenzie.',
    'Autor da pesquisa "A Influência do Puritanismo na Educação Brasileira"; tradutor de documentos históricos da Reforma.',
    'Líder do ministério de jovens e universitários; responsável pelo seminário interno de formação de novos líderes e discipuladores.'
);

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
