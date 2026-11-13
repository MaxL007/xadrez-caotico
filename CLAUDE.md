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

As pastas de `src` são por função:

- `catalogos/`: o que se edita à mão e o servidor também lê: `personalizacao.json` (partes, armas por peça, habilidades,
  preços da Loja, que conquista libera cada arma), `conquistas.json` (o que cada conquista pede e paga) e
  `aparencia.json` (avatares e molduras). Mudou um deles, publica o servidor junto (`wrangler deploy`).
- `tabuleiro/`: a partida em 3D. `ChessBoard3D.tsx` é a cena e o fluxo da partida, num `useEffect` grande: `geracao`
  invalida animações de um tabuleiro antigo; `acoesRef` é a ponte do React pra cena; `window.__xadrez` tem os ganchos
  dos testes, só em desenvolvimento. `casas.ts` tem as coordenadas, a câmera e as texturas do tabuleiro;
  `ResultadoDaPartida.tsx` e `PainelDeLances.tsx`, o que aparece por cima dela.
  - `tabuleiro/pecas/`: as peças. `modelosRPG.ts` (carregar os .glb, os clipes, a espada do peão), `geometricas.ts` (o
    boneco de madeira, se o modelo não carregar), `materiais.ts`, `montarPeca.ts` (a peça de uma casa), `vestimenta.ts`
    (o que as peças de quem joga vestem), `equipamentos.ts` (armaduras e armas em malha com esqueleto), `ossos.ts` (o
    IK de dois ossos), `expositor.ts`, `vitrine.ts` e `emblemas.ts` (os símbolos das habilidades).
  - `tabuleiro/animacoes/`: `movimento.ts` (andar, correr, virar, o salto do cavalo), `gestos.ts` (gestos, gesto
    amigável, comemoração, recusa e descanso), `queda.ts` (a vítima caindo, arremessada, sumindo) e `cerimonias.ts`
    (pétalas da honra e ascensão da promoção).
  - `tabuleiro/combate/`: `golpes.ts` (a espada do peão, o alcance, o impacto), `poderes.ts` (orbe, raio, onda),
    `marreta.ts` (marreta, machado e maça, com a peça presa), `efeitosDasArmas.ts` (os efeitos de cada arma) e
    `lutaSemArma.ts` (socos e chute).
- `telas/`: `MenuXadrez.tsx` (tela inicial e painéis), `PainelConta.tsx`, `PainelAmigos.tsx`, `PainelPerfil.tsx`,
  `PainelConquistas.tsx`, `PainelLoja.tsx`, `PainelPersonalizacao.tsx`, `QrCode.tsx` e `ui/`. `ElementosDoJogador.tsx`
  tem o avatar com moldura, o ID e o placar que amigos e perfil dividem.
- `conta/`: `senha.ts` (PBKDF2 no aparelho; a fórmula do sal não pode mudar sem migrar as contas), `personalizacao.ts`,
  `conquistas.ts`, `aparencia.ts`, `foto.ts`, `presenca.ts` e `conviteDeAmizade.ts`.
- `dados/`: `db.ts` (salva primeiro no aparelho, IndexedDB com um banco por conta, e depois na nuvem, com fila),
  `servidor.ts` (chamadas ao servidor e sessão), `salaAoVivo.ts` (WebSocket da partida, com reconexão; o token vai como
  subprotocolo) e os repositórios das partidas e do aprendizado.
- `jogo/` (regras, a máquina, o livro de aberturas e as configurações), `som/sons.ts`, `textos/idiomas.ts` e `app/`
  (`aplicativo.ts`, o jogo instalado como aplicativo: service worker, instalar, versão nova; e utilidades).
- `worker/src/index.ts` (rotas), `conta.ts` (senhas e limites), `sala.ts` (Durable Object, o árbitro).

## Amigos

- Cada conta tem um `id_jogador` público de 8 caracteres. É o único identificador que o cliente vê: o `id` interno
  nunca sai do servidor. Convite por nome só acha o nome exato, e o ID ganha de um nome igual a ele.
- `amizades` tem uma linha por par. Aceitar é convidar de volta; recusar, cancelar e remover apagam a linha.
- Partida só entre amigos aceitos, e os dois lugares têm dono desde a criação (`status: 'aguardando'`). Não existe link
  nem código de partida. Quem chamou pode cancelar, e o amigo pode recusar (`status: 'recusada'`).
