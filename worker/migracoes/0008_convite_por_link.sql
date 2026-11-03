-- Convite por link e por QR Code: um código fixo e secreto de cada jogador, sorteado na primeira vez que a pessoa abre
-- a aba Amigos. Quem abre o link (ou lê o QR Code) recebe o pedido de amizade do dono do código. Não dá pra usar o ID
-- público: com ele, qualquer um forjaria o convite de qualquer pessoa e viraria amigo dela sem ela querer.
ALTER TABLE usuarios ADD COLUMN codigo_convite TEXT;
CREATE UNIQUE INDEX usuarios_por_codigo_convite ON usuarios(codigo_convite);
