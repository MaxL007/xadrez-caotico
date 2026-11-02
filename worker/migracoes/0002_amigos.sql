-- ID público de cada jogador, o que se passa pros amigos. O id interno continua sem sair do servidor.
ALTER TABLE usuarios ADD COLUMN id_jogador TEXT;

-- contas que já existem: mesmo alfabeto e tamanho do que o Worker sorteia nas contas novas
UPDATE usuarios SET id_jogador =
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1) ||
  substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + abs(random() % 31), 1);

CREATE UNIQUE INDEX usuarios_por_id_jogador ON usuarios(id_jogador);

-- uma linha por par de jogadores: 'pendente' enquanto o convite não é aceito, depois 'aceita'
CREATE TABLE amizades (
  solicitante_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  destinatario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  PRIMARY KEY (solicitante_id, destinatario_id)
);
CREATE INDEX amizades_por_destinatario ON amizades(destinatario_id);
-- se os dois se convidarem ao mesmo tempo, só um convite fica
CREATE UNIQUE INDEX amizades_por_par ON amizades(MIN(solicitante_id, destinatario_id), MAX(solicitante_id, destinatario_id));