- Convite de amizade por link e QR Code (`src/conta/conviteDeAmizade.ts`): o link é `?convite=<codigo_convite>`, um
  código fixo e secreto de 12 caracteres, sorteado na primeira vez que a pessoa abre Amigos. Não pode ser o ID público:
  com ele, qualquer um forjaria o convite de qualquer pessoa. Quem abre o link recebe o pedido do dono do código
  (`POST /amigos/convite`) e confirma ou recusa; sem conta, o código fica no aparelho e vai ao entrar ou criar a conta.
  `GET /convites/<código>` mostra quem convidou, sem sessão. O QR Code é o mesmo link: a câmera do celular abre o site,
  e a do jogo lê em Amigos (`QrCode.tsx`: o leitor do navegador quando há, senão o jsQR, baixado só nessa hora).
- Todo pedido de amizade novo vira aviso na tela inicial, uma vez por pedido (`pedidosAvisados`, no aparelho); tocar
  abre Amigos, onde os pedidos ficam no topo com Confirmar e Recusar.
- "Novo jogo" numa partida amistosa chama o mesmo amigo (`/salas/<código>/revanche`), não a máquina. O aviso chega pela
  conexão da partida aberta; se os dois pedem, o segundo entra na partida do primeiro.
- O menu confere `/amigos` a cada 15 s (`useAmigos`), só com a aba à vista: conta nos 100 mil pedidos por dia. Durante
  uma partida não confere; a novidade aparece ao voltar ao menu.
- A bolinha verde (`src/conta/presenca.ts`): com a conta aberta e o jogo à vista, o aparelho manda `POST /presenca` a
  cada minuto, em qualquer tela; ao esconder a aba ou fechar, manda `/presenca/sair` pelo `sendBeacon` (o token vai no
  corpo, porque o beacon não manda cabeçalho). Online é `usuarios.visto_em` de menos de 2,5 min, e o servidor grava no
  máximo a cada 45 s. Só amigo aceito vê.
- O perfil do amigo tem a aba Conquistas: as recebidas e o progresso que o aparelho dele contou
  (`POST /conquistas/progresso`, só quando muda). O servidor guarda o maior de cada medida, pra um aparelho novo que
  ainda não baixou as partidas não apagar o que já foi contado.

## Perfil

- A tela inicial ocupa a página inteira (`ocupaATela`). A partida não: quando a tela muda de formato no meio do giro da
  câmera, o `onResize` refaz o destino, senão o tabuleiro fica pequeno no celular.
- Molduras estão trancadas: só a conta com `usuarios.tudo_liberado = 1` coloca uma, e o servidor confere
  (`moldura-bloqueada`). Liga-se direto no banco, nunca pelo site:
  `npx wrangler d1 execute xadrez-caotico --remote --command "UPDATE usuarios SET tudo_liberado = 1 WHERE nome_busca = '<nome>'"`.
  Quem liga qual conta fica fora do repositório, que é público.
- `usuarios.avatar` é uma sugestão do jogo (`peao-brancas`) ou a foto (`foto:<versão>`), e `moldura` é só o id. As listas
  válidas ficam em `src/catalogos/aparencia.json`, que o Worker também importa: moldura nova entra ali e em `ANEL_DA_MOLDURA`.
- A foto é recortada e reduzida no aparelho (`src/conta/foto.ts`) e fica na tabela `fotos`. O servidor só aceita JPEG até
  60 KB em base64. `GET /fotos/<ID>` é aberto, porque uma `<img>` não manda sessão: quem tem o ID vê a foto.
- Os avatares sugeridos em `public/avatares` saem dos modelos das peças: `node scripts/gerar-avatares.mjs`, com o site de
  desenvolvimento no ar. As cores em `scripts/avatares/retratos.js` copiam as de `materiaisPorFaccao`.
- Os números do perfil somam as partidas contra a máquina, contadas no aparelho, com as amistosas, contadas no servidor.
- O Perfil tem três abas: Perfil, Conquistas e Configurações. O botão do menu que era Configurações agora é
  Personalização.

## Aplicativo instalável

