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
- `tabuleiro/`: a partida em 3D. `ChessBoard3D.tsx` junta as peças num `useEffect`: monta a cena, cria os módulos abaixo
  e liga as ações (`acoesRef` é a ponte do React pra cena). `casas.ts` tem as coordenadas e as texturas do tabuleiro;
  `ResultadoDaPartida.tsx`, `PainelDeLances.tsx`, `RelogioDaPartida.tsx`, `EscolhaDoNovoJogo.tsx` e
  `MenuDoAdversario.tsx` (bloquear/denunciar), o que aparece por cima dela. `ganchosDeTeste.ts` é o `window.__xadrez`,
  só em desenvolvimento.
  - `tabuleiro/cena/`: `montarCena.ts` (desenho, luzes, mesa, casas, coordenadas, grupos e as qualidades) e
    `vistaDaCamera.ts` (o giro da câmera, as coordenadas que viram junto, o enquadramento e o ajuste de tamanho).
  - `tabuleiro/fluxo/`: `andamento.ts` (o que muda a cada lance: `geracao` invalida animações de um tabuleiro antigo,
    `lancesEmAndamento`, a fila da sala), `lanceAnimado.ts` (o lance com a luta, o roque e a promoção),
    `partidaContraMaquina.ts` (a vez da máquina e o relógio da blitz contra ela), `partidaOnline.ts` (o tabuleiro da
    partida entre pessoas e o relógio do servidor) e `useSalaOnline.ts` (a conexão ao vivo e a revanche). Cada módulo
    recebe o que usa num objeto (`dependencias`): o que é `let` compartilhado mora no `andamento`.
  - `tabuleiro/pecas/`: as peças. `modelosRPG.ts` (carregar os .glb, os clipes, a espada do peão), `geometricas.ts` (o
    boneco de madeira, se o modelo não carregar), `materiais.ts`, `montarPeca.ts` (a peça de uma casa), `vestimenta.ts`
    (o que as peças de quem joga vestem), `equipamentos.ts` (armaduras e armas em malha com esqueleto), `ossos.ts` (o
    IK de dois ossos), `expositor.ts`, `vitrine.ts` e `emblemas.ts` (os símbolos das habilidades).
  - `tabuleiro/animacoes/`: `movimento.ts` (andar, correr, virar, o salto do cavalo), `gestos.ts` (gestos, gesto
    amigável, comemoração, recusa e descanso), `queda.ts` (a vítima sumindo) e `cerimonias.ts`
    (pétalas da honra e ascensão da promoção).
  - `tabuleiro/combate/`: `golpes.ts` (a espada do peão, o alcance, o impacto), `poderes.ts` (orbe, raio, onda),
    `marreta.ts` (marreta, machado e maça, com a peça presa), `efeitosDasArmas.ts` (os efeitos de cada arma) e
    `lutaSemArma.ts` (socos e chute), `nocaute.ts` (a vítima jogada pela força), `lancaDoCavalo.ts` (a estocada da
    lança) e as habilidades (`habilidades.ts`, com um módulo pra cada uma que tem pose própria).
- `telas/`: `MenuXadrez.tsx` (tela inicial e painéis), `PasseioInicial.tsx` (o passeio da primeira vez),
  `PainelPrivacidade.tsx` (texto em `textos/privacidade.ts`), `AdversarioAutomatico.tsx`, `PainelConta.tsx`, `PainelAmigos.tsx`, `PainelPerfil.tsx`,
  `PainelConquistas.tsx`, `PainelLoja.tsx`, `PainelPersonalizacao.tsx`, `QrCode.tsx` e `ui/`. `ElementosDoJogador.tsx`
  tem o avatar com moldura, o ID e o placar que amigos e perfil dividem.
- `conta/`: `senha.ts` (PBKDF2 no aparelho; a fórmula do sal não pode mudar sem migrar as contas), `personalizacao.ts`,
  `conquistas.ts`, `bilhete.ts`, `aparencia.ts`, `foto.ts`, `presenca.ts` e `conviteDeAmizade.ts`.
- `dados/`: `db.ts` (salva primeiro no aparelho, IndexedDB com um banco por conta, e depois na nuvem, com fila),
  `servidor.ts` (chamadas ao servidor e sessão), `salaAoVivo.ts` (WebSocket da partida, com reconexão; o token vai como
  subprotocolo) e os repositórios das partidas e do aprendizado.
- `jogo/` (regras, a máquina, o livro de aberturas e as configurações), `som/sons.ts`, `textos/idiomas.ts` e `app/`
  (`aplicativo.ts`, o jogo instalado como aplicativo: service worker, instalar, versão nova; `registroDeErros.ts`; e
  utilidades).
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
  Quem liga qual conta fica fora do repositório, que é público. Pelo ID de jogador (o de 8 letras do perfil):
  `... SET tudo_liberado = 1 WHERE id_jogador = '<ID>'`. A marca libera tudo: molduras, armaduras, montarias, armas e
  habilidades (serve pra quem ajuda a testar o jogo).
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
- Habilidade especial é uma parte própria (`golpe`, catálogo `habilidades`, por peça): o peão, com o
  retalhamento. Comprar não basta, tem de equipar na Personalização, e ele só sai com a katana na mão (a tela avisa).
  O expositor mostra o símbolo da habilidade (`src/tabuleiro/pecas/emblemas.ts`), não a arma: o do retalhamento é o desenho do
  usuário, três órbitas cruzadas (faixas achatadas e inclinadas, que de frente ficam grossas nas pontas como pincel) e
  dois cortes em crescente por cima. A compra continua sendo o item `p:golpe:retalhamento`.
