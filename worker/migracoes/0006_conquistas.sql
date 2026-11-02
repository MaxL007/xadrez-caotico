-- óticoins: a moeda do jogo, ganha com as conquistas. Cada conquista paga uma vez só: a linha em `conquistas` é o recibo.
ALTER TABLE usuarios ADD COLUMN oticoins INTEGER NOT NULL DEFAULT 0;

CREATE TABLE conquistas (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conquista TEXT NOT NULL,
  recebida_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, conquista)
);