- O site é um PWA: `public/manifest.webmanifest`, ícones em `public/icones` (a óticoin é a logo; saem de
  `node scripts/gerar-oticoin.mjs`, junto com as imagens da moeda) e o service worker `scripts/aplicativo/sw.js`.
- `npm run build` roda `scripts/gerar-sw.mjs`, que grava `dist/sw.js` com a lista de arquivos e o hash de cada um. O
  aparelho guarda tudo e, a cada versão, baixa só o que mudou. Os arquivos da versão anterior ficam mais uma rodada,
  porque uma tela aberta há tempo ainda pode pedir algum.
- A página vem sempre da rede quando há internet: ninguém fica com o site velho falando com o servidor novo. Sem
  internet, vem do aparelho e dá pra jogar contra a máquina. O servidor do jogo (outro endereço) nunca passa pelo cache.
- O service worker só é registrado no build de produção (`src/app/aplicativo.ts`). Ao voltar pro aplicativo, ele compara o
  código da tela aberta com o publicado e oferece "Versão nova: atualizar". O botão "Instalar app" aparece quando o
  navegador oferece (Android, computador) e, no iPhone, explica o "Adicionar à Tela de Início".

## Personalização das peças

- Aberta a toda conta, mas só o padrão de cada parte é livre. Catálogo em `src/catalogos/personalizacao.json`, o mesmo que o
  Worker confere: `loja` traz, por peça, o que se compra e o preço (tabela do usuário; a compra vale só pra aquela peça,
  item `peça:parte:opção` na tabela `itens`), inclusive as armas e o retalhamento da katana (`p:golpe:retalhamento`);
  `itens` traz a conquista que também libera cada arma: vale a compra ou a conquista. A conta com
  `tudo_liberado` usa tudo. A escolha fica em `usuarios.personalizacao`, só o que foge do padrão; opção que saiu do
  catálogo é ignorada.
- Habilidade especial é uma parte própria (`golpe`, catálogo `habilidades`, por peça): por enquanto só o peão, com o
  retalhamento. Comprar não basta, tem de equipar na Personalização, e ele só sai com a katana na mão (a tela avisa).
  O expositor mostra o símbolo da habilidade (`src/tabuleiro/pecas/emblemas.ts`), não a arma: o do retalhamento é o desenho do
  usuário, três órbitas cruzadas (faixas achatadas e inclinadas, que de frente ficam grossas nas pontas como pincel) e
  dois cortes em crescente por cima. A compra continua sendo o item `p:golpe:retalhamento`.
- Toda peça começa sem arma, inclusive as da máquina e as do adversário: as armas aparecem só em quem liberou e vestiu.
  Peão: katana ou espada. Torre: marreta, machado (lâmina em meia-lua) ou maça. Cavalo: lança. Bispo: cajado ou cristal.
  Rainha: cajado, cristal ou lua. Rei: cajado, cristal ou cetro.
- Sem arma (`userData.arma === 'nenhuma'`), toda peça menos o cavalo, que pisoteia com as patas, vai até a vítima e luta
  com o corpo (`src/tabuleiro/combate/lutaSemArma.ts`): um jab e um direto, ou um chute de frente, sorteados, com sons próprios
  (`soco:jab`, `soco`, `chute:ar`, `chute`). A pose vai osso por osso por cima do clipe, com o IK de dois ossos de
  `src/tabuleiro/pecas/ossos.ts` (o mesmo da marreta): antes dos clipes o quadro desfaz a pose (`desfazerPosesDasLutas`), e
  depois deles guarda o que o clipe deixou e posa de novo (`atualizarLutas`). Quem bate para a `distanciaDaLuta` da
  vítima. O orbe do bispo e a onda do rei, que eram o ataque sem arma, ficaram sem uso no código.