- A rainha tem o Puxão Universal (`q:golpe:puxao`, 500 óticoins), da descrição e do desenho do usuário, e ele vale com
  ou sem arma. Na captura ela não anda até a vítima, e a execução segue a mecânica de movimento do anime (pedido do
  usuário): o corpo inteiro das duas peças, de pose em pose, as poses paradas tremendo "em dois" (12 desenhos por
  segundo), o movimento rápido entre elas e um golpe fora do comum no meio:
  - base de luta: a rainha firma os pés (o esquerdo à frente), desce o corpo, recolhe a mão e torce o tronco,
    carregando; a palma acende com o brilho de anime ("tiin");
  - impulso: a mão aberta sai de uma vez (estalo, linhas de foco, a câmera fecha um pouco) e fica; a outra mão segura o
    antebraço pra firmar (com arma na mão, fica aberta pro lado);
  - a peça vem pelo ar acelerando, com anéis e linhas de velocidade, como quem levou uma pancada enorme: o peito na
    frente, os braços e as pernas jogados pra trás; a rainha é arrastada um pouco pra trás;
  - só a cabeça trava na mão: faísca, tranco e o tempo para 70 ms;
  - a hélice (o golpe fora do comum): o corpo segue no embalo e gira uma volta e meia preso pela cabeça, na frente da
    rainha, com o borrão atrás e o vento de cada meia volta, e para de pernas pro ar lá no alto;
  - o "ma": um instante parado no alto, tremendo, a rainha arqueada na ponta dos pés;
  - a pancada: em três, quatro desenhos a peça tomba pra longe da rainha e bate no chão deitada de peito pra cima (a
    cabeça na mão, os pés pra longe), esparramada; o quadro de impacto (a tela em negativo por 90 ms), as linhas de
    foco, a câmera abrindo, a poeira e a onda da marreta;
  - a rainha fica agachada na pose do golpe (o zanshin) e só depois se levanta, devagar;
  - o chão racha e cede numa cratera com o feitio do corpo, mais funda e mais larga quanto mais pesada a peça (peão 1,
    cavalo e bispo 3, torre 5, rainha 9); rachaduras e tremor crescem do mesmo jeito;
  - a peça é achatada deitada (pedido do usuário: nada de achatar de cima pra baixo em pé), fica um instante e a
    gravidade a puxa pra dentro do chão até sumir; o chão volta (o buraco fecha da borda pro meio) e só então a rainha
    anda até a casa.

  Fica em `combate/puxaoUniversal.ts` (as duas peças) e `combate/cratera.ts` (o buraco e o afundar): a pose por cima
  do clipe, como a luta sem arma, desfeita e refeita a cada quadro no laço do ChessBoard3D. A rainha anda por poses-chave
  (`posesDaRainha`: as duas mãos, o tronco, o quanto agacha, os pés na base de luta), cada uma com a curva de chegada
  (`saida` é o estalo do anime, `entrada` a pancada) e, nas paradas, o tremor em dois; os pés ficam presos no chão
  (`levarPernaAte`) enquanto o corpo desce, e o lugar dela volta ao de antes no fim. A cratera não mexe no
  tabuleiro: é uma tigela embaixo do tampo e uma tampa que só escreve profundidade, desenhada antes das casas
  (`renderOrder` negativo), e a vítima é desenhada antes da tampa pra continuar à vista dentro do buraco. As rachaduras
  vão rentes ao tampo (`altura` 0,001), senão aparecem por cima do buraco.

  O símbolo (`emblemas.ts`) é a terceira versão do desenho do usuário (21/11): dois elos abertos no meio, um de frente
  pro outro, com as pontas em seta, e os quatro pares de arcos em volta. Tudo sai dos traços pretos da imagem (1254 px,
  centro 626,5 e 595,5, escala 1/875): os arcos como traços de pincel de grossura igual (`traco`), e os elos pelo
  contorno de cada um, seguido pixel a pixel e simplificado (`contorno`).

  A base do som é o segundo áudio que o usuário mandou (22/11, "Puxão Universal"; o primeiro, o "Banshō Ten'in" do
  Pain dublado, virou uma entoação de quatro sílabas, trocada por este). O arquivo não entra no jogo, que é público e
  só tem som sintetizado: `puxao:chama` faz a mesma coisa, medida no áudio:
  - um zumbido grave numa nota só, 46,6 Hz, com a boca de um "ô" (o 2º harmônico é o mais forte; picos em 2-3, 6-7 e
    14-15, quase nada acima de 900 Hz). A onda é periódica (`ondaDoPuxao`), com o volume de cada harmônico medido
    (`HARMONICOS_DO_PUXAO`) e as fases de Schroeder, que deixam a onda uns 5 dB menos pontuda que uma dente de serra
    filtrada, e o limitador a deixa mais alta;
  - entra instável (um sopro grave e a nota descendo de 52 Hz) e firma em 0,45 s; depois cresce devagar, com os
    pontos do volume do áudio (-15 dB em 0,1 s até o máximo), até a pancada (1,85 s, `PANCADA_ATE`), e apaga em 0,3 s
    pra pancada passar.

  Por cima, só os toques de cada momento: o ar sugado (`puxao:arrasta`, sem os tons que subiam, que brigariam com a
  nota), o tranco da pegada (`puxao:agarra`, sem a cauda, que o zumbido cobre), o vento da hélice e a pancada.

  O som do Puxão é o que manda na habilidade (pedido do usuário, 22/11): alto o bastante pra se ouvir sem aumentar o
  volume. O áudio de referência é quase todo grave, que o celular não toca; no jogo, os harmônicos acima de 300 Hz
  sobem 9 dB (`REALCE_NO_CELULAR`) e os três primeiros descem 6 (`GRAVE_A_MENOS`). A nota grave se ouve mesmo assim,
  pela sequência dos harmônicos. Medido no que o celular toca (acima de 300 Hz), o zumbido cresce de -20 a -15 dB até
  a pancada. Na pancada, a vítima geme uma vez só: a pancada é a do Puxão (`puxao:esmaga`), sem o `esmagado` e sem o
  grunhido da rainha (`sentirImpacto` com `grunhido` falso), que pareciam a vítima de novo. `testar-armas` confere a
  voz única.

  As fotos de cada pose-chave saem de `SO=puxao,puxao-de-lado,puxao-de-cima,puxao-rainha node testes/fotos-armas.mjs`
  (a última compara a cratera da rainha com a do peão).
