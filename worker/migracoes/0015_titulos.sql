-- Os títulos (o primeiro é o METAMORFO, das três conquistas de ascensões): o que a pessoa escolheu mostrar embaixo do
-- nome na partida. Só um por vez; vazio é sem título. O servidor confere as conquistas antes de aceitar.
ALTER TABLE usuarios ADD COLUMN titulo TEXT;