- O ataque da captura segue a arma (`src/tabuleiro/combate/efeitosDasArmas.ts`, cada um com som próprio em `sons.ts`):
  retalhamento da katana (vários cortes e a peça em pedaços, só pra quem comprou), marreta (rachaduras desenhadas a cada
  pancada e o tabuleiro tremendo), machado (a peça cortada ao meio por plano de recorte; a metade de cima é cópia pelo
  `SkeletonUtils`, sem o userData, que tem o mixer), maça (a torre para no alcance do cabo inteiro, `alcanceDaMaca`, e o golpe para
  com a bola encostada no peito, `pancadaNoPeito`: a vítima vira de frente, o espinho da ponta do cabo entra no peito e o
  corpo fica encostado na bola, medido na frente do próprio modelo por um raio, `fundoDoPeito`, nunca com a bola por
  dentro dele; presa, vai junto com a maça, `poseDaMaca`, mole, com braços e pernas caindo pro chão e a cabeça tombada,
  `pendurar`, e cai ao sacudir; num cavalo, a maça pega
  o cavaleiro e o cavalo foge a galope e pula pra fora do tabuleiro, `soltarOCavalo`: a malha é dividida pelo osso que
  mais puxa cada vértice, os do Mixamo são do cavaleiro e os outros, do animal), cajado (o raio), cristal (convocado a 75° do tabuleiro, dentro da casa), cetro (a peça afunda no
  tabuleiro, recortada no tampo) e lua (tornado que a arremessa pra fora do tabuleiro). O recorte pede
  `renderer.localClippingEnabled`.
- A compra na Loja grava o item e tira as óticoins no mesmo lote: o item só entra se havia saldo (`INSERT ... SELECT ...
  WHERE oticoins >= preço`), e a moeda só sai se o item entrou (`changes()`).
- Na aba, cada quadrado é um expositor: o equipamento sozinho, girando num pedestal (`src/tabuleiro/pecas/expositor.ts`),
  montado por `montarExpositor` (`tabuleiro/pecas/vitrine.ts`) e `equipamentoSozinho` (equipamentos.ts). A katana e o cajado de sempre
  são recortados do modelo. A Loja usa o mesmo expositor: um canvas por cima dela desenha cada cartão no seu retângulo,
  e tocar no cartão abre o equipamento grande, pra girar.
- A Loja tem três abas: Armaduras, peça por peça, com atalhos no fim pras armas e habilidades daquela peça; Armas e
  Habilidades, cada uma numa lista só separada por peça, cada cartão com o retrato e o nome de quem usa. Cajado e
  cristal aparecem em cada peça que os usa, porque a compra é por peça; o retalhamento fica em Habilidades, com o
  símbolo dele. O canvas da Loja cobre só a faixa à vista de quem rola (`quemRola`), senão a lista das armas passaria
  do tamanho de canvas que um celular aceita.
- `src/tabuleiro/pecas/equipamentos.ts` monta as armaduras e armas: cada parte vira malha com esqueleto presa ao osso que cobre,
  medida no corpo em pose de braços abertos (igual nas seis peças). O que a parte nova substitui (ombreira redonda,
  cajado, sela, katana) some do modelo pela regra de `ESCONDER`, numa cópia da geometria.
- Quem joga veste só as próprias peças (`tabuleiro/pecas/vestimenta.ts`); no menu, as brancas. A marreta da torre muda em
  `criarMarreta`. A vitrine da aba tem renderizador próprio e é montada por `montarVitrine`.
- `testes/fotos-personalizacao.mjs` fotografa cada peça vestida: é como se confere se as partes encaixam.

## Conquistas e óticoins

- A óticoin é uma moeda 3D com o peão de um lado e o rei do outro: `node scripts/gerar-oticoin.mjs` gera em
  `public/oticoin` a fileira de quadros do giro e os dois lados parados, que o componente `Oticoin` mostra.
- Catálogo em `src/catalogos/conquistas.json`, também lido pelo Worker. Só contam partidas contra a máquina; as com amigos
  ficam de fora. Capturas, xeques, roques e vitórias saem das partidas salvas (`contarPartidas`); convites aceitos, o
  servidor conta.
- Vitória contra a máquina paga pela dificuldade: 1 no fácil, 2 no intermediário, 3 no difícil (`POST /vitorias/receber`,
  tabela `vitorias_pagas`). O servidor confere a partida salva na conta (terminada, vencida, com dificuldade), paga cada
  uma uma vez só e no máximo 20 por hora. O aparelho manda ao abrir o menu; a taça já mostra quanto vai entrar.
- O servidor não refaz as partidas (não cabe nos 10 ms): confia na contagem do aparelho, mas cada conquista paga uma vez
  só (tabela `conquistas`), então o máximo de uma conta é a soma do catálogo. O recibo e a moeda entram juntos no mesmo
  lote, com `changes()`.