- O peão tem a Dempsey Roll (`p:golpe:dempsey`, 300 óticoins), o golpe do
  boxe de Jack Dempsey que é o golpe final do Ippo em Hajime no Ippo. Luta com os punhos (`maosLivres` no cadastro): vai
  até a vítima sem sacar a arma, no alcance dos socos, e vale com qualquer arma.
  - Agachado na guarda alta, os olhos brilham ("tiin").
  - O aquecimento (pedido do usuário): duas voltas do oito sem bater, 2 s, o balanço crescendo, com o rastro de luz
    desenhando o ∞.
  - Os ganchos: o tronco descreve o oito deitado (sen φ de lado, sen 2φ de cima pra baixo) avançando; a cada ponta do
    balanço sai um gancho, esquerdo e direito alternados, começando no ritmo do aquecimento e acelerando (três voltas,
    seis ganchos, 2,4 s: mais lento que a primeira versão, pedido do usuário). Começa com o estalo de anime.
  - No meio do oito, a parada brusca (a do Ippo depois do Sawamura), e a roda volta mais rápida.
  - A carga parada, tremendo em dois, o brilho no punho direito, e o gancho final com o corpo todo: o quadro de impacto,
    e a vítima sai voando pelo nocaute (força 2,2).
  - A vítima reage (`posarVitima`, pedido do usuário): no aquecimento levanta a guarda cobrindo o rosto, treme, recua uns
    passos e a cabeça acompanha o balanço; cada gancho joga a cabeça pro lado (uma mola) e o corpo gira junto, a guarda
    cai, ela cambaleia pro lado do golpe e os joelhos vão cedendo; depois do terceiro, tonta, o tronco roda devagar.
  - O impacto de cada gancho (pedido do usuário: no anime, o golpe é na cabeça): a faísca, o anel de impacto abrindo,
    o estouro de riscos e os respingos voando pra onde a cabeça vai (`anelDeImpacto`, `estouroDeRiscos` e
    `respingos`, em `efeitosDeAnime.ts`). No instante do acerto, a cabeça vai pra trás de uma vez, com o pescoço e o
    peito: chega em uns 20 ms, segura e volta em uns 170 ms (`ultimoGancho`).

  O símbolo é a segunda versão do desenho do usuário (21/11): duas luvas de boxe de frente, cada uma com o ∞ no dorso.
  É desenho de contorno, então cada parte preta sai da imagem com os buracos brancos de dentro (o contorno seguido pixel
  a pixel e simplificado), em `pecas/desenhos/dempsey.json`, com um bisel fino (`extrudarFino`) pra não fechar os vãos
  estreitos do punho.

  Fica em `combate/dempseyRoll.ts` (as duas peças, por cima do clipe, desfeito e refeito no laço como o puxão). As fotos
  saem de `SO=dempsey,dempsey-de-lado node testes/fotos-armas.mjs`.
- Nas outras habilidades a vítima também reage: no Puxão, vê a rainha carregando, vira pra ela e se inclina pra trás com
  os braços na frente; puxada, resiste inclinada pra trás e arrastando os pés, se debatendo, até ser arrancada do chão
  (`ARRASTA_ATE`, `ARRANCA_ATE`). No Retalhamento, recua e cambaleia a cada corte, um pra cada lado (`sacudir`).
- Toda habilidade segue o padrão de anime (`brilhoDeAnime`, `impulsoDeAnime` e `impactoDeAnime`, em
  `combate/habilidades.ts`): o brilho com o "tiin" no começo (os olhos, a palma, a lâmina), o impulso quando o golpe sai
  (estalo, linhas de foco, a câmera fechando) e, no golpe que decide, o quadro de impacto, as linhas de foco, a faísca e
  a câmera abrindo. Os sons são `anime:brilho` e `anime:estala`. Uma habilidade nova chama os três.
- Os efeitos de anime ficam em `src/tabuleiro/combate/efeitosDeAnime.ts` (cada um já sai no tamanho do começo: sem
  isso, o primeiro quadro mostrava a faísca e o anel no tamanho 1, um clarão enorme) (`emDois`, `acaso` pro tremor desenho a
  desenho, `linhasDeVelocidade`, `faisca`, `criarLeque`, o borrão atrás do que gira) e, os de tela, na
  `SensacaoDaPartida` que o lance entrega a cada habilidade: `linhasDeFoco` (um canvas por cima do 3D, redesenhado em
  dois), `quadroDeImpacto` (filtro de negativo no canvas; nada com "menos movimento") e `socoNaCamera` (o campo de visão
  fecha ou abre e volta). Qualquer habilidade nova usa os mesmos.
- O realismo das ações (`src/tabuleiro/sensacao/realismo.ts`): `REALISMO` é a porcentagem de física de verdade (hoje
  70%; 100% seria um boneco de pano solto, 0% a peça dura de desenho animado), e menos movimento a reduz. `corpoLargado`
  põe a pose do corpo arrancado por cima do clipe (costas arqueadas, membros pra trás ou pra frente, abertos, tremulando)
  e `massaDaPeca` dá o peso de cada peça. Seguem o Puxão, a Dempsey Roll e o nocaute dos golpes simples. A peça com
  `userData.poseDeHabilidade` (as duas de uma habilidade, a vítima no ar) fica fora da inércia de quem anda e dos gestos.
- A rainha tem também o Empurrão Universal (`q:golpe:empurrao`, 500 óticoins; a ideia, o bilhete e o símbolo são do
  usuário, 21/11). Luta com as mãos (`maosLivres`): vai até a vítima sem sacar a arma, e vale com qualquer arma. Do
  bilhete: a peça vai até a casa da outra e, as duas no mesmo lugar, carrega a habilidade como uma bolha de vento e
  repele a peça capturada pra fora do tabuleiro. De pose em pose, como o Puxão:
  - ela recolhe as palmas na frente do peito, uma de frente pra outra, e desce o corpo; o brilho de anime entre elas;
  - a bolha é uma barreira (pedido do usuário, 22/11): nasce entre as palmas e, em 0,6 s, cresce até cobrir a rainha
    inteira, do chão ao alto da cabeça (centro no meio do corpo, raio de 0,7 vez a altura dela; o tabuleiro corta a
    esfera embaixo, e ela fica pousada como uma cúpula). Nada a atravessa, de nenhum lado: a superfície é clara na borda
    e quase transparente no meio (um sombreador próprio, com faixas de vento girando), e correntes de vento correm por
    ela em todas as direções, com três anéis girando e o ar sugado de fora;
  - a parede da bolha chega na vítima e a empurra pra trás conforme cresce (a esfera cortada na altura do peito dela):
    ela resiste inclinada, os braços na frente do rosto, os pés escorregando, tremendo. Cheia, a rainha treme em dois;
  - o empurrão: as palmas saem de uma vez e a bolha se expande como uma onda (até 2,8 vezes) e some, com a onda no chão
    e a poeira em volta da rainha. A parede passa pela vítima (o golpe que decide: o quadro de impacto, o anel e os
    riscos no peito dela), e ela voa alto, por cima de tudo, até passar da beira e cair na mesa (`nocautear` com
    `foraDoTabuleiro`);
  - a rainha fica um instante com as palmas pra frente e volta.

  Fica em `combate/empurraoUniversal.ts`; os sons são `empurrao:carrega`, `empurrao:solta` e `empurrao:estouro`. O
  símbolo (`EMBLEMAS.empurrao`): a imagem do usuário é de mangá (retícula, gradiente, brilho), então foi redesenhada em
  traço cheio de aço, com a mesma composição e as proporções medidas nela. A bolha de vento é uma meia cúpula no chão,
  com o núcleo de luz e os raios; em volta, cinco setas pra fora (165°, 128°, 90°, 52° e 15°), os riscos de velocidade
  e as faíscas. Fotos: `SO=empurrao,empurrao-de-lado node testes/fotos-armas.mjs`.
