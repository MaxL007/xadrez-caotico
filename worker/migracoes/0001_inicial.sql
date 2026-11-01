CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL UNIQUE,
  sal TEXT NOT NULL,
  hash TEXT NOT NULL,
  sal_recuperacao TEXT NOT NULL,
  hash_recuperacao TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);

CREATE TABLE sessoes (
  resumo TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em INTEGER NOT NULL,
  usada_em INTEGER NOT NULL
);
CREATE INDEX sessoes_por_usuario ON sessoes(usuario_id);
CREATE INDEX sessoes_por_uso ON sessoes(usada_em);

-- partidas contra a máquina e aprendizado de cada pessoa
CREATE TABLE registros (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  id TEXT NOT NULL,
  dados TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, store, id)
);
CREATE INDEX registros_por_data ON registros(usuario_id, atualizado_em);

-- partidas entre pessoas: a sala ao vivo é um Durable Object; isto é só a lista de cada jogador
CREATE TABLE salas (
  codigo TEXT PRIMARY KEY,
  criador_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  brancas_id TEXT,
  pretas_id TEXT,
  brancas_nome TEXT,
  pretas_nome TEXT,
  status TEXT NOT NULL,
  resultado TEXT,
  motivo TEXT,
  lances TEXT,
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL
);
CREATE INDEX salas_por_criador ON salas(criador_id, status);
CREATE INDEX salas_por_brancas ON salas(brancas_id, atualizada_em);
CREATE INDEX salas_por_pretas ON salas(pretas_id, atualizada_em);

-- limites de tentativas (senha errada, contas por endereço)
CREATE TABLE tentativas (
  chave TEXT PRIMARY KEY,
  contagem INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
CREATE INDEX tentativas_por_validade ON tentativas(expira_em);
