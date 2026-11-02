-- aparência no perfil: `avatar` é uma sugestão do jogo ('peao-brancas') ou a foto própria ('foto:<versão>')
ALTER TABLE usuarios ADD COLUMN avatar TEXT;
ALTER TABLE usuarios ADD COLUMN moldura TEXT;

-- foto importada do aparelho, já reduzida pelo site. Fica fora de `usuarios` pra não pesar nas consultas de conta
CREATE TABLE fotos (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  dados TEXT NOT NULL,
  atualizada_em INTEGER NOT NULL
);