- Os blocos de habilidade (pedido do usuário): até três habilidades na mesma peça, e na captura quem joga escolhe qual
  usar.
  - O 1º bloco é grátis; o 2º custa 50 e o 3º, 70 óticoins, uma vez por peça (`peça:bloco:2`, `peça:bloco:3`, preços em
    `blocosDeHabilidade` no catálogo).
  - Um bloco só é vendido quando a peça tem habilidades pra ele: hoje o peão e a rainha têm o 2º, e ninguém tem o 3º. O 3º pede o 2º
    antes (`falta-o-bloco-anterior`).
  - Cada bloco é uma parte da peça: `golpe`, `golpe2` e `golpe3`, com as mesmas opções. O servidor confere o bloco
    comprado (`bloco-bloqueado`) e a habilidade comprada (a parte `golpe` do catálogo vale pros três). A mesma
    habilidade escolhida noutro bloco muda de bloco, no servidor e no aparelho.
  - A Personalização mostra os três blocos ao tocar em Habilidade; a Loja vende os blocos na aba Habilidades, depois
    das habilidades da peça, com o símbolo de placas (`emblemaDoBloco`).
  - Na captura (`tentarMover` no ChessBoard3D), com duas ou mais equipadas que podem sair (`habilidadesQuePodem`: a
    peça certa e a arma na mão), aparece "Qual habilidade usar?" antes do lance. A escolha vai em
    `executarLanceComAnimacao({ ..., habilidade })`; sem escolha vale a do primeiro bloco que pode. Na partida contra
    outra pessoa a habilidade (escolhida ou a única) vai no lance (`enviarLance(..., habilidade)`); o servidor só
    repassa se a peça a tem equipada num bloco (`habilidadeConferida`; se não confere, relê o banco uma vez, pra quem
    equipou depois de entrar) e o adversário vê a mesma (`andamento.habilidadesDaSala`, pelo número do lance). O lance
    sai antes do estado inteiro: ao contrário, o outro aparelho enfileiraria o lance sem a habilidade. Na promoção com
    captura, a peça da promoção vem antes.
  - A prévia da Loja tira os outros blocos, pra não perguntar.
- A katana fica na bainha quando a peça não vai usá-la (bug visto pelo usuário). Um gesto com a katana cortado no meio
  por um lance perdia a guarda: a nova sequência invalidava o "guardar" do fim do gesto, e a katana ficava na mão. Com
  ela na mão saíam a Dempsey Roll, os socos e a reverência da honra do samurai. Agora `embainharAntes` (lanceAnimado)
  guarda a katana antes:
  - das habilidades de longe e das de mãos livres;
  - dos socos e do chute;
  - da honra do samurai (que também não acontece mais com uma habilidade escolhida);
  - do passo de sempre.

  Se a guarda não terminar em 1,6 s, segue sem ela. A vítima de qualquer captura perde a katana da mão na hora.
  `testar-armas` confere a katana voltando pra bainha (`sacarKatanaParaTeste`, `katanasNaMao`) e a escolha da
  habilidade (`escolherHabilidade`).
- As habilidades têm cadastro único: `src/conta/habilidades.ts` (`HABILIDADES`) diz de que peça é cada uma, se vai até
  a vítima (`corpoACorpo`) ou não (`aDistancia`), se pede uma arma na mão e se luta com as mãos (`maosLivres`: vai
  até a vítima sem sacar a arma). A animação de cada uma fica em
  `src/tabuleiro/combate/habilidades.ts` (`CAPTURAS`): ela recebe a cena, as duas peças, `sentirImpacto` e `fim`. O lance
  animado acha a habilidade de quem captura (`habilidadeDaCaptura`) e chama a captura dela. A Personalização e a Loja
  leem o cadastro: a explicação, o aviso da arma e o complemento "com a katana".

### Como adicionar uma habilidade

1. **Catálogo** (`src/catalogos/personalizacao.json`): o nome em `habilidades.<peça>` e o preço em
   `loja.<peça>["golpe:<nome>"]`. O servidor lê o catálogo, então publica o servidor junto (`wrangler deploy`). A 2ª e a
   3ª habilidade de uma peça abrem sozinhas a venda do 2º e do 3º bloco dela.
2. **Cadastro** em `src/conta/habilidades.ts`: a peça, o alcance e a arma exigida. Uma arma nova exigida pede dois
   textos: o aviso na Personalização e o complemento na Loja.
3. **Animação** em `CAPTURAS` (`combate/habilidades.ts`): o padrão de anime (`brilhoDeAnime` no começo,
   `impulsoDeAnime` quando o golpe sai, `impactoDeAnime` no golpe que decide); no acerto, `c.sentirImpacto()` e, depois do
   congelamento, `c.fim()` quando a vítima já saiu (ou `nocautear`, que chama `fim`). Uma pose do corpo própria segue o
   puxão e a Dempsey Roll:
   - um módulo em `combate/`;
   - o começo marcado em `agoraDoJogo()`;
   - desfazer e atualizar no laço do ChessBoard3D.
4. **Símbolo** em `EMBLEMAS` (`pecas/emblemas.ts`). Para um desenho do usuário, `traco` monta cada traço de pincel a
   partir dos pontos dele.
5. **Textos** `personalizacao.opcao.<nome>` e `personalizacao.habilidade.<nome>` nos três idiomas, e os sons em
   `SONS`.
6. **Testes:**
   - em `testes/testar-armas.mjs`, a captura com a habilidade vestida (`vestir: { <peça>: { golpe: '<nome>' } }`);
   - em `fotos-armas.mjs`, as fotos de cada fase;
   - `testar-golpe-que-pesa` acusa o que faltar do cadastro, da animação, do símbolo, do preço ou dos textos
     (`habilidadesIncompletas`).
- Toda peça começa sem arma, inclusive as da máquina e as do adversário: as armas aparecem só em quem liberou e vestiu.
  Peão: katana ou espada. Torre: marreta, machado (lâmina em meia-lua) ou maça. Cavalo: lança. Bispo: cajado ou cristal.
  Rainha: cajado, cristal ou lua. Rei: cajado, cristal ou cetro.
- Sem arma (`userData.arma === 'nenhuma'`), toda peça menos o cavalo, que pisoteia com as patas, vai até a vítima e luta
  com o corpo (`src/tabuleiro/combate/lutaSemArma.ts`): um jab e um direto, ou um chute de frente, sorteados, com sons próprios
  (`soco:jab`, `soco`, `chute:ar`, `chute`). A pose vai osso por osso por cima do clipe, com o IK de dois ossos de
  `src/tabuleiro/pecas/ossos.ts` (o mesmo da marreta): antes dos clipes o quadro desfaz a pose (`desfazerPosesDasLutas`), e
  depois deles guarda o que o clipe deixou e posa de novo (`atualizarLutas`). Quem bate para a `distanciaDaLuta` da
  vítima. O orbe do bispo e a onda do rei, que eram o ataque sem arma, ficaram sem uso no código.
