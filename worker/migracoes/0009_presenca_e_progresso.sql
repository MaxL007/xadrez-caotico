-- A bolinha verde dos amigos: com o jogo aberto e à vista, o aparelho avisa a cada minuto; ao sair, avisa que saiu (0).
ALTER TABLE usuarios ADD COLUMN visto_em INTEGER;

-- O progresso das conquistas, contado no aparelho a partir das partidas contra a máquina, pros amigos verem no perfil.
-- JSON com uma contagem por medida; os convites o servidor conta sozinho.
ALTER TABLE usuarios ADD COLUMN progresso TEXT;
