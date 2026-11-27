-- As armas deixaram de sair por conquista (pedido do usuário, 27/11): agora só se compram na Loja. Quem já tinha
-- recebido a conquista que liberava uma arma fica com ela (pedido do usuário: o que foi ganho continua): a arma entra como
-- comprada, em cada peça que a usava. É o mapa que valia até aqui (`itens` em personalizacao.json):
--   50 peões: katana; 400 peões: espada; 30 torres: marreta; 60 torres: machado; 180 torres: maça;
--   30 bispos: cajado (bispo, rainha e rei); 60 bispos: cristal (bispo, rainha e rei); 50 rainhas: cetro (rei);
--   150 rainhas: lua (rainha); 50 cavalos: lança.
-- Quem já tinha comprado a arma não muda nada (INSERT OR IGNORE). Roda uma vez só, como toda migração.
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'p:arma:katana', recebida_em FROM conquistas WHERE conquista = 'peoes-50';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'p:arma:espada', recebida_em FROM conquistas WHERE conquista = 'peoes-400';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'r:arma:marreta', recebida_em FROM conquistas WHERE conquista = 'torres-30';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'r:arma:machado', recebida_em FROM conquistas WHERE conquista = 'torres-60';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'r:arma:maca', recebida_em FROM conquistas WHERE conquista = 'torres-180';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'b:arma:cajado', recebida_em FROM conquistas WHERE conquista = 'bispos-30';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'q:arma:cajado', recebida_em FROM conquistas WHERE conquista = 'bispos-30';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'k:arma:cajado', recebida_em FROM conquistas WHERE conquista = 'bispos-30';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'b:arma:cristal', recebida_em FROM conquistas WHERE conquista = 'bispos-60';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'q:arma:cristal', recebida_em FROM conquistas WHERE conquista = 'bispos-60';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'k:arma:cristal', recebida_em FROM conquistas WHERE conquista = 'bispos-60';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'k:arma:cetro', recebida_em FROM conquistas WHERE conquista = 'rainhas-50';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'q:arma:lua', recebida_em FROM conquistas WHERE conquista = 'rainhas-150';
INSERT OR IGNORE INTO itens (usuario_id, item, comprado_em)
  SELECT usuario_id, 'n:arma:lanca', recebida_em FROM conquistas WHERE conquista = 'cavalos-50';