- Os golpes simples são fortes de verdade (pedido do usuário: a queda tem de fazer sentido). O direto tem carga (o punho
  puxado pra trás, o tronco torcido) e sai com o corpo todo: um passo pra dentro do soco, o punho passando do ponto. O
  chute sobe o joelho alto, joga o tronco pra trás e empurra atravessando a vítima. O passo de quem bate parte de onde
  estava e volta pra lá no fim (`avancar`, em `lutaSemArma.ts`).
- A vítima dos golpes simples (socos, chute, espada e katana sem habilidade, raio, poder do bispo, onda do rei, cristal) é
  jogada pela força (`src/tabuleiro/combate/nocaute.ts`, `nocautear`), não cai mais no lugar:
  - a distância sai da força do golpe e da razão das massas (`massaDaPeca`): a rainha arremessa o peão a mais de uma
    casa, o peão derruba a rainha quase no lugar;
  - o golpe acima do meio do corpo faz a peça girar pra trás no ar; os mais fortes dão uma cambalhota antes de cair;
  - a peça cai deitada, quica, desliza um pouco e fica estirada antes de sumir;
  - apanhando de frente, os membros vão pra frente; de costas, cai de cara;
  - uma peça no caminho segura o voo antes dela; perto da beira, cai na mesa.

  O jab só sacode (`sacudir`): a cabeça vai pra trás e a peça recua meio passo, tonta. Tudo anda no relógio do jogo: no
  congelamento do impacto, a vítima fica parada na pose da pancada e voa quando o tempo volta. O som de queda (`queda:<peça>`)
  toca quando ela bate no chão, não no golpe. As duas peças em pose ganham `userData.poseDeHabilidade`, que tira a
  inércia. As fotos saem de `SO=golpe,chute-rainha,golpe-peao,socos,chute node testes/fotos-armas.mjs`. A queda antiga
  (tombar no lugar, `animarQuedaEDesaparecimento`) saiu do código.
- O cavalo (pedido do usuário):
  - sem a lança, salta até a casa e, ainda no ar, quando a frente dele encosta na vítima (o `alcance` do salto, em
    `movimento.ts`), as patas da frente acertam o peito dela. A vítima, que vira pra ele ao ver o salto, voa pela força
    (`nocautear`, força 1,9, a massa do cavalo contra a dela) pro lado do salto, e ele pousa na casa. O salto anda no
    relógio do jogo: no congelamento do impacto, o cavalo para no ar junto. O arremesso antigo (`arremessarPeca`) saiu;
  - com a lança, o golpe é outro. A vítima vira pro cavalo, e ele vem a galope em linha reta (a caminhada mais rápida,
    no ritmo do galope: `deslocarRPG` com `galope`) até o alcance da lança (`paradaDaLanca`: a lança vai ao longo do
    antebraço e, mirada no peito, a ponta corre na linha do cotovelo ao peito). Ali ele recua um palmo mirando o
    antebraço no peito e investe; a ponta entra (o anel, os riscos e os respingos), e a vítima fica presa, curvada
    sobre a lança, tremendo em dois. Ele recua puxando a lança, e ela desaba pra frente ali mesmo e some
    (`combate/lancaDoCavalo.ts`; sons `golpe:lanca`, `lanca:perfura` e `lanca:puxa`). Ele anda o resto até a casa:
    o cavalo só salta acima de 1,5 casa (`SALTO_MINIMO`).

  Fotos: `SO=lanca,enquadra-lanca,cavalo node testes/fotos-armas.mjs`.
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
- A prévia da Loja ("Ver em ação", pedido do usuário pra dar vontade de comprar): cada arma e habilidade tem o botão, no
  cartão e no item aberto. O menu some (fica montado, escondido, pra Loja voltar no item), o tabuleiro da tela inicial
  carrega uma posição pronta pra peça do item (`tabuleiro/fluxo/previaDaLoja.ts`, `CENAS`), veste a peça de quem joga com
  o item por cima do que ela já usa (`vestimentaDaPrevia`; a habilidade que pede arma vem com ela) e joga a captura de
  verdade, com a câmera de perto (`vista.irParaAcao`). Sem partida (nada salvo) e sem resposta da máquina; "Pular" volta
  na hora. De volta, o item aberto diz o que faz (`loja.acao.<arma>` ou o texto da habilidade), "Gostou? É seu por N",
  a conquista que também libera a arma, com a barra de progresso, e, pra quem não tem as óticoins, as três conquistas
  mais perto de sair (`maisPerto`), pra dar vontade de jogar mais.
- A Loja tem três abas: Armaduras, peça por peça, com atalhos no fim pras armas e habilidades daquela peça; Armas e
  Habilidades, cada uma numa lista só separada por peça, cada cartão com o retrato e o nome de quem usa. Cajado e
  cristal aparecem em cada peça que os usa, porque a compra é por peça; o retalhamento fica em Habilidades, com o
  símbolo dele. O canvas da Loja cobre só a faixa à vista de quem rola (`quemRola`), senão a lista das armas passaria
  do tamanho de canvas que um celular aceita.
- `src/tabuleiro/pecas/equipamentos.ts` monta as armaduras e armas: cada parte vira malha com esqueleto presa ao osso que cobre,
  medida no corpo em pose de braços abertos (igual nas seis peças). O que a parte nova substitui (ombreira redonda,
  cajado, sela, katana) some do modelo pela regra de `ESCONDER`, numa cópia da geometria.
- Quem joga veste as próprias peças (`tabuleiro/pecas/vestimenta.ts`); no menu, as brancas. Na partida contra outra
  pessoa, as peças do adversário vestem o que ele comprou e equipou (`vestimenta.adversario`, `escolhasDaCor`): pedido
  do usuário (25/11), pra quem não comprou ver as armas e as habilidades e ter vontade de jogar pra comprar. A sala lê a
  personalização dos dois no banco a cada conexão (`lerVestimentas` em `sala.ts`; o banco só guarda o que foi comprado)
  e manda a do outro em `vestimentaDoAdversario`. A máquina não veste nada. A marreta da torre muda em
  `criarMarreta`. A vitrine da aba tem renderizador próprio e é montada por `montarVitrine`.
- `testes/fotos-personalizacao.mjs` fotografa cada peça vestida: é como se confere se as partes encaixam.

## Conquistas e óticoins

- A óticoin é uma moeda 3D com o peão de um lado e o rei do outro: `node scripts/gerar-oticoin.mjs` gera em
  `public/oticoin` a fileira de quadros do giro e os dois lados parados, que o componente `Oticoin` mostra.
