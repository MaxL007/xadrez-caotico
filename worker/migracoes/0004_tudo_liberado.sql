-- conta com tudo liberado, inclusive o que ainda não está aberto pra todos, como as molduras. Só se liga direto no banco.
ALTER TABLE usuarios ADD COLUMN tudo_liberado INTEGER NOT NULL DEFAULT 0;
