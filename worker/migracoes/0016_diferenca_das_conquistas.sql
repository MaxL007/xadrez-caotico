-- As conquistas de peões, torres e bispos viraram os patamares das conquistas Peões, Torres e Bispos (27/11) e passaram a
-- pagar mais. Quem já tinha recebido algum patamar recebe a diferença (pedido do usuário):
--   peões: 50 de 2 pra 5 (+3), 150 de 5 pra 15 (+10), 400 de 15 pra 40 (+25), 1000 de 50 pra 100 (+50);
--   torres e bispos: 30 de 4 pra 6 (+2);
--   cavalos: 50 de 8 pra 10 (+2), 250 de 48 pra 100 (+52); rainhas: 25 de 10 pra 20 (+10);
--   amigos: o primeiro convite de 5 pra 10 (+5).
-- As metas que mudaram (60 e 180 torres e bispos viraram 100 e 300; 100 cavalos virou 200; 50, 150 e 500 rainhas
-- viraram 70, 200 e 600; 200 vitórias e 50 convites saíram) são conquistas novas: quem
-- recebeu as antigas fica com o que ganhou, e recebe as novas ao chegar nelas.
-- Roda uma vez só, como toda migração; quem receber dali pra frente já ganha o valor novo.
UPDATE usuarios
SET oticoins = oticoins + (
  SELECT COALESCE(SUM(CASE conquista
    WHEN 'peoes-50' THEN 3
    WHEN 'peoes-150' THEN 10
    WHEN 'peoes-400' THEN 25
    WHEN 'peoes-1000' THEN 50
    WHEN 'torres-30' THEN 2
    WHEN 'bispos-30' THEN 2
    WHEN 'cavalos-50' THEN 2
    WHEN 'cavalos-250' THEN 52
    WHEN 'rainhas-25' THEN 10
    WHEN 'convite-1' THEN 5
    ELSE 0 END), 0)
  FROM conquistas
  WHERE conquistas.usuario_id = usuarios.id
)
WHERE id IN (
  SELECT usuario_id FROM conquistas
  WHERE conquista IN ('peoes-50', 'peoes-150', 'peoes-400', 'peoes-1000', 'torres-30', 'bispos-30', 'cavalos-50', 'cavalos-250', 'rainhas-25', 'convite-1')
);