- Catálogo em `src/catalogos/conquistas.json`, também lido pelo Worker. Só contam partidas contra a máquina; as com amigos
  ficam de fora. Capturas, xeques, roques, ascensões (as promoções de quem joga, pelo `p` nas flags do lance) e vitórias
  saem das partidas salvas (`contarPartidas`); convites aceitos, o servidor conta. Ascensões: 20 pagam 10, 50 pagam 25 e
  200 pagam 100 (pedido do usuário). Uma medida nova entra no progresso guardado (`POST /conquistas/progresso` exige
  todas as medidas do catálogo): o site antigo em cache tem o progresso recusado em silêncio até atualizar.
- Vitória contra a máquina paga pela dificuldade: 1 no fácil, 2 no intermediário, 3 no difícil (`POST /vitorias/receber`,
  tabela `vitorias_pagas`). O servidor confere a partida salva na conta (terminada, vencida, com dificuldade) e paga cada
  uma uma vez só. A blitz paga igual. O aparelho manda ao abrir o menu, as mais antigas primeiro.
- No máximo 3 recompensas por hora, somando os modos (`RECOMPENSAS_POR_HORA`, nos dois lados; as conquistas ficam fora
  dessa conta, porque já pagam uma vez só): janela móvel de 60 minutos, contada em `vitorias_pagas` com `oticoins > 0`.
  A vitória que chega sem vaga fica registrada com valor 0 (sem prêmio) e não paga depois, senão quem vence muito em
  pouco tempo só receberia mais tarde. Cada vitória é um lote de três comandos (o recibo pago só entra se a contagem da
  hora, feita dentro do próprio comando, ainda tem vaga; a moeda com `changes()`; o recibo sem prêmio com `ON CONFLICT
  DO NOTHING`), então pedidos ao mesmo tempo não passam do teto. `GET /vitorias/recompensas` diz as da última hora: a
  taça (`recompensaDaVitoria`) pergunta antes de prometer e, sem vaga, diz a que horas volta a pagar; o menu avisa as
  vitórias que ficaram sem prêmio.
- Bilhete (`POST /partidas/bilhete`, tabela `bilhetes`, `conta/bilhete.ts`): o aparelho avisa quando a partida contra a
  máquina começa (até o 2º lance; sem conexão, tenta a cada lance). A vitória só paga se tiver bilhete da mesma
  dificuldade, se durou pelo menos 10 s + 1 s por lance, e se a posição final (`fen`, gravada na partida) é de verdade:
  a vez é da máquina, o número do lance bate com o PGN e é mate; na blitz, o tempo da máquina zerou, a partida durou
  pelo menos o tempo base e quem joga tinha peças para dar mate (`vitoriaConfere`). A que não confere fica com recibo
  sem prêmio (`invalidas`) e não volta. Só a posição final é conferida: refazer a partida passaria dos 10 ms. Sem
  bilhete, a taça diz que a partida começou sem conexão. Nos testes, `testes/vitorias-de-teste.mjs` grava bilhetes antigos.
- O servidor não refaz as partidas (não cabe nos 10 ms): confia na contagem do aparelho, mas cada conquista paga uma vez
  só (tabela `conquistas`), então o máximo de uma conta é a soma do catálogo. O recibo e a moeda entram juntos no mesmo
  lote, com `changes()`.

## Privacidade, erros, backup e testes no GitHub

- Privacidade e termos em `src/textos/privacidade.ts` (os três idiomas; trocar a data ao mudar algo importante). O
  contato é a página de pedidos (issues) do repositório; idade: menos de 12 anos só com responsável.
- Registro de erros (`app/registroDeErros.ts`, `POST /erros`, tabela `erros`): mensagem, onde, versão (o nome do
  index-XXXX.js) e o navegador resumido; sem nome, ID ou IP. Repetidos somam em `vezes`, apagados em 30 dias. Ler com
  `npx wrangler d1 execute xadrez-caotico --remote --command "SELECT vezes, mensagem, onde, versao, navegador FROM erros ORDER BY visto_em DESC LIMIT 20"`.
- Backup: `scripts/backup-do-banco.ps1`, agendado no Windows ("Xadrez Caotico - backup do banco", domingo 20h, ou ao
  ligar se perdeu a hora), exporta o banco de produção para a pasta XYZ da conta do Windows e guarda as 9 últimas
  cópias. Leva uns 7 minutos neste notebook.
- `.github/workflows/testes.yml` roda lint, build, o teste do servidor e os de tela a cada envio. O `deploy.yml` chama
  ele sem os de tela (`com_tela: false`) antes de publicar: os de tela dependem de tempo e às vezes falham no GitHub
  sem o jogo ter problema, e com o servidor já publicado o site não pode ficar esperando. Mexer em `.github/workflows`
  pede token com permissão de workflow no push (o atual tem).

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
- O notebook entra em suspensão (tampa, botão) mesmo com a bateria de testes rodando: o teste que estava no meio falha
  por tempo. Conferir os eventos de energia do Windows antes de investigar uma falha que demorou horas.
- O passeio da primeira vez não aparece pro navegador automático (`navigator.webdriver`), a não ser com
  `window.__comPasseio`: senão cobriria os botões de todos os testes.
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

## Blitz

- Contra a máquina, o "Novo jogo" tem o modo: normal (sem relógio) ou blitz, no ritmo 3+2 (o do Mundial da FIDE), 5+0
  ou 5+3, lembrados em `config.modo` e `config.ritmo`. A partida grava `relogio: { ritmo, w, b }` (o que resta a cada
  lado no último lance); sem ele não há relógio.
- `src/jogo/relogio.ts` (`RelogioDeXadrez`): corre o tempo de quem tem a vez; quem joga ganha o acréscimo, a partir do
  primeiro lance. Quem zera perde ("Você venceu (tempo)" / "A máquina venceu (tempo)"), a não ser que o outro lado não
  consiga dar mate por nenhuma sequência legal, nem com ajuda (FIDE 6.9, `semMaterialParaMate`): aí é empate.
- Adaptações iguais pros dois lados: o relógio para enquanto a peça anda e golpeia (`lancesEmAndamento`, como quem
  aperta o relógio ao soltar a peça), com o jogo escondido e fora da partida (no menu o tempo é gravado e volta no
  "Continuar"). A máquina com menos de 20 s não faz a pausa e pensa no máximo 1/30 do que resta.
- Quem desconta é o tabuleiro (`andarRelogioDaPartida`, também antes de cada lance: se zerou, o lance não sai); o
  `RelogioDaPartida.tsx`, no canto de cima, chama a cada 0,1 s e só desenha quando o que aparece muda.
