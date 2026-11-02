-- equipamentos da Personalização comprados na Loja. Os liberados por conquista não entram aqui: valem pela conquista.
CREATE TABLE itens (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  comprado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, item)
);
