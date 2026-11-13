-- Vitória contra a máquina paga óticoins pela dificuldade (1 no fácil, 2 no intermediário, 3 no difícil). Cada partida
-- paga uma vez só: o recibo e a moeda entram juntos no mesmo lote, como nas conquistas.
CREATE TABLE vitorias_pagas (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  partida_id TEXT NOT NULL,
  dificuldade TEXT NOT NULL,
  oticoins INTEGER NOT NULL,
  paga_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, partida_id)
);
CREATE INDEX vitorias_pagas_por_data ON vitorias_pagas(usuario_id, paga_em);