## Limites do plano gratuito da Cloudflare

10 ms de CPU por pedido; 100 mil pedidos por dia; D1 com 5 milhões de leituras e 100 mil escritas por dia. Por
isso o hash de senha pesado roda no aparelho, a leitura é incremental (`desde`) e a contagem de registros é
por amostragem. Não colocar trabalho pesado no servidor.

## Testes

Ver README. Armadilhas:

- Sem placa de vídeo, o 3D trava a página. Os testes definem `window.__semDesenho` e usam `polling` em
  `waitForFunction`, porque a espera padrão depende dos quadros. Fotos só com um navegador por vez.
- Foto de efeito (ataque, animação curta) com o relógio de verdade sai atrasada: cada quadro sem GPU leva mais de um
  segundo e o efeito já acabou. `testes/fotos-armas.mjs` para o relógio da página (`clock` do Playwright), anda com
  `runFor` sem desenhar e desenha só o quadro da foto; `pauseAt` precisa de folga, porque o relógio falso se adianta
  ao carregar. Com o relógio parado a máquina tem de ser a fácil (`carregarTeste(pgn, cor, 'facil')`): a difícil mede
  o tempo de pensar por esse relógio. `__sonsTocados` registra o som quando ele é pedido, mesmo o agendado pra depois.
- Encerrar o `wrangler dev` pelo TaskStop deixa `workerd` vivo no Windows, servindo a versão velha. Conferir
  com `Get-NetTCPConnection -LocalPort 8787`.
- Depois de horas no ar, o `wrangler dev` fica lento (pedidos de 5 a 12 s) e os testes com conta falham por tempo
  (convite, sincronização). Antes de investigar uma falha dessas, conferir os tempos no log dele e reiniciar
  (parar também o `workerd`).
- O limite de 5 contas por hora vale no simulador também: `LIMITE_CONTAS` em `worker/.dev.vars` afrouxa.
- Entrar em tela cheia leva segundos sem GPU e o canvas fica 12 px menor nesse meio-tempo: medir em laço.
- O build de produção não tem `__semDesenho`: no teste do aplicativo, uma tela 3D por vez e o iPhone simulado em 1x,
  senão passa do tempo.
- A câmera do teste de convites é a falsa do Chrome (`--use-file-for-fake-video-capture`), com um .y4m montado a partir
  do QR Code que o jogo desenhou. Dependência nova pede reiniciar o Vite antes dos testes, senão ele recarrega a página
  no meio ao descobrir a dependência.
- O celular perde o contexto gráfico com a aba em segundo plano. Tudo que é desenhado na placa (o reflexo do ambiente)
  precisa ser refeito em `webglcontextrestored`, e os canvas das texturas usam `willReadFrequently` pra ficar na memória
  comum. `testes/testar-volta-da-aba.mjs` simula a perda; a queda do processo gráfico inteiro não dá pra simular aqui.

## Peças

Todas usam o mesmo esqueleto Mixamo, construído por `scripts/blender/importar_animacoes_mixamo.py` (Blender 5.2
sem interface). Os .fbx e o .blend ficam só nesta máquina e não vão pro git.

- Clipes: Parado, Gesto1/2, Walk, Attack1..N, Mortal, MortalTombo. Materiais: Corpo/Detalhe/Coroa/Brilho.
- Sem arma, as peças lutam com socos e chutes feitos em código (ver Personalização). O cavalo é um cavaleiro
  com ossos de cavalo e clipes procedurais. A torre usa a marreta feita em código (`posarComMarreta`, IK de dois
  ossos depois do mixer).
- As interações amigáveis sorteadas (dois aliados trocando um gesto a cada 6 a 13 s) esperam o lance acabar
  (`lancesEmAndamento`): o gesto começa outra sequência na peça (`novaSequenciaRPG`), e uma captura que esperava a
  senha dela perdia o golpe e travava o jogo. A luta sem arma só para se outro jogo entrar (`vigente`).
- O AnimationMixer só reescreve um osso quando o valor do clipe muda: rotações somadas acumulam de quadro em
  quadro, então salve e restaure a pose a cada quadro (`salvarOssosDoGolpe`).
