# Xadrez Caótico

Jogo de xadrez 3D público (React + Vite + three.js + chess.js). Saiu de dentro do sistema Archonix em
2026-11-01. Este projeto não tem nenhuma ligação com o Archonix, o PC 35 ou dados da empresa, e tem de
continuar assim: nada de dados, nomes ou endereços da empresa aqui, porque o repositório é público.

## Regras de trabalho

- Responder em português.
- Só fazer push quando o usuário pedir.
- Enviar PushNotification ao terminar tarefas longas e antes de pedir uma decisão: o usuário costuma estar longe do PC.
- Nunca pedir, imprimir ou salvar senhas, tokens ou a PIMENTA.
- A pasta fica fora do OneDrive de propósito: dentro dele o Vite caía com EBUSY e os testes davam EPERM.

## Mapa

- `src/components/ChessBoard3D.tsx`: o jogo inteiro em three.js, num `useEffect` grande. `geracao` invalida
  animações de um tabuleiro antigo; `acoesRef` é a ponte do React pra cena; `window.__xadrez` tem os ganchos
  dos testes, só em desenvolvimento.
- `src/components/MenuXadrez.tsx`, `PainelConta.tsx`, `PainelOnline.tsx`: tela inicial, conta e convite.
- `src/db/db.ts`: salva primeiro no aparelho (IndexedDB, um banco por conta) e depois na nuvem, com fila.
- `src/db/servidor.ts`: chamadas ao servidor e sessão.
- `src/online/salaAoVivo.ts`: WebSocket da partida, com reconexão. O token vai como subprotocolo.
- `src/conta/senha.ts`: PBKDF2 no aparelho. A fórmula do sal não pode mudar sem migrar as contas.
- `worker/src/index.ts` (rotas), `conta.ts` (senhas e limites), `sala.ts` (Durable Object, o árbitro).

## Limites do plano gratuito da Cloudflare

10 ms de CPU por pedido; 100 mil pedidos por dia; D1 com 5 milhões de leituras e 100 mil escritas por dia. Por
isso o hash de senha pesado roda no aparelho, a leitura é incremental (`desde`) e a contagem de registros é
por amostragem. Não colocar trabalho pesado no servidor.

## Testes

Ver README. Armadilhas:

- Sem placa de vídeo, o 3D trava a página. Os testes definem `window.__semDesenho` e usam `polling` em
  `waitForFunction`, porque a espera padrão depende dos quadros. Fotos só com um navegador por vez.
- Encerrar o `wrangler dev` pelo TaskStop deixa `workerd` vivo no Windows, servindo a versão velha. Conferir
  com `Get-NetTCPConnection -LocalPort 8787`.
- O limite de 5 contas por hora vale no simulador também: `LIMITE_CONTAS` em `worker/.dev.vars` afrouxa.
- Entrar em tela cheia leva segundos sem GPU e o canvas fica 12 px menor nesse meio-tempo: medir em laço.

## Peças

Todas usam o mesmo esqueleto Mixamo, construído por `scripts/blender/importar_animacoes_mixamo.py` (Blender 5.2
sem interface). Os .fbx e o .blend ficam só nesta máquina e não vão pro git.

- Clipes: Parado, Gesto1/2, Walk, Attack1..N, Mortal, MortalTombo. Materiais: Corpo/Detalhe/Coroa/Brilho.
- Só o peão tem katana. Rainha e rei batem com cetro e cajado. O bispo lança um orbe. O cavalo é um cavaleiro
  com ossos de cavalo e clipes procedurais. A torre usa a marreta feita em código (`posarComMarreta`, IK de dois
  ossos depois do mixer).
- O AnimationMixer só reescreve um osso quando o valor do clipe muda: rotações somadas acumulam de quadro em
  quadro, então salve e restaure a pose a cada quadro (`salvarOssosDoGolpe`).
- Regras do usuário: cada tipo de peça tem golpes próprios; golpe só na captura, sorteado; peão contra peão tem
  50% de chance de rendição com honra; mortais precisam parecer mortais de verdade.

## Livro de aberturas

`public/chess/livro.json` (34.765 posições) sai de `games.pgn` (1000 partidas) por
`scripts/compilar-livro-xadrez.mjs`. O gerador usa Stockfish, que não fica no projeto. `?!` no PGN marca lance
fraco: a máquina responde a ele, mas nunca o joga.

## Som

Tudo sintetizado em `src/chess/sons.ts`, sem arquivos de áudio. Foi medido, nunca ouvido: o ruído é sorteado e o
pico oscila, então deixe folga abaixo de 1,0.
