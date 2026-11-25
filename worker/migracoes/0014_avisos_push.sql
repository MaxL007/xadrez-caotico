-- Os avisos com o jogo fechado (Web Push): cada aparelho em que a pessoa ligou os avisos. O endereço é do serviço de
-- push do navegador (só os conhecidos são aceitos); a chave e o segredo cifram a mensagem pra só o aparelho ler. Sair da
-- conta ou desligar os avisos apaga a linha; o serviço dizendo que o aparelho saiu também.
CREATE TABLE inscricoes_push (
  endpoint TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  idioma TEXT NOT NULL DEFAULT 'pt-BR',
  criada_em INTEGER NOT NULL
);
CREATE INDEX inscricoes_push_por_usuario ON inscricoes_push(usuario_id);