- Regras do usuário: cada tipo de peça tem golpes próprios; golpe só na captura, sorteado; peão contra peão tem
  15% de chance de rendição com honra (com sino de capela e trompas quando quem captura é de espada); mortais precisam
  parecer mortais de verdade.
- Os passos soam quando o pé encosta no chão (`ouvidoDosPes`: o pé tem de subir de verdade antes de pisar de novo); o
  cavalo, sem esses ossos, galopa pela distância. O saque da katana e o da espada têm sons diferentes, no instante em
  que a lâmina sai da bainha.
- A recusa (clique na própria peça fora da vez) e o gesto amigável mexem na peça inteira e devolvem ela ao descanso
  no fim. O descanso fica guardado na peça enquanto uma delas roda (`comecarAnimacaoDoCorpo`): a que começa no meio de
  outra parte dele, e um lance, golpe, queda ou comemoração devolve a peça antes (`voltarAoDescanso`). Antes, cliques
  seguidos deixavam a peça fora do centro da casa.

## A máquina

- Três dificuldades, escolhidas no "Novo jogo" e gravadas na partida (`dificuldade`; as antigas valem como difícil). O
  difícil é a máquina de sempre: livro, o que aprendeu e busca de até 6 lances em 0,9 s. O intermediário usa o livro,
  pensa 3 lances e em 20% das vezes sorteia entre os 3 melhores. O fácil pensa 1 lance, não usa o livro e em 40% das
  vezes joga qualquer lance. Só o difícil alimenta o aprendizado: os descuidos dos outros a ensinariam a jogar mal.
- Na busca, o melhor lance da profundidade anterior vai primeiro, senão o tempo acabando no meio de uma profundidade
  descartava o que já tinha sido achado (perdia mate em um). E o mate vale -100000 pra quem tem a vez, sem o sinal da
  cor: com ele, a máquina de brancas fugia de dar mate.
- Empate: contra a máquina, ela aceita se não estiver na frente além de uma folga por dificuldade, olhando dois lances
  (`maquinaAceitaEmpate`); fica gravado como "Empate por acordo". Entre amigos, a sala é o árbitro: um pedido por vez e
  um por lance de cada um, jogar recusa o pedido, e aceito termina com `motivo: 'acordo'`.

## Tela de partida

- Não há tela normal: o jogo ocupa sempre a página inteira, e no celular cada toque pede de novo a tela cheia do
  navegador, se ela tiver saído. A situação da partida, o convite esperando o amigo, o pedido de empate e a revanche
  ficam embaixo; o menu no canto de cima. Não há botão de som na partida (fica nas Configurações).
- O fim da partida aparece no centro (`ResultadoDaPartida.tsx`): na vitória, uma taça 3D com renderizador próprio, na
  resolução da tela e transparente, pra não depender da qualidade do tabuleiro.
- A aba de lances (`PainelDeLances.tsx`) é uma lingueta na borda direita, com uma coluna pra cada lado.

## Qualidade

- A média é o padrão. A configuração inteira é gravada na primeira vez, então a alta de antes estava gravada até em
  quem nunca escolheu: a qualidade gravada só vale com `qualidadeEscolhida`, marcado quando a pessoa escolhe.
- Baixa: abaixo da resolução da tela (0,8 × até 1,25), sem sombras, sem antisserrilhado e no máximo 30 quadros por
  segundo, pra celular e computador fracos. Média: até 1,6 vez a tela, nunca abaixo dela, sombras de 1024. Alta: como
  sempre, no mínimo Full HD e sombras de 2048. O antisserrilhado só muda ao abrir o jogo de novo.
- A Loja, a vitrine e a taça seguem a qualidade gravada (`desenhoDosPaineis`). Os testes forçam a baixa, e por isso
  gravam `qualidadeEscolhida: true` junto.

## Livro de aberturas

`public/chess/livro.json` (34.765 posições) sai de `games.pgn` (1000 partidas) por
`scripts/compilar-livro-xadrez.mjs`. O gerador usa Stockfish, que não fica no projeto. `?!` no PGN marca lance
fraco: a máquina responde a ele, mas nunca o joga.

## Som

Tudo sintetizado em `src/som/sons.ts`, sem arquivos de áudio. Foi medido, nunca ouvido: o ruído é sorteado e o
pico oscila, então deixe folga abaixo de 1,0.