- Entre pessoas (partida amistosa com ritmo, revanche no mesmo ritmo, e o adversário automático), o relógio mora na
  sala (`worker/src/sala.ts`): cada lance desconta o tempo de quem jogou e soma o acréscimo; um alarme do Durable Object
  acorda a sala quando o tempo de quem tem a vez acaba. O primeiro lance de cada um não gasta tempo, mas tem de sair em
  1 minuto. O servidor manda `relogio: { restante, desde, agora }` com cada lance e o aparelho soma o que passou desde
  que chegou (`mostradorDaSala`), sem depender do relógio do aparelho. `ACELERAR_RELOGIO` em `worker/.dev.vars` (só no
  simulador) faz o relógio andar 30 vezes mais depressa nos testes.
- Adversário automático (aba Amigos, `POST/GET /fila`, tabela `fila`): só blitz. O aparelho pergunta a cada 2,5 s; o
  par é reservado numa transação só (os dois lugares juntos) e a sala nasce antes de a fila mostrar o código. Quem
  bloqueou (ou foi bloqueado) não se encontra (tabela `bloqueios`); bloquear também desfaz a amizade e faz os convites
  responderem como se a pessoa não existisse. Denúncias (`POST /salas/:codigo/denunciar`, tabela `denuncias`, uma por
  pessoa em cada sala) se leem pelo wrangler. O id de ninguém sai do servidor: bloquear e denunciar vão pela sala.

## O golpe que pesa

A sensação de cada captura acompanha o peso dela: o valor da peça capturada e o peso da arma (`pesoDoGolpe`, de 0 a 1,
em `src/tabuleiro/sensacao/golpeQuePesa.ts`).

- **Congelamento no impacto (hitstop):** `sentirImpacto` congela por 40 a 130 ms os clipes das peças, a luta sem arma, a
  marreta e o puxão. Eles marcam o tempo em `agoraDoJogo()` (`sensacao/relogioDoJogo.ts`), que não anda congelado. A
  queda da vítima espera o congelamento (`depoisDoCongelamento`).
- **Tremor e vozes:** o tremor do tabuleiro e as vozes (o grunhido `voz:<peça>` e o gemido `dor:<peça>`, sintetizados
  em `sons.ts`) também saem de `sentirImpacto`. A marreta, o machado, a maça e o puxão têm o tremor deles.
- **Câmera, borda e ambiente:** `SensacaoDaPartida` (no ChessBoard3D) cuida disso:
  - a câmera chega perto da luta e volta (`vistaDaCamera.aproximarDaLuta`/`voltarDaLuta`); se a pessoa mexer, ela
    manda;
  - a borda escurece (`Vinheta.tsx`);
  - o vento e a música abaixam (`abafarAmbiente`);
  - nas trocas seguidas, cada captura soa um semitom acima (`andamento.capturasSeguidas`, `definirTomDosGolpes`).
- **Xeque no rei de quem joga:** a borda pulsa em vermelho, o ambiente abaixa e a câmera encosta no rei
  (`encostarNoRei`).
- **Blitz:** abaixo de 20 s, o coração bate (`RelogioDaPartida`); nos últimos 10 s, o tique sobe de tom.
- **Antecipação, continuação e inércia:** antes do golpe de perto, a peça recua um palmo e volta (`antecipar`); depois,
  dá um passo para trás (`continuarDoGolpe`). Andando, o tronco inclina e os braços ficam para trás, e ao parar o corpo
  passa do ponto e volta (`sensacao/inercia.ts`, uma mola). É a última pose do quadro, então é a primeira a ser
  desfeita: as poses saem na ordem contrária à que entraram.
- **Menos movimento** (Configurações, ou o sistema com movimento reduzido): sem câmera, sem tremor forte, sem borda
  pulsando, sem antecipação e sem inércia. O congelamento e as vozes ficam.
- **O que não foi feito:** o desfoque de fundo (precisaria de pós-processamento, pesado no celular).

## Promoção

- A peça nova nasce sem os equipamentos: `sincronizarPecas(false, casa)` monta só ela vestida `porParte` (cada
  equipamento numa malha própria, com `userData.parte`; nas outras peças não, por causa do desenho no celular), e
  `encaixarEquipamentos` (`tabuleiro/animacoes/promocao.ts`) faz cada um surgir em volta, voar até o osso em que se
  prende (`pecasDoEquipamento`, um pedaço por lado nos pares) e aparecer na peça ao chegar (som `encaixe`). O cajado de
  sempre, que vem no modelo, sai da mão já no clarão (`esconderPartes` com o tipo) e volta quando a cópia chegar
  (`cajadoQueVoa`): escondido só no começo do voo, ele aparecia na descida.
- Pedido do usuário: a peça só fica completa no fim, quando o último equipamento se encaixa. Por isso, quando a luz
  começa, o que o peão veste (as malhas `vestimenta:*` e a katana) acende e some nela (`desfazerEquipamentos`, com
  cópias dos materiais), e ele sobe sem nada.
- No cavalo, o peão continua peão (`peaoCavaleiro`, sem a katana) e recebe o equipamento do cavaleiro; o cavalo da
  casa chega sem ninguém (`esconderCavaleiro`) a galope, de fora do tabuleiro, numa curva até a casa, recebe a
  montaria e o peão monta (`montarNoCavalo`): pé no estribo e mãos na sela, impulso, a perna direita passa por cima da
  garupa, senta. Os pontos saem dos ossos do cavaleiro escondido; no fim ele volta e o peão sai, e o cavalo vira pro
  inimigo. A pose vai por cima do clipe com `animacoes/posturas.ts`, como a luta sem arma.
- O foco da ascensão (pedido do usuário): a câmera fecha na peça (`vista.focarNaPeca`, 95% do caminho e 40% da distância,
  na altura do corpo), a borda escurece e o ambiente abaixa (`sensacao.focarNaAscensao`). No clarão, a peça nova vira de
  frente pra câmera (`virarSuave` até `rumoDaCamera`), com linhas de foco e faísca, e recebe os equipamentos olhando pra
  quem joga, cada encaixe com uma faísca. No fim, a pose (`ascensao:pose`, brilho e linhas de foco), o foco solto e a
  peça volta a olhar pro rumo dela. No cavalo, a pose vem antes de o cavalo chegar. Fotos:
  `SO=ascensao node testes/fotos-armas.mjs`.

## Câmera

