-- Blitz entre pessoas: o ritmo da partida (3+2, 5+0, 5+3), com o relógio no servidor. Sem ritmo, a partida é como
-- sempre foi (7 dias para cada lance).
ALTER TABLE salas ADD COLUMN ritmo TEXT;
-- 1 quando a partida veio do adversário automático (duas pessoas que não são amigas)
ALTER TABLE salas ADD COLUMN automatica INTEGER NOT NULL DEFAULT 0;

-- A fila do adversário automático: quem procura, em que ritmo, e a sala quando achou alguém. Quem para de perguntar
-- some da fila em 30 segundos; a limpeza diária apaga o que sobrou.
CREATE TABLE fila (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  ritmo TEXT NOT NULL,
  entrou_em INTEGER NOT NULL,
  visto_em INTEGER NOT NULL,
  sala_codigo TEXT
);
CREATE INDEX fila_por_ritmo ON fila(ritmo, sala_codigo, entrou_em);

-- Quem bloqueou quem: os dois não se encontram mais no adversário automático, deixam de ser amigos e não recebem
-- convites um do outro.
CREATE TABLE bloqueios (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  bloqueado_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, bloqueado_id)
);
CREATE INDEX bloqueios_ao_contrario ON bloqueios(bloqueado_id);

-- Denúncias de uma partida: quem denunciou (fica nulo se a conta for apagada), quem foi denunciado, a sala e o motivo
-- (nome, foto, trapaça ou comportamento). Uma por pessoa em cada sala. Quem cuida do jogo lê pelo wrangler.
CREATE TABLE denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  denunciante_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  denunciado_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  sala_codigo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  criada_em INTEGER NOT NULL
);
CREATE UNIQUE INDEX denuncias_uma_por_sala ON denuncias(denunciante_id, sala_codigo);
CREATE INDEX denuncias_por_denunciado ON denuncias(denunciado_id);
