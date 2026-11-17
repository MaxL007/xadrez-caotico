-- Os erros que quebram o jogo no aparelho de alguém: a mensagem, onde aconteceu, a versão e o tipo de navegador.
-- Sem nome, sem ID e sem IP. O mesmo erro (mesma assinatura) só soma em `vezes`. A limpeza diária apaga o que não
-- aparece há 30 dias.
CREATE TABLE erros (
  assinatura TEXT PRIMARY KEY,
  mensagem TEXT NOT NULL,
  pilha TEXT,
  onde TEXT,
  versao TEXT,
  navegador TEXT,
  vezes INTEGER NOT NULL DEFAULT 1,
  primeiro_em INTEGER NOT NULL,
  visto_em INTEGER NOT NULL
);
CREATE INDEX erros_por_data ON erros(visto_em);