- O enquadramento da luta (pedido do usuário: o golpe inteiro tem de aparecer sem a pessoa mexer na câmera). Antes a
  câmera só chegava um pouco mais perto do mesmo lado, e a habilidade ficava atrás de outras peças ou fora da tela.
  Agora o lance passa a área do golpe (`areaDaLuta`, em `sensacao/golpeQuePesa.ts`):
  - as duas peças do chão ao alto, com quem bate de perto já parado na frente da vítima;
  - onde a vítima cai, quando o golpe a joga;
  - o alto da hélice, no Puxão.

  `vista.enquadrarLuta` testa pontos de vista em volta (de lado pra linha da luta, girando 0,35 e 0,7 rad pros dois
  lados, de 30 a 66 graus de altura) e fica com o que olha mais de lado (uma peça não tampa a outra), com menos peças no
  caminho e girando menos a câmera, na menor distância em que todos os pontos cabem no miolo da tela (`FOLGA_DA_LUTA`),
  nunca mais perto que `DISTANCIA_MINIMA_DA_LUTA` (5,2): de perto demais o golpe ficava cortado e sem o tabuleiro em volta
  (pedido do usuário). As peças que
  ainda ficam no caminho esmaecem até a luta acabar (`cena/esmaecer.ts`, cópias dos materiais). Vale ver só as duas
  peças. A volta devolve o giro, a altura e o zoom de antes. Fotos da vista de jogo de sempre:
  `SO=enquadra-puxao,enquadra-retalho,enquadra-torre,enquadra-bispo node testes/fotos-armas.mjs` (`camera: null`).
- A câmera chega junto com quem ataca (pedido do usuário). Quem vai até a vítima sai de longe: a câmera escolhe o ponto
  de vista contando o lugar de onde a peça sai, começa mostrando o caminho todo e vai fechando no golpe conforme ela
  chega perto (`comeco` em `areaDaLuta`, com o quanto do caminho já andou; `acompanhar` na aproximação). Parada a
  peça, o enquadramento é o do golpe. O cavalo de lança para mais longe (`parada`), e no Empurrão a área inclui a
  barreira em volta da rainha e o começo do voo pra fora do tabuleiro (`praFora`).
- A tela inicial e a partida nova olham sempre pro meio do tabuleiro (`CENTRO` em `vistaDaCamera.ts`): o giro da câmera
  leva o centro de volta. Antes o centro ficava preso perto da última luta quando a pessoa encostava na câmera no meio
  da aproximação (no celular, todo toque conta), e o tabuleiro aparecia torto até na tela inicial (bug visto pelo
  usuário). Pegando a câmera no meio da luta, o centro desliza de volta (`recentrar`) sem mexer no giro nem no zoom.
  `testar-golpe-que-pesa` confere os dois.

## Tela de partida

- Não há tela normal: o jogo ocupa sempre a página inteira. A tela cheia do navegador não é mais pedida: o Chrome do
  celular mostra embaixo, cada vez que ela entra, "Para sair da tela cheia, arraste…", e nenhuma página tira esse
  aviso; o usuário pediu a parte de baixo limpa. Instalado, o jogo abre sem barras (`display: fullscreen` no manifest;
  no iPhone vale como `standalone`). A situação da partida, o convite esperando o amigo, o pedido de empate e a revanche
  ficam embaixo; o menu no canto de cima. Não há botão de som na partida (fica nas Configurações).
- O fim da partida aparece no centro (`ResultadoDaPartida.tsx`): na vitória, uma taça 3D com renderizador próprio, na
  resolução da tela e transparente, pra não depender da qualidade do tabuleiro.
- A aba de lances (`PainelDeLances.tsx`) é uma lingueta na borda direita, com uma coluna pra cada lado.

## Qualidade

- A média é o padrão; no aparelho fraco (`navigator.deviceMemory` até 4, o celular de 4 GB), a baixa. A configuração
  inteira é gravada na primeira vez, então a alta de antes estava gravada até em quem nunca escolheu: a qualidade
  gravada só vale com `qualidadeEscolhida`, marcado quando a pessoa escolhe.
- Baixa: até 1,35 vez a tela no celular e a própria tela no computador (teto de 1,3 milhão de pixels), sem sombras, sem
  antisserrilhado, filtro de textura 4 (`filtroLeve`) e no máximo 30 quadros por segundo. Antes era 0,8 × até 1,25: no
  celular de tela densa a imagem era esticada 2 a 3 vezes e ficava embaçada (visto pelo usuário, 25/11). A resolução é
  dinâmica (`medirQuadro` no ChessBoard3D): abaixo de ~24 quadros por segundo desce 10% (até 70%) e, com folga por 3
  janelas seguidas, sobe. Mexe só no `setPixelRatio`, nunca no `onResize` da vista, que reenquadra a câmera. Média: até
  1,6 vez a tela, nunca abaixo dela, sombras de 1024. Alta: como sempre, no mínimo Full HD e sombras de 2048. O
  antisserrilhado e o filtro de textura só mudam ao abrir o jogo de novo.
- A Loja, a vitrine e a taça seguem a qualidade gravada (`desenhoDosPaineis`). Os testes forçam a baixa, e por isso
  gravam `qualidadeEscolhida: true` junto.
- A Loja e a Personalização desenham pelo `ritmoDoPainel`: nada escondidas (a Loja fica montada durante a prévia) e no
  máximo 30 por segundo na baixa. Enquanto um painel desenha (`painelDesenhando`), o tabuleiro de fundo vai a 20 quadros
  por segundo e a resolução dinâmica não mede.
- `node testes/simular-celular-fraco.mjs` (com o site no ar) emula o celular de 4 GB (tela 360×800 a 2x, processador
  4 vezes mais lento, `LENTIDAO=` muda): a qualidade de partida, capturas com habilidades, a memória ao longo das
  partidas, a placa de vídeo perdida e devolvida, a aba congelada no meio do Puxão e a Loja por cima.

## Livro de aberturas

`public/chess/livro.json` (34.765 posições) sai de `games.pgn` (1000 partidas) por
`scripts/compilar-livro-xadrez.mjs`. O gerador usa Stockfish, que não fica no projeto. `?!` no PGN marca lance
fraco: a máquina responde a ele, mas nunca o joga.

## Som

Tudo sintetizado em `src/som/sons.ts`, sem arquivos de áudio. Foi medido, nunca ouvido: o ruído é sorteado e o
pico oscila, então deixe folga abaixo de 1,0.

- A saída (`cadeiaDeSaida`): efeitos (×1,5) e ambiente (×1,6) → volume escolhido (padrão 0,8) → limitador a -12 dB
  (ataque de 1 ms, senão o raio passava) → ×1,12. Ficou uns 11 dB acima do de antes, a pedido do usuário.
  `node testes/medir-som.mjs` renderiza cada som fora da tela por essa mesma cadeia, no volume máximo, sozinho e em
  grupo, e falha se algum pico passar de 0,98. Som novo ou reforço novo: rodar ele.
