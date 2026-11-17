-- O bilhete de cada partida contra a máquina: o servidor anota quando ela começou (no aparelho de quem joga, logo no
-- começo), com a dificuldade e o ritmo da blitz. A vitória só paga óticoins se tiver bilhete, se a dificuldade bater e
-- se tiver passado tempo suficiente para os lances da partida. A limpeza diária apaga os bilhetes com mais de 30 dias.
CREATE TABLE bilhetes (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partida_id TEXT NOT NULL,
  dificuldade TEXT NOT NULL,
  ritmo TEXT,
  criado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, partida_id)
);
CREATE INDEX bilhetes_por_data ON bilhetes(criado_em);
