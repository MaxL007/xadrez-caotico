import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Chess, type Square } from 'chess.js'
import { Button } from '../telas/ui/Basics'
import { useFecharComEsc } from '../app/teclaEsc'
import { buscarNoLivro, carregarLivroDeAberturas, type LivroDeAberturas } from '../jogo/pgnBook'
import { type Dificuldade, DIFICULDADES, escolherJogadaDaMaquina, maquinaAceitaEmpate, usaLivro } from '../jogo/engine'
import { contarPartidas, PREMIO_DA_VITORIA } from '../conta/conquistas'
import { type FimDaPartida, ResultadoDaPartida } from './ResultadoDaPartida'
import { PainelDeLances } from './PainelDeLances'
import { afundarPelaGravidade, convocarCristal, cortarAoMeio, despedacar, rachadurasNoTabuleiro, rastroDeCorte, soltarOCavalo, tornadoDaLua, tremerTabuleiro } from './combate/efeitosDasArmas'
import { atualizarLutas, desfazerPosesDasLutas, distanciaDaLuta, forcarGolpeSemArma, type GolpeSemArma, lutarSemArma, sortearGolpeSemArma } from './combate/lutaSemArma'
import { ambienteDoTabuleiro, ambienteTocando, configurarSom, destravarSom, somDestravado, tocarSom } from '../som/sons'
import { type QualidadeXadrez, useConfigXadrez } from '../jogo/configXadrez'
import { type ChaveTexto, tradutor, type Traduzir } from '../textos/idiomas'
import { MenuXadrez } from '../telas/MenuXadrez'
import { listPartidas, novaPartida, type PartidaXadrez, salvarPartida } from '../dados/xadrezRepo'
import { ouvirDados } from '../dados/db'
import { entrarEmSala, pedirRevanche, recusarSala, sessaoAtual, useSessao } from '../dados/servidor'
import { abrirConexaoDaSala, type ConexaoDaSala, type EstadoDaSala, type LanceDaSala, type ResultadoDaSala } from '../dados/salaAoVivo'
import { registrarAprendizadoDaPartida, type ResultadoPartida as ResultadoPartidaXadrez } from '../dados/xadrezAprendizadoRepo'
import { carregarPersonalizacao, ouvirPersonalizacao, personalizacaoAtual, type Peca } from '../conta/personalizacao'
import { animarAscensao, animarPetalas } from './animacoes/cerimonias'
import { cavaloChegaEMontam, daMontaria, doCavaleiro, encaixarEquipamentos, esconderPartes, partesVestidas, peaoCavaleiro } from './animacoes/promocao'
import { atualizarPosturas, desfazerPosturas } from './animacoes/posturas'
import { animarComemoracao, animarGestoAmigavel, animarRecusa, atualizarGestoRPG, POOL_GESTOS, voltarAoDescanso } from './animacoes/gestos'
import { animarPosicao, animarPosicaoRPG, deslocarRPG, diferencaAngular, pararRPG, pecaSaltaRPG, rumoDeDescanso, rumoEntre, virarRPG } from './animacoes/movimento'
import { animarQuedaEDesaparecimento, arremessarPeca, prepararParaSumir } from './animacoes/queda'
import { COR_DESTINO, COR_SELECIONADA, COR_XEQUE, criarTexturaMadeira, criarTexturaTexto, definirLadoDaCamera, ehCelular, ladoDaCamera, LETRAS_COLUNAS, materialMadeira, MEIA_LARGURA_TABULEIRO, squareToPos, squareToPosPeca } from './casas'
import { ALCANCE_GOLPE, animarAtaqueEspada, animarImpacto, CHANCE_HONRA_SAMURAI, DISTANCIA_REVERENCIA, type EstiloAtaque } from './combate/golpes'
import { alcanceDaMaca, ARMAS_DA_TORRE, atualizarMarretadas, baterComMarreta, cairDaMaca, esmagarPeca, MACA_ERGUIDA_ATE_MS, MARRETA_PANCADA_MS, marretadas, ondaDaMarretada, pancadaNoPeito, poeiraDaPancada, prenderPeloPeito, soltarDaMaca } from './combate/marreta'
import { lancarOndaDoRei, lancarPoderDoBispo, lancarRaioDaDama } from './combate/poderes'
import { materiaisDaPeca, materiaisPorFaccao, materialCoroa } from './pecas/materiais'
import { clipesRPGComPrefixo, type EspadaRPG, garantirModelosRPG, guardarEspadaRPG, modelosRPG, mostrarEspadaRPG, novaSequenciaRPG, sacarEspadaRPG, sequenciaRPGValida, tocarClipeRPGUmaVez, tocarGolpeRPG } from './pecas/modelosRPG'
import { buildPieceMesh } from './pecas/montarPeca'
import { armaDoPeaoNoTabuleiro, assinaturaDaVestimenta, definirVestimenta, vestimenta } from './pecas/vestimenta'
import { montarExpositor, montarVitrine } from './pecas/vitrine'

/** Só nos testes: veste as peças de quem joga sem passar pela conta (as habilidades também). */
let vestimentaDeTeste: Record<string, Record<string, string>> | null = null

const LARGURA_FULL_HD = 1920
const ALTURA_FULL_HD = 1080

/** Meia-volta do tabuleiro ao escolher a cor das peças. */
const GIRO_CAMERA_MS = 1400
/** Pausa "pensando" da máquina antes de mover, pro ritmo geral ficar mais compassado. */
const PAUSA_MAQUINA_MS = 700
/** Com o lance no livro não há o que calcular: só o suficiente pra resposta não vir no mesmo instante. */
const PAUSA_MAQUINA_LIVRO_MS = 200
interface Qualidade {
  /** Quantos pixels de desenho por pixel da tela, pro tamanho do tabuleiro na tela. */
  resolucao: (largura: number, altura: number) => number
  /** Tamanho do mapa de sombras; 0, sem sombras. */
  sombras: number
  /** Teto de quadros por segundo; 0, o que a tela der. */
  quadrosPorSegundo: number
  /** Antisserrilhado e o filtro que deixa a madeira nítida de longe. Valem ao abrir o jogo. */
  acabamento: boolean
}

/** O que cada qualidade do jogo muda. */
const QUALIDADES: Record<QualidadeXadrez, Qualidade> = {
  // a leve, pra celular e computador fracos: abaixo da resolução da tela, sem sombras, sem antisserrilhado e a 30
  // quadros por segundo. A imagem fica mais simples, mas o aparelho aguenta
  baixa: { resolucao: () => Math.min(window.devicePixelRatio || 1, 1.25) * 0.8, sombras: 0, quadrosPorSegundo: 30, acabamento: false },
  // o padrão: até 1,6 vez a tela (no celular, que tem tela densa, bem menos que Full HD), com sombras médias e nunca
  // abaixo da resolução da tela no computador
  media: {
    resolucao: (largura, altura) => Math.max(Math.min(window.devicePixelRatio || 1, 1), Math.min(pixelRatioParaFullHD(largura, altura), 2) * 0.8),
    sombras: 1024,
    quadrosPorSegundo: 0,
    acabamento: true,
  },
  // a mais bonita, como sempre foi: no mínimo Full HD, com as sombras grandes
  alta: { resolucao: (largura, altura) => pixelRatioParaFullHD(largura, altura), sombras: 2048, quadrosPorSegundo: 0, acabamento: true },
}
/** Vista de lado do menu: mais baixa e mais perto que a do jogo, pra ver as peças de frente. */
const RAIO_CAMERA_MENU = 11.5
const INCLINACAO_CAMERA_MENU = 1.12

/** Calcula o pixel ratio necessário pra garantir que o canvas renderize em pelo menos Full HD (1920x1080), mesmo quando o card exibido na tela é menor — limitado a 3x pra não sobrecarregar a GPU em telas muito pequenas. */
function pixelRatioParaFullHD(larguraCss: number, alturaCss: number): number {
  const dpr = window.devicePixelRatio || 1
  const fatorParaFullHD = Math.max(LARGURA_FULL_HD / Math.max(larguraCss, 1), ALTURA_FULL_HD / Math.max(alturaCss, 1))
  return Math.min(Math.max(dpr, fatorParaFullHD), 3)
}

type PecaPromocao = 'q' | 'r' | 'b' | 'n'
const PECAS_PROMOCAO: { peca: PecaPromocao; nome: ChaveTexto; branca: string; preta: string }[] = [
  { peca: 'q', nome: 'promocao.rainha', branca: '♕', preta: '♛' },
  { peca: 'r', nome: 'promocao.torre', branca: '♖', preta: '♜' },
  { peca: 'b', nome: 'promocao.bispo', branca: '♗', preta: '♝' },
  { peca: 'n', nome: 'promocao.cavalo', branca: '♘', preta: '♞' },
]

/** Desistir da partida — pede confirmação no próprio botão (funciona também na tela cheia do
 * navegador, onde as janelas de diálogo do site não aparecem). */
function BotaoDesistir({
  t,
  confirmando,
  onPedir,
  onConfirmar,
  sobreTabuleiro = false,
}: {
  t: Traduzir
  confirmando: boolean
  onPedir: (v: boolean) => void
  onConfirmar: () => void
  sobreTabuleiro?: boolean
}) {
  const base = sobreTabuleiro ? 'rounded-lg px-3 py-1.5 text-sm font-semibold shadow' : 'rounded-lg px-3 py-2 text-sm font-medium transition'
  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => onPedir(true)}
        className={`${base} ${sobreTabuleiro ? 'bg-white/90 text-rose-700' : 'border border-rose-300 text-rose-700 hover:bg-rose-50'}`}
      >
        {t('desistir.botao')}
      </button>
    )
  }
  return (
    <span role="group" aria-label={t('desistir.pergunta')} className={`inline-flex items-center gap-1.5 ${sobreTabuleiro ? 'rounded-lg bg-white/90 px-2 py-1 shadow' : ''}`}>
      <span className={`text-sm ${sobreTabuleiro ? 'text-[#3a2a1a]' : 'text-ink-700'}`}>{t('desistir.pergunta')}</span>
      <button type="button" onClick={onConfirmar} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500">
        {t('desistir.sim')}
      </button>
      <button
        type="button"
        onClick={() => onPedir(false)}
        className={`rounded-lg px-2 py-1.5 text-sm font-medium ${sobreTabuleiro ? 'text-[#3a2a1a]' : 'text-ink-600 hover:bg-ink-100'}`}
      >
        {t('desistir.nao')}
      </button>
    </span>
  )
}

/** Pedir empate: à máquina, que pensa um instante e responde, ou ao adversário, que aceita ou recusa. */
function BotaoEmpate({ t, onPedir, sobreTabuleiro = false }: { t: Traduzir; onPedir: () => void; sobreTabuleiro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPedir}
      className={sobreTabuleiro ? 'rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow' : 'rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50'}
      data-pedir-empate
    >
      {t('empate.botao')}
    </button>
  )
}

/** Como fica gravada a partida contra a máquina que terminou em empate combinado. */
const EMPATE_POR_ACORDO = 'Empate por acordo'

/** O pedido de empate na tela: a máquina pensando, a recusa, o pedido enviado ao amigo ou o pedido dele. */
type EstadoDoEmpate = { tipo: 'pensando' } | { tipo: 'recusado'; por: 'maquina' | 'adversario' } | { tipo: 'enviado' } | { tipo: 'recebido' } | null

export function ChessBoard3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chessRef = useRef(new Chess())
  const livroRef = useRef<LivroDeAberturas>(new Map())
  const partidaAtualRef = useRef<PartidaXadrez | null>(null)
  const corHumanoRef = useRef<'w' | 'b'>('w')
  const acoesRef = useRef<{
    carregarPgn: (pgn: string, corHumano: 'w' | 'b') => void
    mostrarMenu: () => void
    desistir: () => void
    pedirEmpate: () => void
    atualizarTextos: () => void
    aplicarQualidade: (qualidade: QualidadeXadrez) => void
    aplicarTelaMovel: () => void
    /** A personalização mudou: refaz só as peças cuja roupa mudou. */
    revestir: () => void
    carregarSala: () => void
    receberEstadoDaSala: (estado: EstadoDaSala) => void
    receberLanceDaSala: (lance: LanceDaSala) => void
    receberFimDaSala: (resultado: ResultadoDaSala, motivo: string) => void
  } | null>(null)

  const [config, mudarConfig] = useConfigXadrez()
  // o tabuleiro lê as configurações e os textos fora do React, nas animações
  const configRef = useRef(config)
  configRef.current = config
  const t = useMemo(() => tradutor(config.idioma), [config.idioma])
  const tRef = useRef(t)
  tRef.current = t
  const sessao = useSessao()
  const jogador = sessao?.usuario.nome ?? t('conta.convidado')
  // partida contra outra pessoa: a conexão ao vivo e o que o servidor disse por último. Sem ela, a
  // partida é contra a máquina
  const salaRef = useRef<{ conexao: ConexaoDaSala; estado: EstadoDaSala | null } | null>(null)
  const [sala, setSala] = useState<EstadoDaSala | null>(null)
  const [conectadoNaSala, setConectadoNaSala] = useState(true)
  // o amigo pediu outra partida enquanto esta está na tela; `vencida` quando o convite já não vale
  const [revanche, setRevanche] = useState<{ codigo: string; vencida: boolean } | null>(null)
  const [revancheFalhou, setRevancheFalhou] = useState(false)
  // a tela inicial por cima do tabuleiro, ou a partida
  const [tela, setTela] = useState<'menu' | 'jogo'>('menu')
  const [statusTexto, setStatusTexto] = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [partidasEmAndamento, setPartidasEmAndamento] = useState<PartidaXadrez[]>([])
  const [partidasFinalizadas, setPartidasFinalizadas] = useState<PartidaXadrez[]>([])
  // true quando ainda não há partida em andamento e o jogador precisa escolher a cor antes de
  // começar (tanto na primeira vez quanto em "Novo jogo")
  const [escolhendoCor, setEscolhendoCor] = useState(false)
  useEffect(() => {
    configurarSom({ ligado: config.som, ambiente: config.ambiente, volume: config.volume })
  }, [config.som, config.ambiente, config.volume])
  useEffect(() => acoesRef.current?.atualizarTextos(), [config.idioma])
  useEffect(() => acoesRef.current?.aplicarQualidade(config.qualidade), [config.qualidade])
  useEffect(() => acoesRef.current?.aplicarTelaMovel(), [config.telaMovel])
  // o navegador só libera som depois de um gesto: quem chegou clicando no menu já fez o seu
  useEffect(() => {
    if (navigator.userActivation?.hasBeenActive) destravarSom()
    window.addEventListener('pointerdown', destravarSom)
    window.addEventListener('keydown', destravarSom)
    const desligarAmbiente = ambienteDoTabuleiro()
    return () => {
      window.removeEventListener('pointerdown', destravarSom)
      window.removeEventListener('keydown', destravarSom)
      desligarAmbiente()
    }
  }, [])
  // cor do peão que está promovendo, enquanto a pessoa escolhe a peça
  const [promocaoPendente, setPromocaoPendente] = useState<'w' | 'b' | null>(null)
  const resolverPromocaoRef = useRef<((peca: PecaPromocao | null) => void) | null>(null)
  useFecharComEsc(() => resolverPromocaoRef.current?.(null), promocaoPendente !== null)
  const [resultadoOverlay, setResultadoOverlay] = useState<FimDaPartida | null>(null)
  // partida do jogador em andamento (dá pra desistir) — atualizado a cada lance
  const [podeDesistir, setPodeDesistir] = useState(false)
  // dá pra pedir empate: partida em andamento, um pedido por lance, e contra a máquina só na sua vez
  const [podeEmpatar, setPodeEmpatar] = useState(false)
  const [empate, setEmpate] = useState<EstadoDoEmpate>(null)
  // a recusa some sozinha depois de um tempo
  useEffect(() => {
    if (empate?.tipo !== 'recusado') return
    const prazo = window.setTimeout(() => setEmpate(null), 6000)
    return () => window.clearTimeout(prazo)
  }, [empate])
  // a cor de quem joga, pra aba de lances dizer quem fez cada lance
  const [corDoJogador, setCorDoJogador] = useState<'w' | 'b'>('w')
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false)
  // tabuleiro ocupando a tela toda (e a tela cheia do navegador, se der)
  // a tela inicial sempre ocupa a página inteira
  const ocupaATela = true
  // as conquistas contam as partidas contra a máquina, terminadas ou não; as com amigos ficam de fora
  const partidasContraMaquina = useMemo(() => [...partidasEmAndamento, ...partidasFinalizadas], [partidasEmAndamento, partidasFinalizadas])
  const tabuleiroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    carregarLivroDeAberturas().then((livro) => {
      livroRef.current = livro
    })
  }, [])

  // a partida em andamento fica à espera do botão "Continuar partida" da tela inicial
  const atualizarListaDePartidas = useCallback(() => {
    listPartidas()
      .then((partidas) => {
        setPartidasEmAndamento(partidas.filter((p) => p.status === 'EM_ANDAMENTO'))
        setPartidasFinalizadas(partidas.filter((p) => p.status === 'FINALIZADA'))
      })
      .catch(() => {
        // a tela inicial abre do mesmo jeito, só sem o "Continuar partida"
      })
  }, [])

  useEffect(() => {
    atualizarListaDePartidas()
    return ouvirDados(atualizarListaDePartidas)
  }, [atualizarListaDePartidas])

  useEffect(() => () => salaRef.current?.conexao.fechar(), [])
  // as peças de quem joga vestem o que a pessoa escolheu: a escolha vem da conta e muda pela aba Personalização
  useEffect(() => ouvirPersonalizacao(() => acoesRef.current?.revestir()), [])
  useEffect(() => {
    void carregarPersonalizacao()
  }, [sessao?.token])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const selecionadaRef: { current: Square | null } = { current: null }
    const destinosRef: { current: Square[] } = { current: [] }
    const vezDaMaquinaRef: { current: boolean } = { current: false }
    const pieceMeshBySquare = new Map<string, THREE.Group>()
    // "geração" do tabuleiro: muda a cada tabuleiro novo (outra partida, novo jogo, volta pro menu).
    // Lances e animações que começaram numa geração antiga não mexem mais em nada — antes,
    // começar um jogo no meio da animação de um lance deixava a animação velha terminar por cima do
    // tabuleiro novo (peça sumida, fora da casa, ou a peça errada reaproveitada)
    let geracao = 0
    // lances com animação ainda rodando (os testes esperam zerar)
    let lancesEmAndamento = 0
    // lances do adversário que chegaram enquanto outra peça ainda andava
    let filaDaSala: string[] = []
    let animandoDaSala = false
    function novoTabuleiro() {
      resolverPromocaoRef.current?.(null)
      geracao++
      lancesEmAndamento = 0
      filaDaSala = []
      animandoDaSala = false
      ultimoPedidoDeEmpate = -1
      setEmpate(null)
    }
    // pra não disparar a comemoração de novo enquanto o xeque-mate continuar sendo a posição atual
    let comemoracaoDisparada = false
    // em que lance quem joga pediu empate pela última vez: um pedido por lance
    let ultimoPedidoDeEmpate = -1

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e6)
    // "far" bem além do maxDistance do controle de órbita (20) — antes os dois coincidiam, então
    // no zoom mais distante o tabuleiro chegava a ficar 100% da cor da névoa (basicamente
    // invisível); agora ele só vai desbotando um pouco, nunca sumindo, não importa a distância
    scene.fog = new THREE.Fog(0xf5f0e6, 11, 55)

    // câmera mais afastada e com FOV mais fechado que o normal — bem próxima e com campo de visão
    // largo deixava o tabuleiro com uma perspectiva exagerada, quase "olhando de raspão"
    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
    definirLadoDaCamera(1)
    camera.position.set(0, 9.5, 10)
    camera.lookAt(0, 0, 0)

    // o antisserrilhado só se escolhe ao criar o desenho: quem troca de ou pra baixa vê a diferença ao abrir o jogo de novo
    const qualidadeDeInicio = QUALIDADES[configRef.current.qualidade]
    const renderer = new THREE.WebGLRenderer({ antialias: qualidadeDeInicio.acabamento, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight, false)
    // o desenho sempre preenche o espaço dele (CSS): com largura fixa em pixels ele impedia o espaço de
    // encolher (abrir o menu, sair da tela cheia) e o tabuleiro ficava descentralizado/cortado — só a
    // resolução interna acompanha o tamanho (onResize)
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
    renderer.setPixelRatio(qualidadeDeInicio.resolucao(container.clientWidth, container.clientHeight))
    renderer.shadowMap.enabled = true
    // o machado e a gravidade recortam a peça (metade de cima, o que já entrou no chão)
    renderer.localClippingEnabled = true
    // sombras suaves de verdade (borda esfumada, como a de uma luz real), em alta resolução
    renderer.shadowMap.type = THREE.VSMShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // visual "HD": tons cinematográficos (ACES), que seguram o brilho do metal e do verniz sem
    // estourar o branco
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)
    const anisotropia = qualidadeDeInicio.acabamento ? renderer.capabilities.getMaxAnisotropy() : 1

    // reflexo de ambiente (um "estúdio" gerado na hora, sem imagem externa): é o que faz o metal das
    // armaduras, o ouro das coroas e o verniz do tabuleiro brilharem de verdade
    let reflexo: THREE.WebGLRenderTarget | null = null
    function gerarReflexoDoAmbiente() {
      const gerador = new THREE.PMREMGenerator(renderer)
      reflexo?.dispose()
      reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
      scene.environment = reflexo.texture
      gerador.dispose()
    }
    gerarReflexoDoAmbiente()
    scene.environmentIntensity = 0.55
    // a placa de vídeo devolveu o contexto (aba voltou do segundo plano): o three.js reenvia as texturas
    // sozinho, mas o reflexo é desenhado na própria placa e precisa ser feito de novo
    renderer.domElement.addEventListener('webglcontextrestored', gerarReflexoDoAmbiente)

    const controls = new OrbitControls(camera, renderer.domElement)
    // o alvo fica na altura do corpo das peças (torso), não no chão do tabuleiro — senão o zoom
    // aproxima em direção a um ponto na casca do tabuleiro, e a peça (que tem altura) acaba saindo
    // por cima da tela bem antes da câmera "chegar" nela. Com o alvo na altura das peças, dá pra
    // aproximar de verdade até ficar cara a cara com uma peça, em vez de mergulhar no tabuleiro.
    controls.target.set(0, 0.4, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 2.2
    controls.maxDistance = 20
    controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.enabled = false
    const INCLINACAO_CAMERA_JOGO = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi

    // luz principal (com sombra suave), luz de preenchimento do lado oposto e uma luz de contorno
    // por trás, que destaca a silhueta das peças contra o fundo
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.3))
    const dirLight = new THREE.DirectionalLight(0xfff1dc, 2.4)
    dirLight.position.set(4, 10, 6)
    dirLight.castShadow = qualidadeDeInicio.sombras > 0
    dirLight.shadow.mapSize.setScalar(qualidadeDeInicio.sombras || 1024)
    dirLight.shadow.camera.left = -6.5
    dirLight.shadow.camera.right = 6.5
    dirLight.shadow.camera.top = 6.5
    dirLight.shadow.camera.bottom = -6.5
    dirLight.shadow.camera.near = 1
    dirLight.shadow.camera.far = 30
    dirLight.shadow.radius = 5
    dirLight.shadow.blurSamples = 12
    dirLight.shadow.bias = -0.0004
    dirLight.shadow.normalBias = 0.02
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.45)
    fillLight.position.set(-5, 6, -4)
    scene.add(fillLight)
    const luzContorno = new THREE.DirectionalLight(0xffe2b8, 0.7)
    luzContorno.position.set(0, 5, -9)
    scene.add(luzContorno)

    // madeiras: bordo claro (casas claras), nogueira (casas escuras), nogueira escura (moldura) e
    // a mesa embaixo
    const madeiraClara = criarTexturaMadeira([226, 201, 160], [190, 150, 102], 1.7)
    const madeiraEscura = criarTexturaMadeira([104, 62, 36], [58, 31, 16], 4.3)
    const madeiraMoldura = criarTexturaMadeira([70, 40, 22], [36, 19, 9], 7.9, 10)
    const madeiraMesa = criarTexturaMadeira([60, 40, 28], [40, 26, 18], 2.2, 34)

    // mesa embaixo do tabuleiro, recebendo a sombra dele e sumindo no fundo com a névoa
    madeiraMesa.repeat.set(6, 6)
    madeiraMesa.anisotropy = anisotropia
    const mesa = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: madeiraMesa, roughness: 0.7, metalness: 0 }),
    )
    mesa.rotation.x = -Math.PI / 2
    mesa.position.y = -0.36
    mesa.receiveShadow = true
    scene.add(mesa)

    // moldura: bloco de nogueira com quinas arredondadas embaixo das casas (aparece nos frisos entre
    // elas) e uma borda levemente elevada em volta, com um filete dourado na beira de dentro
    const materialMoldura = materialMadeira(madeiraMoldura, anisotropia)
    const base = new THREE.Mesh(new RoundedBoxGeometry(9.4, 0.34, 9.4, 4, 0.06), materialMoldura)
    base.position.y = -0.19
    base.receiveShadow = true
    base.castShadow = true
    scene.add(base)
    const bordaGeo = new RoundedBoxGeometry(9.4, 0.06, 0.7, 3, 0.02)
    const bordaLadoGeo = new RoundedBoxGeometry(0.7, 0.06, 8.0, 3, 0.02)
    const bordas: [THREE.BufferGeometry, number, number][] = [
      [bordaGeo, 0, 4.35],
      [bordaGeo, 0, -4.35],
      [bordaLadoGeo, 4.35, 0],
      [bordaLadoGeo, -4.35, 0],
    ]
    for (const [geo, x, z] of bordas) {
      const borda = new THREE.Mesh(geo, materialMoldura)
      borda.position.set(x, 0.01, z)
      borda.receiveShadow = true
      borda.castShadow = true
      scene.add(borda)
    }
    const materialFilete = new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 1, roughness: 0.25 })
    const fileteGeo = new THREE.BoxGeometry(8.06, 0.012, 0.03)
    for (let lado = 0; lado < 4; lado++) {
      const filete = new THREE.Mesh(fileteGeo, materialFilete)
      const angulo = (lado * Math.PI) / 2
      filete.rotation.y = angulo
      filete.position.set(Math.sin(angulo) * 4.03, 0.042, Math.cos(angulo) * 4.03)
      scene.add(filete)
    }

    // casas: madeira de verdade com verniz e quinas levemente arredondadas — entre uma casa e outra
    // fica um friso fino, como num tabuleiro de marchetaria. Cada casa usa um pedaço diferente da
    // textura (e metade delas com o veio girado), pra não parecerem carimbadas.
    const boardGroup = new THREE.Group()
    const squareMeshes: THREE.Mesh[] = []
    const squareGeo = new RoundedBoxGeometry(0.985, 0.1, 0.985, 3, 0.012)
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const square = `${String.fromCharCode(97 + f)}${r + 1}`
        const clara = (f + r) % 2 === 1
        const mat = materialMadeira(clara ? madeiraClara : madeiraEscura, anisotropia, {
          x: Math.random(),
          y: Math.random(),
          giro: (f + r) % 4 < 2 ? 0 : Math.PI / 2,
        })
        const mesh = new THREE.Mesh(squareGeo, mat)
        const { x, z } = squareToPos(square)
        mesh.position.set(x, -0.05, z)
        mesh.receiveShadow = true
        mesh.userData.square = square
        boardGroup.add(mesh)
        squareMeshes.push(mesh)
      }
    }
    scene.add(boardGroup)

    // coordenadas padrão do xadrez — colunas a-h na borda de trás (lado das brancas) e linhas 1-8
    // na borda esquerda, gravadas em dourado na moldura
    const labelsGroup = new THREE.Group()
    const labelGeo = new THREE.PlaneGeometry(0.36, 0.36)
    for (let f = 0; f < 8; f++) {
      const textura = criarTexturaTexto(LETRAS_COLUNAS[f])
      textura.anisotropy = anisotropia
      const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { x } = squareToPos(`${LETRAS_COLUNAS[f]}1`)
      mesh.position.set(x, 0.045, 4.35)
      labelsGroup.add(mesh)
    }
    for (let r = 0; r < 8; r++) {
      const textura = criarTexturaTexto(String(r + 1))
      textura.anisotropy = anisotropia
      const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { z } = squareToPos(`a${r + 1}`)
      mesh.position.set(-4.35, 0.045, z)
      labelsGroup.add(mesh)
    }
    scene.add(labelsGroup)

    const piecesGroup = new THREE.Group()
    scene.add(piecesGroup)
    const highlightGroup = new THREE.Group()
    scene.add(highlightGroup)

    // casa do Rei em xeque: vermelha (pulsando de leve), por cima da madeira e por baixo dos destaques
    // de seleção — fica até o xeque acabar
    const xequeMat = new THREE.MeshBasicMaterial({ color: COR_XEQUE, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
    const xequeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.97), xequeMat)
    xequeMesh.rotation.x = -Math.PI / 2
    xequeMesh.visible = false
    scene.add(xequeMesh)
    function marcarXeque() {
      const chess = chessRef.current
      const rei = chess.isCheck() ? chess.board().flat().find((c) => c && c.type === 'k' && c.color === chess.turn()) : undefined
      if (!rei) {
        xequeMesh.visible = false
        return
      }
      // o mate tem o som dele; aqui é só xeque novo, não a mesma tela sendo redesenhada
      if (!chess.isCheckmate() && (!xequeMesh.visible || xequeMesh.userData.casa !== rei.square)) tocarSom('xeque')
      const { x, z } = squareToPos(rei.square)
      xequeMesh.position.set(x, 0.006, z)
      xequeMesh.userData.casa = rei.square
      xequeMesh.visible = true
    }

    function descartarFilhos(grupo: THREE.Group) {
      for (const filho of grupo.children) {
        filho.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            for (const mat of mats) mat.dispose()
          }
        })
      }
      grupo.clear()
    }

    // as peças usam geometria/material compartilhados (cache por tipo/cor), então aqui só
    // desmonta o grupo — nunca chama dispose(), senão quebraria as peças que ainda usam o cache
    /** `porParteEm`: a peça nova dessa casa sai com cada equipamento numa malha própria (a da promoção, que recebe
     * os equipamentos voando). */
    function sincronizarPecas(recriar = false, porParteEm?: string) {
      definirVestimenta({ cor: corHumanoRef.current, escolhas: vestimentaDeTeste ?? personalizacaoAtual().escolhas })
      if (recriar) {
        // inclusive as que estavam caindo/sumindo de uma captura em andamento
        piecesGroup.clear()
        pieceMeshBySquare.clear()
      }
      // ajusta o tabuleiro ao estado do motor reaproveitando a peça que continua na mesma casa
      // (mesmo tipo e cor, e o mesmo tipo de modelo — geométrica ou RPG) — inclusive a que acabou de
      // andar (o lance atualiza o mapa casa → peça quando ela chega). Antes o tabuleiro inteiro era
      // recriado a cada lance: todas as peças voltavam de repente pra pose parada (cortando gestos,
      // comemorações, a virada pra outra peça…) e o quadro engasgava recriando 32 personagens. Só
      // cria peça nova quando muda de verdade (promoção, novo jogo, modelos RPG que acabaram de
      // carregar).
      const meshesAntigos = new Map(pieceMeshBySquare)
      pieceMeshBySquare.clear()
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa) continue
          const existente = meshesAntigos.get(casa.square)
          if (
            existente &&
            existente.userData.tipo === casa.type &&
            existente.userData.cor === casa.color &&
            Boolean(existente.userData.acoesRPG) === Boolean(modelosRPG[casa.type]) &&
            (!modelosRPG[casa.type] || existente.userData.vestimenta === assinaturaDaVestimenta(casa.type, casa.color))
          ) {
            pieceMeshBySquare.set(casa.square, existente)
            meshesAntigos.delete(casa.square)
            continue
          }
          const mesh = buildPieceMesh(casa.type, casa.color, { porParte: casa.square === porParteEm })
          const { x, z } = squareToPosPeca(casa.square)
          mesh.position.set(x, 0.05, z)
          piecesGroup.add(mesh)
          pieceMeshBySquare.set(casa.square, mesh)
        }
      }
      for (const [, meshVelho] of meshesAntigos) {
        piecesGroup.remove(meshVelho)
      }
    }

    /** Peças aliadas (mesma cor) a até `raio` casas de distância de `square`, sem incluir ela mesma. */
    function pecasAliadasProximas(square: Square, cor: 'w' | 'b', raio: number): { square: Square; mesh: THREE.Group }[] {
      const origem = squareToPos(square)
      const resultado: { square: Square; mesh: THREE.Group }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== cor || casa.square === square) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (!mesh) continue
          const pos = squareToPos(casa.square)
          if (Math.hypot(pos.x - origem.x, pos.z - origem.z) <= raio) {
            resultado.push({ square: casa.square as Square, mesh })
          }
        }
      }
      return resultado
    }

    // true enquanto a aura pulsante da peça selecionada (abaixo) deve continuar rodando — vira
    // false assim que os destaques são limpos, pra parar o loop de animação na próxima checagem
    let auraSelecaoAtiva = false

    function limparDestaques() {
      auraSelecaoAtiva = false
      descartarFilhos(highlightGroup)
    }

    function destacarSelecao(square: Square, destinos: Square[]) {
      limparDestaques()
      const posSel = squareToPos(square)

      // anel na casa atual (de onde a peça está saindo)
      const selMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.38, 32),
        new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide }),
      )
      selMesh.rotation.x = -Math.PI / 2
      selMesh.position.set(posSel.x, 0.02, posSel.z)
      highlightGroup.add(selMesh)

      // círculos nas casas de destino (pra onde a peça pode ir)
      const destGeo = new THREE.CircleGeometry(0.14, 24)
      const destMat = new THREE.MeshBasicMaterial({ color: COR_DESTINO })
      for (const dest of destinos) {
        const destMesh = new THREE.Mesh(destGeo, destMat)
        destMesh.rotation.x = -Math.PI / 2
        const pos = squareToPos(dest)
        destMesh.position.set(pos.x, 0.02, pos.z)
        highlightGroup.add(destMesh)
      }

      // aura pulsante bem junto da própria peça — destaca a peça selecionada em si, não só a casa
      const auraGeo = new THREE.RingGeometry(0.15, 0.2, 28)
      const auraMat = new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide, transparent: true })
      const auraMesh = new THREE.Mesh(auraGeo, auraMat)
      auraMesh.rotation.x = -Math.PI / 2
      auraMesh.position.set(posSel.x, 0.045, posSel.z)
      highlightGroup.add(auraMesh)

      auraSelecaoAtiva = true
      const inicioAura = performance.now()
      function pulsar(agora: number) {
        if (!auraSelecaoAtiva) return
        const onda = (Math.sin(((agora - inicioAura) / 850) * Math.PI * 2) + 1) / 2
        auraMesh.scale.setScalar(1 + onda * 0.22)
        auraMat.opacity = 0.5 + onda * 0.5
        requestAnimationFrame(pulsar)
      }
      requestAnimationFrame(pulsar)
    }

    // BRANCAS/PRETAS venceram, ou EMPATE — só chamar quando chess.isGameOver() for true
    function resultadoAtual(chess: Chess): ResultadoPartidaXadrez {
      if (chess.isCheckmate()) return chess.turn() === 'w' ? 'PRETAS' : 'BRANCAS'
      return 'EMPATE'
    }

    // salva o progresso da partida atual (PGN + status) depois de cada lance — assim o jogo
    // nunca se perde, mesmo fechando a aba no meio de uma partida. Quando a partida termina,
    // também alimenta o aprendizado da máquina com o que ela jogou nessa partida.
    function salvarProgresso() {
      const partida = partidaAtualRef.current
      // a partida contra outra pessoa fica guardada no servidor, lance a lance
      if (!partida || salaRef.current) return
      const chess = chessRef.current
      partida.pgn = chess.pgn()
      partida.atualizadaEm = Date.now()
      if (chess.isCheckmate()) {
        partida.status = 'FINALIZADA'
        partida.resultado =
          chess.turn() === corHumanoRef.current ? 'A máquina venceu (xeque-mate)' : 'Você venceu (xeque-mate)'
      } else if (chess.isStalemate()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate por afogamento'
      } else if (chess.isDraw()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate'
      }
      const finalizouAgora = partida.status === 'FINALIZADA'
      salvarPartida(partida)
        .then(() => {
          if (finalizouAgora) {
            setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
            setPartidasFinalizadas((prev) => [partida, ...prev])
          }
        })
        .catch(() => {
          // sem servidor no momento — a partida segue salva só localmente até o próximo lance
        })
      // só o difícil ensina a máquina: os descuidos de propósito dos outros níveis a ensinariam a jogar mal
      if (finalizouAgora && (partida.dificuldade ?? 'dificil') === 'dificil') {
        const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
        registrarAprendizadoDaPartida(chess.history({ verbose: true }), resultadoAtual(chess), [corMaquina])
      }
    }

    // xeque-mate: faz as peças do lado vencedor comemorarem (pulando, com os braços erguidos) e
    // mostra "Você venceu"/"Você perdeu" em destaque — só uma vez por mate (comemoracaoDisparada
    // só volta a false quando uma partida nova é carregada, em carregarPgn)
    function dispararComemoracaoDeXequeMate(chess: Chess) {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true

      const corVencedora: 'w' | 'b' = chess.turn() === 'w' ? 'b' : 'w'
      let atraso = 0
      for (const linha of chess.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== corVencedora) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (mesh) animarComemoracao(mesh, atraso)
          atraso += 60
        }
      }
      const venceu = corVencedora === corHumanoRef.current
      tocarSom(venceu ? 'vitoria' : 'derrota')
      setResultadoOverlay(venceu ? 'venceu' : 'perdeu')
    }

    /** Desistência ou tempo na partida contra outra pessoa: o tabuleiro não mostra quem ganhou. */
    function comemorarFimDaSala(corVencedora: 'w' | 'b', motivo: string) {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true
      const chess = chessRef.current
      let atraso = 0
      for (const linha of chess.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== corVencedora) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (mesh) animarComemoracao(mesh, atraso)
          atraso += 60
        }
      }
      const venceu = corVencedora === corHumanoRef.current
      tocarSom(venceu ? 'vitoria' : 'derrota')
      setResultadoOverlay(venceu ? 'venceu' : motivo === 'desistencia' ? 'desistiu' : 'perdeu')
    }

    function tocarEmpateUmaVez() {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true
      tocarSom('empate')
      setResultadoOverlay('empate')
    }

    function atualizarStatusTexto() {
      const chess = chessRef.current
      setHistorico(chess.history())
      marcarXeque()
      const partidaDoJogador = partidaAtualRef.current
      const salaAtual = salaRef.current?.estado ?? null
      const adversario = (salaAtual?.minhaCor === 'w' ? salaAtual.pretas : salaAtual?.brancas) ?? ''
      const jogando = !!partidaDoJogador && partidaDoJogador.status !== 'FINALIZADA' && !chess.isGameOver() && (!salaAtual || salaAtual.status === 'andamento')
      const corHumano = corHumanoRef.current
      setPodeDesistir(jogando)
      setPodeEmpatar(
        jogando && ultimoPedidoDeEmpate !== chess.history().length && (salaAtual ? !salaAtual.empate : chess.turn() === corHumano && !vezDaMaquinaRef.current),
      )
      const t = tRef.current
      const nomeCor = (c: 'w' | 'b') => t(c === 'w' ? 'status.brancas' : 'status.pretas')
      const venciASala = !!salaAtual?.resultado && (salaAtual.resultado === 'brancas') === (salaAtual.minhaCor === 'w')
      if (salaAtual?.status === 'aguardando') {
        setStatusTexto(t('online.aguardando', { nome: adversario }))
      } else if (salaAtual?.status === 'expirada') {
        setStatusTexto(t('online.expirou'))
      } else if (salaAtual?.status === 'recusada') {
        setStatusTexto(t('online.recusou', { nome: adversario }))
      } else if (salaAtual?.motivo === 'desistencia') {
        setStatusTexto(t(venciASala ? 'online.adversarioDesistiu' : 'online.voceDesistiu', { nome: adversario }))
      } else if (salaAtual?.motivo === 'tempo') {
        setStatusTexto(t(venciASala ? 'online.venceuTempo' : 'online.perdeuTempo', { nome: adversario }))
      } else if (salaAtual?.motivo === 'acordo') {
        setStatusTexto(t('online.empateAcordo', { nome: adversario }))
        tocarEmpateUmaVez()
      } else if (partidaDoJogador?.status === 'FINALIZADA' && partidaDoJogador.resultado?.includes('desistiu')) {
        setStatusTexto(t('status.desistiu'))
      } else if (partidaDoJogador?.status === 'FINALIZADA' && partidaDoJogador.resultado === EMPATE_POR_ACORDO) {
        setStatusTexto(t('status.empateAcordo'))
        tocarEmpateUmaVez()
      } else if (!partidaAtualRef.current) {
        setStatusTexto('')
      } else if (chess.isCheckmate()) {
        setStatusTexto(
          chess.turn() === corHumano
            ? salaAtual
              ? t('online.adversarioVenceu', { nome: adversario, cor: nomeCor(corHumano === 'w' ? 'b' : 'w') })
              : t('status.maquinaVenceu', { cor: nomeCor(corHumano === 'w' ? 'b' : 'w') })
            : t('status.voceVenceu', { cor: nomeCor(corHumano) }),
        )
        dispararComemoracaoDeXequeMate(chess)
      } else if (chess.isStalemate()) {
        setStatusTexto(t('status.afogamento'))
        tocarEmpateUmaVez()
      } else if (chess.isDraw()) {
        setStatusTexto(t('status.empate'))
        tocarEmpateUmaVez()
      } else if (chess.turn() !== corHumano) {
        if (salaAtual) setStatusTexto(t(chess.isCheck() ? 'online.xequeVezDoAdversario' : 'online.vezDoAdversario', { nome: adversario }))
        else setStatusTexto(t(chess.isCheck() ? 'status.xequePensando' : 'status.pensando'))
      } else {
        setStatusTexto(chess.isCheck() ? t('status.xequeSuaVez', { cor: nomeCor(corHumano) }) : t('status.suaVez', { cor: nomeCor(corHumano) }))
      }
    }

    /**
     * Aplica um lance (SAN da máquina, ou {from,to} do clique do jogador) já animando a peça da
     * posição de origem até o destino; numa captura, o golpe (corpo a corpo, à distância ou o
     * atropelo do cavalo) vem antes, e a vítima cai e some (inclusive en passant). No roque a torre
     * anda junto com o rei. A promoção só assume a forma final ao ressincronizar no fim.
     */
    function executarLanceComAnimacao(
      entrada: string | { from: Square; to: Square; promotion?: string },
      aoTerminar: () => void,
    ) {
      const chess = chessRef.current
      let origem: Square | undefined
      let destino: Square | undefined

      if (typeof entrada === 'string') {
        const candidato = chess.moves({ verbose: true }).find((m) => m.san === entrada)
        if (candidato) {
          origem = candidato.from as Square
          destino = candidato.to as Square
        }
      } else {
        origem = entrada.from
        destino = entrada.to
      }

      const meshMovendo = origem ? pieceMeshBySquare.get(origem) : undefined

      // chess.js (v1.x) lança exceção pra um lance que não é mais válido na posição atual (ex: um
      // lance calculado antes de outro já ter sido aplicado nesse meio-tempo) — sem isso, essa
      // exceção ficava sem tratamento dentro do setTimeout assíncrono e travava a tela pra sempre
      // em "a máquina está pensando…", já que aoTerminar() nunca era chamado.
      let resultado: ReturnType<typeof chess.move> | null
      try {
        resultado =
          typeof entrada === 'string' ? chess.move(entrada) : chess.move({ ...entrada, promotion: entrada.promotion ?? 'q' })
      } catch {
        resultado = null
      }
      if (!resultado) {
        aoTerminar()
        return
      }

      // registra o lance assim que é aplicado no motor — atualiza a lista de "Lances" e salva no
      // servidor na hora, sem esperar a animação (que numa captura leva vários segundos) terminar.
      // Antes só acontecia no fim da animação: fechar a aba nesse meio-tempo perdia o último lance,
      // e a lista de lances ficava visivelmente atrasada em relação ao que já tinha acontecido.
      setHistorico(chess.history())
      salvarProgresso()

      // a partir daqui o lance é desse tabuleiro: se outro entrar no meio (novo jogo, outra partida),
      // nada do que falta (chegada, captura, ajuste das peças, próximo lance) acontece mais
      const minhaGeracao = geracao
      const vigente = () => minhaGeracao === geracao
      lancesEmAndamento++
      const terminar = () => {
        if (!vigente()) return
        lancesEmAndamento = Math.max(0, lancesEmAndamento - 1)
        aoTerminar()
      }

      // daqui pra frente o lance e as casas não mudam mais (constantes pros callbacks das animações)
      const lance = resultado
      const casaOrigem = origem
      const casaDestino = destino

      /** A peça chegou: o mapa casa → peça passa a apontar pra ela na casa nova — ela é
       * reaproveitada no fim do lance (ver sincronizarPecas), não recriada. */
      function chegou(mesh: THREE.Group, de: Square, para: Square) {
        if (!vigente()) return
        if (pieceMeshBySquare.get(de) === mesh) pieceMeshBySquare.delete(de)
        pieceMeshBySquare.set(para, mesh)
      }

      // roque: a torre também anda até a casa dela, junto com o rei
      const linhaDoRoque = resultado.color === 'w' ? '1' : '8'
      const torreDe = resultado.isKingsideCastle()
        ? (`h${linhaDoRoque}` as Square)
        : resultado.isQueensideCastle()
          ? (`a${linhaDoRoque}` as Square)
          : undefined
      const torrePara = resultado.isKingsideCastle()
        ? (`f${linhaDoRoque}` as Square)
        : resultado.isQueensideCastle()
          ? (`d${linhaDoRoque}` as Square)
          : undefined

      /** A peça (e, no roque, a torre) anda de onde está agora até a casa de destino; no fim, o
       * tabuleiro se ajusta reaproveitando as peças. */
      function seguirParaDestino() {
        if (!vigente()) return
        if (!meshMovendo || !casaOrigem || !casaDestino) {
          sincronizarPecas()
          terminar()
          return
        }
        let pendentes = 1
        const terminouUma = () => {
          if (!vigente()) return
          pendentes--
          if (pendentes === 0) {
            sincronizarPecas()
            terminar()
          }
        }
        // de onde a peça está agora — numa captura corpo a corpo ela já está perto da vítima
        const de = { x: meshMovendo.position.x, z: meshMovendo.position.z }
        animarPosicao(meshMovendo, de, squareToPosPeca(casaDestino), () => {
          chegou(meshMovendo, casaOrigem, casaDestino)
          if (!lance.isPromotion()) {
            terminouUma()
            return
          }
          // promoção: a ascensão — a luz envolve o peão, ele levita e vira a peça nova, que nasce sem os
          // equipamentos: eles surgem em volta e voam até ela. No cavalo, o peão continua peão, recebe o equipamento
          // do cavaleiro, e um cavalo chega a galope pra ele montar
          tocarSom('promocao')
          const tipoNovo = (lance.promotion ?? 'q') as Peca
          const corDoBrilho = materiaisPorFaccao[lance.color].brilho.color
          const escolhas = lance.color === vestimenta.cor ? vestimenta.escolhas : {}
          const vestidas = partesVestidas(tipoNovo, escolhas)
          const materiais = materiaisDaPeca(lance.color)
          const destino = squareToPosPeca(casaDestino)
          if (tipoNovo === 'n' && modelosRPG.n && modelosRPG.p) {
            let cavalo: THREE.Group | undefined
            let peao: THREE.Group | null = null
            animarAscensao(
              scene,
              meshMovendo,
              corDoBrilho,
              () => {
                if (!vigente()) return undefined
                sincronizarPecas(false, casaDestino)
                cavalo = pieceMeshBySquare.get(casaDestino)
                peao = peaoCavaleiro(lance.color, escolhas.n ?? {}, materiais)
                if (!cavalo || !peao) return cavalo
                cavalo.visible = false
                peao.position.set(destino.x, 0.05, destino.z)
                esconderPartes(peao, doCavaleiro(vestidas))
                piecesGroup.add(peao)
                return peao
              },
              () => {
                const peaoQueMonta = peao
                if (!vigente() || !cavalo || !peaoQueMonta) {
                  terminouUma()
                  return
                }
                const cavaloDaCasa = cavalo
                encaixarEquipamentos({
                  cena: scene,
                  peca: peaoQueMonta,
                  tipo: 'n',
                  partes: doCavaleiro(vestidas),
                  materiais,
                  cor: corDoBrilho,
                  continua: vigente,
                  aoTerminar: () =>
                    cavaloChegaEMontam({
                      cena: scene,
                      cavalo: cavaloDaCasa,
                      peao: peaoQueMonta,
                      destino,
                      partesDaMontaria: daMontaria(vestidas),
                      materiais,
                      cor: corDoBrilho,
                      continua: vigente,
                      aoTerminar: terminouUma,
                    }),
                })
              },
            )
            return
          }
          let pecaNova: THREE.Object3D | undefined
          animarAscensao(
            scene,
            meshMovendo,
            corDoBrilho,
            () => {
              if (!vigente()) return undefined
              sincronizarPecas(false, casaDestino)
              pecaNova = pieceMeshBySquare.get(casaDestino)
              if (pecaNova) esconderPartes(pecaNova, vestidas)
              return pecaNova
            },
            () => {
              if (!vigente() || !pecaNova) {
                terminouUma()
                return
              }
              encaixarEquipamentos({ cena: scene, peca: pecaNova, tipo: tipoNovo, partes: vestidas, materiais, cor: corDoBrilho, continua: vigente, aoTerminar: terminouUma })
            },
          )
        })
        const torre = torreDe ? pieceMeshBySquare.get(torreDe) : undefined
        if (torre && torreDe && torrePara) {
          tocarSom('roque')
          pendentes++
          animarPosicao(torre, squareToPosPeca(torreDe), squareToPosPeca(torrePara), () => {
            chegou(torre, torreDe, torrePara)
            terminouUma()
          })
        }
      }

      // captura: golpe primeiro, só depois a vítima cai e some — o peão (geométrico ou RPG) e
      // qualquer peça RPG golpeiam; uma peça geométrica de outro tipo mantém a remoção direta. O
      // golpe só acontece aqui, na hora da captura
      const casaDaVitima = (resultado.isEnPassant() && casaOrigem && casaDestino ? `${casaDestino[0]}${casaOrigem[1]}` : casaDestino) as
        | Square
        | undefined
      const vitima = casaDaVitima ? pieceMeshBySquare.get(casaDaVitima) : undefined
      const golpeia = resultado.piece === 'p' || Boolean(meshMovendo?.userData.acoesRPG)

      if (vitima && golpeia && meshMovendo && casaOrigem && casaDestino) {
        const atacante = meshMovendo
        const tipoAtacante = resultado.piece
        const ehRPG = Boolean(atacante.userData.acoesRPG)
        const corAtacante = resultado.color
        const posVitima = { x: vitima.position.x, z: vitima.position.z }

        const removerVitima = () => {
          if (!vigente()) return
          vitima.removeFromParent()
          if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === vitima) pieceMeshBySquare.delete(casaDaVitima)
        }
        // peças aliadas da atacante que estejam por perto comemoram junto, numa versão curta da
        // comemoração de xeque-mate
        const comemorarAliadas = () => {
          let atraso = 0
          for (const aliada of pecasAliadasProximas(casaDestino, corAtacante, 2.2)) {
            if (aliada.mesh === atacante) continue
            animarComemoracao(aliada.mesh, atraso, 900)
            atraso += 80
          }
        }

        // cavalo: salta até a casa e pousa com as patas em cima da vítima, que sai voando longe
        if (tipoAtacante === 'n' && ehRPG && pecaSaltaRPG(atacante)) {
          const de = { x: atacante.position.x, z: atacante.position.z }
          // o lance só termina com o cavalo pousado E a vítima já fora de cena — antes a vez passava
          // com ela ainda voando, e ficava uma peça a mais no tabuleiro até ela sumir
          let faltam = 2
          const umaParte = () => {
            if (!vigente()) return
            faltam--
            if (faltam === 0) {
              sincronizarPecas()
              terminar()
            }
          }
          animarPosicaoRPG(
            atacante,
            de,
            squareToPosPeca(casaDestino),
            () => {
              if (!vigente()) return
              chegou(atacante, casaOrigem, casaDestino)
              umaParte()
            },
            () => {
              tocarSom('golpe:n')
              if (atacante.userData.arma === 'lanca') tocarSom('golpe:lanca')
              tocarSom('voo:vitima')
              animarImpacto(scene, posVitima.x, posVitima.z)
              arremessarPeca(vitima, { x: posVitima.x - de.x, z: posVitima.z - de.z }, () => {
                removerVitima()
                umaParte()
              })
              comemorarAliadas()
            },
          )
          return
        }

        // peão capturando peão: às vezes o derrotado se rende com a honra de um samurai — o vencedor
        // vai até ele com a katana guardada e se curva em respeito; o derrotado vira de frente pra
        // ele, ajoelha, faz uma reverência profunda e tomba pra frente, entre pétalas de cerejeira
        const acoesVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
        const acoesAtacante = atacante.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
        if (
          tipoAtacante === 'p' &&
          vitima.userData.tipo === 'p' &&
          acoesVitima?.Sacrificio &&
          acoesAtacante?.Reverencia &&
          Math.random() < CHANCE_HONRA_SAMURAI
        ) {
          novaSequenciaRPG(atacante)
          const de = { x: atacante.position.x, z: atacante.position.z }
          const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
          const parada = DISTANCIA_REVERENCIA * atacante.scale.x
          const fracao = Math.max(0, (distancia - parada) / distancia)
          const ate = { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }
          virarRPG(atacante, rumoEntre(de, posVitima), () =>
            deslocarRPG(atacante, de, ate, () => {
              pararRPG(atacante)
              tocarClipeRPGUmaVez(atacante, 'Reverencia', { entrada: 0.3, saida: 0.4 })
              novaSequenciaRPG(vitima)
              mostrarEspadaRPG(vitima, false)
              // quem luta de espada se despede com outro som: sino de capela e trompas, no lugar da flauta de bambu
              tocarSom(atacante.userData.arma === 'espada' ? 'honra:espada' : 'honra')
              animarPetalas(scene, vitima.position.clone(), 5200)
              virarRPG(vitima, rumoEntre(vitima.position, atacante.position), () =>
                tocarClipeRPGUmaVez(vitima, 'Sacrificio', {
                  entrada: 0.3,
                  voltarAoParado: false,
                  aoTerminar: () => {
                    // caído, imóvel — some aos poucos, e o vencedor entra na casa
                    const definirOpacidade = prepararParaSumir(vitima)
                    const inicioSumir = performance.now()
                    const sumir = (agora: number) => {
                      const t = Math.min(1, (agora - inicioSumir) / 900)
                      definirOpacidade(1 - t)
                      if (t < 1) {
                        requestAnimationFrame(sumir)
                        return
                      }
                      removerVitima()
                      seguirParaDestino()
                    }
                    requestAnimationFrame(sumir)
                  },
                }),
              )
            }),
          )
          return
        }

        // sorteia o estilo do golpe a cada captura, pra não ser sempre a mesma animação
        const estilo: EstiloAtaque = Math.random() < 0.5 ? 'corte' : 'derrubada'
        const senha = novaSequenciaRPG(atacante)
        // sem arma (toda peça começa assim), luta com o corpo: socos ou chute. O cavalo continua com as patas
        const armaDoAtacante = (atacante.userData.arma as string | undefined) ?? 'nenhuma'
        const semArma = ehRPG && tipoAtacante !== 'n' && armaDoAtacante === 'nenhuma'
        // com arma, rei, dama e bispo atacam à distância (cada arma com o seu poder); peão e torre vão até a
        // vítima e golpeiam com a arma
        const aDistancia = ehRPG && !semArma && (tipoAtacante === 'b' || tipoAtacante === 'q' || tipoAtacante === 'k')

        /** Vira pra vítima e vai até ficar a `alcance` dela; `depois` roda ao chegar. */
        const chegarPerto = (alcance: number, depois: () => void) => {
          const de = { x: atacante.position.x, z: atacante.position.z }
          const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
          virarRPG(atacante, rumoEntre(atacante.position, posVitima), () => {
            if (distancia <= alcance + 0.05) {
              depois()
              return
            }
            const fracao = (distancia - alcance) / distancia
            deslocarRPG(atacante, de, { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }, depois)
          })
        }

        // no instante em que o golpe acerta: a vítima cai (pra longe do atacante) e as aliadas
        // por perto comemoram
        const acertar = (direcaoGolpe: { x: number; z: number }, derruba = estilo === 'derrubada') => {
          tocarSom(`queda:${vitima.userData.tipo as string}`)
          animarImpacto(scene, posVitima.x, posVitima.z)
          const nocaute = derruba ? direcaoGolpe : undefined
          animarQuedaEDesaparecimento(
            vitima,
            () => {
              removerVitima()
              seguirParaDestino()
            },
            nocaute,
            direcaoGolpe,
          )
          comemorarAliadas()
        }

        if (semArma) {
          const golpe: GolpeSemArma = sortearGolpeSemArma()
          voltarAoDescanso(atacante)
          // só outro jogo entrando no meio para a luta: um gesto que cai na peça não pode deixar a captura sem fim
          chegarPerto(distanciaDaLuta(golpe, atacante, vitima), () => {
            if (!vigente()) return
            pararRPG(atacante)
            const direcaoGolpe = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
            lutarSemArma(atacante, vitima, golpe, vigente, {
              antes: () => tocarSom(golpe === 'socos' ? 'soco:jab' : 'chute:ar'),
              aoAcertar: () => {
                tocarSom(golpe === 'socos' ? 'soco' : 'chute')
                // o chute sempre joga a vítima longe; o direto, às vezes
                acertar(direcaoGolpe, golpe === 'chute' || estilo === 'derrubada')
              },
            })
          })
          return
        }

        // o retalhamento: o peão de katana de quem equipou essa habilidade especial (o servidor só deixa equipar quem
        // comprou) dá uma série de cortes rápidos e a peça se desfaz em pedaços
        const retalha =
          tipoAtacante === 'p' &&
          ehRPG &&
          armaDoPeaoNoTabuleiro(atacante) === 'katana' &&
          corAtacante === vestimenta.cor &&
          vestimenta.escolhas.p?.golpe === 'retalhamento'
        const retalhar = () => {
          const cortes = 4
          let feitos = 0
          const corDoCorte = materiaisPorFaccao[corAtacante].brilho.color
          const proximo = () => {
            if (!vigente() || !sequenciaRPGValida(atacante, senha)) return
            if (feitos === cortes) {
              tocarSom('retalho:pedacos')
              despedacar(scene, vitima, () => {
                removerVitima()
                seguirParaDestino()
              })
              comemorarAliadas()
              guardarEspadaRPG(atacante, senha)
              return
            }
            feitos++
            const golpes = clipesRPGComPrefixo(atacante, 'Attack')
            const tocou = golpes.length > 0 && tocarClipeRPGUmaVez(atacante, golpes[(feitos - 1) % golpes.length], { entrada: 0.06, voltarAoParado: false, velocidade: 2.3, aoTerminar: proximo })
            window.setTimeout(() => {
              if (!vigente()) return
              tocarSom('retalho:corte')
              rastroDeCorte(scene, vitima, corDoCorte)
            }, 170)
            if (!tocou) window.setTimeout(proximo, 300)
          }
          proximo()
        }
        const golpear = () => {
          if (retalha) {
            retalhar()
            return
          }
          // a torre só bate de marreta (ou machado, ou maça) se tiver uma na mão; sem arma, golpeia como as outras
          if (tipoAtacante === 'r' && ehRPG && ARMAS_DA_TORRE.includes(atacante.userData.arma as string)) {
            pararRPG(atacante)
            tocarSom('marreta:ergue')
            const armaDaTorre = atacante.userData.arma as string
            const continua = () => vigente() && sequenciaRPGValida(atacante, senha)
            const fim = () => {
              removerVitima()
              seguirParaDestino()
            }
            if (armaDaTorre === 'machado') {
              // o machado corta a peça ao meio
              baterComMarreta(atacante, corAtacante, continua, () => {
                tocarSom('machado:corte')
                animarImpacto(scene, posVitima.x, posVitima.z)
                rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z, 0.9, 1300)
                tremerTabuleiro(scene, 0.06, 300)
                cortarAoMeio(scene, vitima, { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }, fim)
                comemorarAliadas()
              })
              return
            }
            if (armaDaTorre === 'maca') {
              // a maça: a peça fica presa nos espinhos pelo peito, a torre sacode e ela cai no tabuleiro. No cavalo, a
              // maça pega o cavaleiro, e o cavalo, solto, foge a galope pra fora do tabuleiro
              const acoesDaVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
              const galope = vitima.userData.tipo === 'n' ? acoesDaVitima?.Walk?.getClip() : undefined
              const maca = baterComMarreta(
                atacante,
                corAtacante,
                continua,
                () => {
                  tocarSom('maca:espinhos')
                  tocarSom('maca:sacode', (MACA_ERGUIDA_ATE_MS - MARRETA_PANCADA_MS) / 1000)
                  animarImpacto(scene, posVitima.x, posVitima.z)
                  tremerTabuleiro(scene, 0.08, 360)
                  if (galope) {
                    tocarSom('fuga:n')
                    soltarOCavalo(scene, vitima, atacante.position, galope)
                  }
                  if (acoesDaVitima?.Morte) {
                    novaSequenciaRPG(vitima)
                    mostrarEspadaRPG(vitima, false)
                    tocarClipeRPGUmaVez(vitima, 'Morte', { entrada: 0.1, voltarAoParado: false })
                  }
                  // presa nos espinhos: vai junto com a cabeça da maça
                  prenderPeloPeito(maca, vitima, atacante)
                  comemorarAliadas()
                },
                () => {
                  tocarSom('maca:solta')
                  soltarDaMaca(maca)
                  cairDaMaca(piecesGroup, vitima, fim)
                },
                pancadaNoPeito(atacante, vitima),
              )
              return
            }
            baterComMarreta(atacante, corAtacante, continua, () => {
              tocarSom('marreta:impacto')
              tocarSom('esmagado', 0.05)
              animarImpacto(scene, posVitima.x, posVitima.z)
              ondaDaMarretada(scene, posVitima.x, posVitima.z, materiaisPorFaccao[corAtacante].detalhe.color)
              // rachaduras de verdade na madeira e o tabuleiro inteiro tremendo
              rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z)
              poeiraDaPancada(scene, posVitima.x, posVitima.z)
              tremerTabuleiro(scene)
              esmagarPeca(vitima, fim)
              comemorarAliadas()
            })
            return
          }
          const direcaoGolpe = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
          const alvo = vitima.position.clone().add(new THREE.Vector3(0, 0.45 * vitima.scale.y, 0))
          const corPoder = materiaisPorFaccao[corAtacante].brilho.color
          const acerto = () => acertar(direcaoGolpe)
          // o poder sai no instante do golpe; o acerto (a queda da vítima) só quando ele chega nela
          const armaAtacante = atacante.userData.arma as string | undefined
          const fimDoPoder = () => {
            removerVitima()
            seguirParaDestino()
          }
          const noGolpe = () => {
            if (!aDistancia) {
              tocarSom(`golpe:${tipoAtacante}`)
              acerto()
            } else if (armaAtacante === 'cajado') {
              // o raio, como era o da rainha, saindo da mão do cajado
              tocarSom('raio:q')
              lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto, tipoAtacante === 'b' ? 'LeftHand' : 'RightHand')
            } else if (armaAtacante === 'cristal') {
              convocarCristal(scene, vitima, atacante.position.clone(), corPoder, () => tocarSom('cristal:convoca'), () => {
                tocarSom('cristal:quebra')
                acerto()
              })
            } else if (armaAtacante === 'cetro') {
              tocarSom('gravidade')
              afundarPelaGravidade(scene, vitima, corPoder, fimDoPoder)
              comemorarAliadas()
            } else if (armaAtacante === 'lua') {
              tocarSom('tornado')
              tornadoDaLua(scene, vitima, direcaoGolpe, corPoder, fimDoPoder)
              comemorarAliadas()
            } else if (tipoAtacante === 'b') {
              tocarSom('magia:b')
              lancarPoderDoBispo(scene, atacante, alvo, corPoder, () => {
                tocarSom('explosao:b')
                acerto()
              })
            } else if (tipoAtacante === 'q') {
              tocarSom('raio:q')
              lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto)
            } else {
              tocarSom('onda:k')
              lancarOndaDoRei(scene, atacante, alvo, materialCoroa.color, acerto)
            }
          }
          tocarGolpeRPG(atacante)
          animarAtaqueEspada(atacante, direcaoGolpe, estilo, noGolpe, () => {
            if (sequenciaRPGValida(atacante, senha)) guardarEspadaRPG(atacante, senha)
          })
        }
        // o peão RPG desembainha a espada primeiro (e vai até a vítima com ela na mão), golpeia e
        // guarda de volta — a espada entra na bainha antes de a vítima terminar de sumir
        // o som do saque cai no instante em que a lâmina deixa a bainha: o da katana, agudo; o da espada, mais grave
        const espadaDoPeao = atacante.userData.espadaRPG as EspadaRPG | undefined
        const armaDoPeao = atacante.userData.arma as string | undefined
        if (espadaDoPeao && !espadaDoPeao.fora && (armaDoPeao === 'katana' || armaDoPeao === 'espada')) {
          tocarSom(armaDoPeao === 'katana' ? 'katana:saca' : 'espada:saca', espadaDoPeao.segundoSaque)
        }
        sacarEspadaRPG(atacante, senha, () => {
          if (!ehRPG) {
            golpear()
            return
          }
          if (aDistancia) {
            virarRPG(atacante, rumoEntre(atacante.position, posVitima), golpear)
            return
          }
          // corpo a corpo: vira, vai até a vítima (para no alcance do golpe) e golpeia. A maça alcança mais longe: o cabo
          // e a bola inteiros ficam entre a torre e a vítima
          const comMaca = tipoAtacante === 'r' && armaDoAtacante === 'maca'
          chegarPerto(comMaca ? alcanceDaMaca(atacante, vitima) : (ALCANCE_GOLPE[tipoAtacante] ?? 0.55) * atacante.scale.x, golpear)
        })
        return
      }

      if (vitima) removerSemAnimacao(vitima)
      seguirParaDestino()

      function removerSemAnimacao(mesh: THREE.Group) {
        piecesGroup.remove(mesh)
        if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === mesh) pieceMeshBySquare.delete(casaDaVitima)
      }
    }

    /** Partida do jogador encerrada por desistência (o tabuleiro ainda teria lances legais). */
    function partidaDesistida(): boolean {
      return partidaAtualRef.current?.status === 'FINALIZADA' && !chessRef.current.isGameOver()
    }

    function jogarLanceDaMaquina() {
      if (partidaDesistida() || salaRef.current) return
      const chess = chessRef.current
      // vezDaMaquinaRef.current já true = já tem um cálculo de lance em andamento — chamar de
      // novo nesse meio-tempo (ex: efeito remontado em dev) faria duas buscas concorrentes brigando
      // pelo mesmo tabuleiro, e a segunda a terminar tentaria aplicar um lance já ilegal
      if (chess.isGameOver() || chess.turn() === corHumanoRef.current || vezDaMaquinaRef.current) return
      vezDaMaquinaRef.current = true
      atualizarStatusTexto()
      const minhaGeracao = geracao
      // as partidas de antes da escolha de dificuldade jogavam como o difícil
      const dificuldade = partidaAtualRef.current?.dificuldade ?? 'dificil'
      window.setTimeout(async () => {
        if (minhaGeracao !== geracao) return
        const lance = await escolherJogadaDaMaquina(chess, livroRef.current, dificuldade)
        // outra partida (ou novo jogo) entrou enquanto a máquina pensava: esse lance era da anterior
        if (minhaGeracao !== geracao) return
        // o jogador desistiu enquanto a máquina pensava — o lance não entra mais
        if (!lance || partidaDesistida()) {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
          return
        }
        executarLanceComAnimacao(lance, () => {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
        })
      }, usaLivro(dificuldade) && buscarNoLivro(chess, livroRef.current) ? PAUSA_MAQUINA_LIVRO_MS : PAUSA_MAQUINA_MS)
    }

    /** Anda com os lances do adversário, um de cada vez e nunca por cima de outra animação. */
    function processarFilaDaSala() {
      if (animandoDaSala || lancesEmAndamento > 0) return
      const san = filaDaSala.shift()
      if (!san) return
      animandoDaSala = true
      // trava os cliques enquanto a peça do adversário anda
      vezDaMaquinaRef.current = true
      executarLanceComAnimacao(san, () => {
        animandoDaSala = false
        vezDaMaquinaRef.current = false
        atualizarStatusTexto()
        processarFilaDaSala()
      })
    }

    /** Retorno ao tocar numa peça: som e, no celular, uma vibração curta. */
    function tocarToque(som: string) {
      if (!configRef.current.toque) return
      tocarSom(som)
      navigator.vibrate?.(12)
    }

    function tentarSelecionar(square: Square) {
      if (!partidaAtualRef.current || partidaDesistida()) return
      const salaSemJogo = salaRef.current && salaRef.current.estado?.status !== 'andamento'
      if (salaSemJogo) return
      const chess = chessRef.current
      if (chess.isGameOver()) return
      if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) {
        // clicou numa peça do próprio time fora da vez — ela reage em vez de simplesmente ignorar
        const pecaClicada = chess.get(square)
        const mesh = pieceMeshBySquare.get(square)
        if (pecaClicada && pecaClicada.color === corHumanoRef.current && mesh) {
          const dx = camera.position.x - mesh.position.x
          const dz = camera.position.z - mesh.position.z
          const dist = Math.hypot(dx, dz) || 1
          tocarToque('recusa')
          animarRecusa(mesh, { x: dx / dist, z: dz / dist })
        }
        return
      }
      const peca = chess.get(square)
      if (!peca || peca.color !== corHumanoRef.current) {
        selecionadaRef.current = null
        limparDestaques()
        return
      }
      const jogadas = chess.moves({ square, verbose: true })
      const destinos = jogadas.map((j) => j.to as Square)
      selecionadaRef.current = square
      destinosRef.current = destinos
      destacarSelecao(square, destinos)

      tocarToque(`selecionar:${peca.type}`)
      // peças aliadas por perto reagem (gesto sorteado) na direção da peça que acabou de ser
      // selecionada, cada uma com um pequeno atraso pra não ficarem todas sincronizadas
      const posSel = squareToPos(square)
      let atrasoReacao = 0
      for (const aliada of pecasAliadasProximas(square, peca.color, 2.2)) {
        const pos = squareToPos(aliada.square)
        animarGestoAmigavel(aliada.mesh, { x: posSel.x - pos.x, z: posSel.z - pos.z }, undefined, atrasoReacao)
        atrasoReacao += 120
      }
    }

    function tentarMover(destino: Square) {
      const chess = chessRef.current
      const origem = selecionadaRef.current
      if (!origem) return
      if (!destinosRef.current.includes(destino)) {
        selecionadaRef.current = null
        limparDestaques()
        tentarSelecionar(destino)
        return
      }
      selecionadaRef.current = null
      destinosRef.current = []
      limparDestaques()
      const jogar = (promotion?: PecaPromocao) => {
        const conexaoDaSala = salaRef.current?.conexao
        const numeroDoLance = chess.history().length
        executarLanceComAnimacao({ from: origem, to: destino, promotion }, () => {
          atualizarStatusTexto()
          if (salaRef.current) processarFilaDaSala()
          else if (!chess.isGameOver()) jogarLanceDaMaquina()
        })
        conexaoDaSala?.enviarLance(numeroDoLance, origem, destino, promotion)
      }
      if (!chess.moves({ square: origem, verbose: true }).some((m) => m.to === destino && m.promotion)) {
        jogar()
        return
      }
      // o peão chegou ao outro lado: o lance só sai depois de escolher a peça. Cancelando, ele fica
      // onde está e a vez continua de quem ia jogar
      resolverPromocaoRef.current = (peca) => {
        resolverPromocaoRef.current = null
        setPromocaoPendente(null)
        if (peca) jogar(peca)
      }
      setPromocaoPendente(chess.turn())
    }

    function onClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(squareMeshes)
      if (hits.length === 0) return

      const square = hits[0].object.userData.square as Square
      if (selecionadaRef.current) {
        tentarMover(square)
      } else {
        tentarSelecionar(square)
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    acoesRef.current = {
      // carrega uma partida salva (PGN) ou começa uma nova (pgn vazio) — usado tanto pra
      // retomar a partida em andamento ao abrir quanto pra começar uma partida nova depois
      carregarPgn(pgn: string, corHumano: 'w' | 'b') {
        setTela('jogo')
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        const chess = chessRef.current
        corHumanoRef.current = corHumano
        setCorDoJogador(corHumano)
        virarCameraPara(corHumano === 'w' ? 1 : -1)
        if (pgn) {
          try {
            chess.loadPgn(pgn)
          } catch {
            chess.reset()
          }
        } else {
          chess.reset()
          tocarSom('inicio')
        }
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
        if (!chess.isGameOver() && chess.turn() !== corHumanoRef.current) jogarLanceDaMaquina()
      },
      // partida contra outra pessoa: o tabuleiro inteiro a partir do que o servidor mandou
      carregarSala() {
        const estado = salaRef.current?.estado
        if (!estado) return
        setTela('jogo')
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        const chess = chessRef.current
        corHumanoRef.current = estado.minhaCor
        setCorDoJogador(estado.minhaCor)
        virarCameraPara(estado.minhaCor === 'w' ? 1 : -1)
        chess.reset()
        for (const san of estado.lances) chess.move(san)
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
      },
      // a conexão voltou ou a partida mudou de fase: confere se este tabuleiro está igual ao do servidor
      receberEstadoDaSala(estado) {
        const atual = salaRef.current
        if (!atual) return
        atual.estado = estado
        const local = [...chessRef.current.history(), ...filaDaSala]
        const faltaUm = estado.lances.length === local.length + 1 && local.every((san, i) => san === estado.lances[i])
        if (faltaUm) {
          filaDaSala.push(estado.lances[estado.lances.length - 1])
          processarFilaDaSala()
        } else if (estado.lances.length !== local.length || local.some((san, i) => san !== estado.lances[i])) {
          acoesRef.current?.carregarSala()
        } else {
          atualizarStatusTexto()
        }
      },
      receberLanceDaSala(lance) {
        const atual = salaRef.current
        if (!atual?.estado) return
        atual.estado = { ...atual.estado, empate: null, lances: [...atual.estado.lances.slice(0, lance.n), lance.san] }
        // o nosso próprio lance voltando: já está no tabuleiro desde o clique
        if (lance.n < chessRef.current.history().length + filaDaSala.length) return
        filaDaSala.push(lance.san)
        processarFilaDaSala()
      },
      receberFimDaSala(resultado, motivo) {
        const atual = salaRef.current
        if (!atual?.estado) return
        atual.estado = { ...atual.estado, status: 'fim', resultado, motivo }
        if (partidaAtualRef.current) partidaAtualRef.current.status = 'FINALIZADA'
        selecionadaRef.current = null
        destinosRef.current = []
        limparDestaques()
        if ((motivo === 'desistencia' || motivo === 'tempo') && resultado !== 'empate') comemorarFimDaSala(resultado === 'brancas' ? 'w' : 'b', motivo)
        atualizarStatusTexto()
      },
      // volta pra tela inicial: as peças na posição de início, vistas de lado. A partida que estava
      // aberta continua salva, a cada lance, e volta pelo "Continuar partida"
      mostrarMenu() {
        partidaAtualRef.current = null
        corHumanoRef.current = 'w'
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        setTela('menu')
        chessRef.current.reset()
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
        irParaVistaDoMenu()
      },
      // o jogador desiste: a partida termina como vitória da máquina (conta como derrota), vai pras
      // finalizadas, as peças da máquina comemoram e o tabuleiro fica parado na posição
      desistir() {
        if (salaRef.current) {
          // quem decide é o servidor: a partida termina quando ele avisar os dois
          salaRef.current.conexao.desistir()
          return
        }
        const partida = partidaAtualRef.current
        const chess = chessRef.current
        if (!partida || partida.status === 'FINALIZADA' || chess.isGameOver()) return
        partida.status = 'FINALIZADA'
        partida.resultado = 'A máquina venceu (você desistiu)'
        partida.pgn = chess.pgn()
        partida.atualizadaEm = Date.now()
        selecionadaRef.current = null
        destinosRef.current = []
        limparDestaques()
        salvarPartida(partida)
          .then(() => {
            setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
            setPartidasFinalizadas((prev) => [partida, ...prev.filter((p) => p.id !== partida.id)])
          })
          .catch(() => {
            // sem servidor no momento — fica marcada aqui e vai no próximo salvamento
          })
        const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
        if ((partida.dificuldade ?? 'dificil') === 'dificil') registrarAprendizadoDaPartida(chess.history({ verbose: true }), corMaquina === 'w' ? 'BRANCAS' : 'PRETAS', [corMaquina])
        if (!comemoracaoDisparada) {
          comemoracaoDisparada = true
          let atraso = 0
          for (const linha of chess.board()) {
            for (const casa of linha) {
              if (!casa || casa.color !== corMaquina) continue
              const mesh = pieceMeshBySquare.get(casa.square)
              if (mesh) animarComemoracao(mesh, atraso)
              atraso += 60
            }
          }
        }
        tocarSom('derrota')
        setResultadoOverlay('desistiu')
        atualizarStatusTexto()
      },
      // pedido de empate: contra a máquina, ela pensa um instante e aceita se não estiver bem na frente; contra outra
      // pessoa, o pedido vai pela partida ao vivo e quem decide é ela
      pedirEmpate() {
        const chess = chessRef.current
        const partida = partidaAtualRef.current
        const noLance = chess.history().length
        if (!partida || partida.status === 'FINALIZADA' || chess.isGameOver() || ultimoPedidoDeEmpate === noLance) return
        if (salaRef.current) {
          ultimoPedidoDeEmpate = noLance
          salaRef.current.conexao.pedirEmpate()
          atualizarStatusTexto()
          return
        }
        if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) return
        ultimoPedidoDeEmpate = noLance
        setEmpate({ tipo: 'pensando' })
        atualizarStatusTexto()
        const minhaGeracao = geracao
        window.setTimeout(() => {
          // outra partida entrou, ou a pessoa jogou enquanto a máquina pensava: o pedido era de outra posição
          if (minhaGeracao !== geracao || partida.status === 'FINALIZADA' || chess.history().length !== noLance) {
            if (minhaGeracao === geracao) setEmpate(null)
            return
          }
          const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
          if (!maquinaAceitaEmpate(chess, corMaquina, partida.dificuldade ?? 'dificil')) {
            setEmpate({ tipo: 'recusado', por: 'maquina' })
            atualizarStatusTexto()
            return
          }
          setEmpate(null)
          partida.status = 'FINALIZADA'
          partida.resultado = EMPATE_POR_ACORDO
          partida.pgn = chess.pgn()
          partida.atualizadaEm = Date.now()
          selecionadaRef.current = null
          destinosRef.current = []
          limparDestaques()
          salvarPartida(partida)
            .then(() => {
              setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
              setPartidasFinalizadas((prev) => [partida, ...prev.filter((p) => p.id !== partida.id)])
            })
            .catch(() => {
              // sem servidor no momento — fica marcada aqui e vai no próximo salvamento
            })
          if ((partida.dificuldade ?? 'dificil') === 'dificil') registrarAprendizadoDaPartida(chess.history({ verbose: true }), 'EMPATE', [corMaquina])
          atualizarStatusTexto()
        }, PAUSA_MAQUINA_MS)
      },
      atualizarTextos: atualizarStatusTexto,
      aplicarQualidade,
      aplicarTelaMovel: liberarCamera,
      revestir: () => sincronizarPecas(),
    }

    sincronizarPecas()
    atualizarStatusTexto()

    // os modelos RPG das peças carregam em segundo plano — quando (e se) chegarem, re-sincroniza
    // pra trocar as peças já desenhadas (geométricas) pelos modelos novos, sem recarregar a página
    let montado = true
    garantirModelosRPG(() => {
      if (montado) sincronizarPecas()
    })

    /** As coordenadas do lado de quem está olhando, e de pé pra essa pessoa. */
    function virarCoordenadas(lado: 1 | -1) {
      labelsGroup.children.forEach((rotulo, i) => {
        if (i < 8) rotulo.position.z = 4.35 * lado
        else rotulo.position.x = -4.35 * lado
        rotulo.rotation.z = lado === 1 ? 0 : Math.PI
      })
    }

    // a câmera viaja em torno do tabuleiro: da vista de lado do menu até o lado de quem joga, e de um
    // lado pro outro quando a cor muda
    interface PoseCamera {
      raio: number
      phi: number
      theta: number
    }
    let giroCamera: { de: PoseCamera; para: PoseCamera; inicio: number; coordenadasViradas: boolean } | null = null
    let emMenu = true

    function poseAtualDaCamera(): PoseCamera {
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      return { raio: s.radius, phi: s.phi, theta: s.theta }
    }

    function colocarCamera(pose: PoseCamera) {
      camera.position.setFromSphericalCoords(pose.raio, pose.phi, pose.theta).add(controls.target)
    }

    /** Arrastar pra girar só vale na partida, e se a tela do jogo estiver como movimentável. */
    function liberarCamera() {
      if (!giroCamera) controls.enabled = !emMenu && configRef.current.telaMovel
    }

    function levarCameraPara(para: PoseCamera, instantaneo = false) {
      const de = poseAtualDaCamera()
      const distancia = Math.abs(diferencaAngular(de.theta, para.theta)) + Math.abs(de.phi - para.phi) + Math.abs(de.raio - para.raio)
      // quem pediu menos movimento no sistema vai direto pro fim
      if (instantaneo || distancia < 0.001 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        colocarCamera(para)
        virarCoordenadas(ladoDaCamera)
        giroCamera = null
        liberarCamera()
        return
      }
      tocarSom('giro')
      giroCamera = { de, para, inicio: performance.now(), coordenadasViradas: false }
      controls.enabled = false
    }

    function atualizarGiroCamera(agora: number) {
      if (!giroCamera) return
      const { de, para } = giroCamera
      const t = Math.min(1, (agora - giroCamera.inicio) / GIRO_CAMERA_MS)
      const suave = t * t * (3 - 2 * t)
      colocarCamera({
        raio: de.raio + (para.raio - de.raio) * suave,
        phi: de.phi + (para.phi - de.phi) * suave,
        theta: de.theta + diferencaAngular(de.theta, para.theta) * suave,
      })
      // na metade do giro o tabuleiro está de lado: é quando a troca das coordenadas menos aparece
      if (t >= 0.5 && !giroCamera.coordenadasViradas) {
        giroCamera.coordenadasViradas = true
        virarCoordenadas(ladoDaCamera)
      }
      if (t >= 1) {
        giroCamera = null
        liberarCamera()
      }
    }

    /** A distância em que o tabuleiro cabe inteiro, olhando dessa inclinação e desse lado. */
    function raioQueEnquadra(phi: number, theta: number): number {
      const posicao = camera.position.clone()
      const orientacao = camera.quaternion.clone()
      colocarCamera({ raio: distanciaPadrao, phi, theta })
      camera.lookAt(controls.target)
      const raio = distanciaQueEnquadra()
      camera.position.copy(posicao)
      camera.quaternion.copy(orientacao)
      camera.updateMatrixWorld()
      return raio
    }

    /** Põe a câmera do lado da cor da pessoa. Na troca de partida, mantém a inclinação e o zoom que ela
     * escolheu; vindo do menu, volta pra vista de jogo. */
    function virarCameraPara(lado: 1 | -1) {
      const atual = poseAtualDaCamera()
      const vemDoMenu = emMenu
      emMenu = false
      definirLadoDaCamera(lado)
      const theta = lado === 1 ? 0 : Math.PI
      if (vemDoMenu) distanciaAutomatica = raioQueEnquadra(INCLINACAO_CAMERA_JOGO, theta)
      levarCameraPara({ raio: vemDoMenu ? distanciaAutomatica : atual.raio, phi: vemDoMenu ? INCLINACAO_CAMERA_JOGO : atual.phi, theta })
    }

    /** Vista da tela inicial: de lado, com as brancas de um lado e as pretas do outro, em qualquer tela. Na tela em
     * pé a câmera recua até o tabuleiro caber na largura, e os botões ficam embaixo dele. */
    function irParaVistaDoMenu(instantaneo = false) {
      emMenu = true
      definirLadoDaCamera(1)
      levarCameraPara(
        { raio: Math.max(RAIO_CAMERA_MENU, raioQueEnquadra(INCLINACAO_CAMERA_MENU, Math.PI / 2)), phi: INCLINACAO_CAMERA_MENU, theta: Math.PI / 2 },
        instantaneo,
      )
    }

    /** Resolução que vale agora, pela qualidade escolhida. */
    function resolucaoDoJogo(largura: number, altura: number): number {
      return QUALIDADES[configRef.current.qualidade].resolucao(largura, altura)
    }

    function aplicarQualidade(qualidade: QualidadeXadrez) {
      const { sombras } = QUALIDADES[qualidade]
      dirLight.castShadow = sombras > 0
      if (sombras > 0 && dirLight.shadow.mapSize.x !== sombras) {
        dirLight.shadow.mapSize.set(sombras, sombras)
        dirLight.shadow.map?.dispose()
        dirLight.shadow.map = null
      }
      onResize()
    }

    const relogio = new THREE.Clock()
    let frameId = 0
    let ultimoQuadro = 0
    function animate() {
      frameId = requestAnimationFrame(animate)
      // na qualidade leve, no máximo 30 quadros por segundo: metade do trabalho pro aparelho fraco. O tempo que passou
      // entra todo no quadro seguinte, então as animações andam no mesmo ritmo
      const teto = QUALIDADES[configRef.current.qualidade].quadrosPorSegundo
      const agoraDoQuadro = performance.now()
      if (teto && agoraDoQuadro - ultimoQuadro < 1000 / teto - 2) return
      ultimoQuadro = agoraDoQuadro
      const delta = relogio.getDelta()
      const agora = performance.now()
      desfazerPosesDasLutas()
      desfazerPosturas()
      for (const peca of piecesGroup.children) {
        ;(peca.userData.mixer as THREE.AnimationMixer | undefined)?.update(delta)
        atualizarGestoRPG(peca, agora)
      }
      atualizarMarretadas(agora)
      atualizarLutas(agora)
      atualizarPosturas(agora)
      atualizarGiroCamera(agora)
      if (xequeMesh.visible) xequeMat.opacity = 0.45 + 0.25 * ((Math.sin(agora / 260) + 1) / 2)
      controls.update()
      // nos testes com dois jogadores ao mesmo tempo, sem placa de vídeo, é o desenho que trava. O clique
      // nas casas depende das matrizes que o desenho atualizaria
      if (import.meta.env.DEV && (window as unknown as { __semDesenho?: boolean }).__semDesenho) {
        scene.updateMatrixWorld()
        camera.updateMatrixWorld()
      } else renderer.render(scene, camera)
    }
    animate()

    // distância da câmera que o enquadramento automático escolheu por último — se o jogador não mexeu
    // no zoom desde então, a próxima mudança de tamanho pode reajustar (aproximar ou afastar)
    const distanciaPadrao = camera.position.distanceTo(controls.target)
    let distanciaAutomatica = distanciaPadrao

    /** Menor distância (a partir da padrão) em que o tabuleiro inteiro cabe na tela — numa tela em pé
     * (celular) a câmera precisa ir mais pra trás pra caber a largura. */
    function distanciaQueEnquadra(): number {
      const direcao = camera.position.clone().sub(controls.target).normalize()
      const cantos = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * MEIA_LARGURA_TABULEIRO, 0, sz * MEIA_LARGURA_TABULEIRO)))
      const original = camera.position.clone()
      let distancia = distanciaPadrao
      for (; distancia < 90; distancia += 0.5) {
        camera.position.copy(controls.target).addScaledVector(direcao, distancia)
        camera.updateMatrixWorld()
        if (cantos.every((c) => {
          const p = c.clone().project(camera)
          return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.97
        })) break
      }
      camera.position.copy(original)
      camera.updateMatrixWorld()
      return distancia
    }

    function onResize() {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(resolucaoDoJogo(el.clientWidth, el.clientHeight))
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      const atual = camera.position.distanceTo(controls.target)
      const necessaria = distanciaQueEnquadra()
      if (emMenu) {
        irParaVistaDoMenu(true)
      } else if (giroCamera && Math.abs(giroCamera.para.raio - distanciaAutomatica) < 0.01) {
        // o menu ocupa a tela toda e a partida não: o giro que sai dele foi calculado no formato antigo
        distanciaAutomatica = raioQueEnquadra(giroCamera.para.phi, giroCamera.para.theta)
        giroCamera.para = { ...giroCamera.para, raio: distanciaAutomatica }
      } else if (atual < necessaria - 0.01 || Math.abs(atual - distanciaAutomatica) < 0.01) {
        // só mexe na câmera se o tabuleiro não cabe, ou se a distância ainda é a que o enquadramento
        // pôs (o jogador não deu zoom desde então)
        const direcao = camera.position.clone().sub(controls.target).normalize()
        camera.position.copy(controls.target).addScaledVector(direcao, necessaria)
        distanciaAutomatica = necessaria
      }
      controls.maxDistance = Math.max(20, necessaria * 1.3)
      // a névoa acompanha a distância: de longe o tabuleiro não some
      const fog = scene.fog as THREE.Fog
      fog.near = Math.max(11, necessaria - 2.5)
      fog.far = Math.max(55, necessaria + 41.5)
    }
    window.addEventListener('resize', onResize)
    // só no desenvolvimento: os testes conferem o que está dentro do desenho 3D (casa em xeque, câmera)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __xadrez?: object }).__xadrez = {
        casaEmXeque: () => (xequeMesh.visible ? (xequeMesh.userData.casa as string) : null),
        /** Veste as peças de quem joga como se fosse a escolha da conta. */
        vestirParaTeste: (escolhas: Record<string, Record<string, string>> | null) => {
          vestimentaDeTeste = escolhas
          sincronizarPecas()
        },
        /** A luta sem arma deixa de sortear e usa sempre esse golpe (null volta a sortear). */
        forcarGolpeSemArma: (golpe: GolpeSemArma | null) => forcarGolpeSemArma(golpe),
        /** O que as conquistas contam nessas partidas. */
        contarConquistas: (partidas: PartidaXadrez[]) => contarPartidas(partidas),
        /** As partes da personalização que a peça daquela casa está vestindo. */
        vestimentaDaCasa: (casa: string) => {
          const nomes: string[] = []
          pieceMeshBySquare.get(casa)?.traverse((filho) => {
            if (filho.name.startsWith('vestimenta:')) nomes.push(filho.name)
          })
          return nomes
        },
        /** As partes da katana do modelo que aparecem na peça da casa. */
        katanaDaCasa: (casa: string) => {
          const partes: string[] = []
          pieceMeshBySquare.get(casa)?.traverse((filho) => {
            const material = filho.userData.material as string | undefined
            if (filho.visible && material && ['EspadaLamina', 'EspadaCabo', 'CaboBainha', 'BainhaKatana'].includes(material)) partes.push(material)
          })
          return partes
        },
        distanciaCamera: () => camera.position.distanceTo(controls.target),
        /** Câmera perto de uma casa, pras fotos dos efeitos (theta em graus, 0 = do lado das brancas). */
        aproximarDaCasa: (casa: string, raio = 4.5, theta = 0, inclinacao = 55) => {
          const { x, z } = squareToPos(casa)
          controls.target.set(x, 0.5, z)
          colocarCamera({ raio, phi: THREE.MathUtils.degToRad(inclinacao), theta: THREE.MathUtils.degToRad(theta) })
          camera.lookAt(controls.target)
          controls.update()
        },
        /** Lance ou máquina ainda em andamento. */
        ocupado: () => vezDaMaquinaRef.current || lancesEmAndamento > 0,
        /** Lado da câmera (z positivo = brancas perto da tela) e se ela ainda está girando. */
        camera: () => ({ z: camera.position.z, girando: giroCamera !== null, coordenadaA: labelsGroup.children[0].position.z, distancia: camera.position.distanceTo(controls.target), distanciaIdeal: distanciaQueEnquadra() }),
        /** Onde a casa aparece no tabuleiro, em pixels da janela. */
        casaNaTela: (casa: string) => {
          const { x, z } = squareToPos(casa)
          const p = new THREE.Vector3(x, 0, z).project(camera)
          const r = renderer.domElement.getBoundingClientRect()
          return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
        },
        /** O navegador já liberou o som, e o som ambiente está tocando? */
        estadoDoSom: () => ({ destravado: somDestravado(), ambiente: ambienteTocando() }),
        /** Câmera na vista da tela inicial, resolução do desenho e sombras: o que a configuração muda. */
        cena: () => ({ menu: emMenu, resolucao: renderer.getPixelRatio(), sombras: dirLight.castShadow, arrastavel: controls.enabled, theta: poseAtualDaCamera().theta }),
        /** Golpes de marreta em andamento. */
        marretadas: () => marretadas.size,
        /** A vez já é da máquina: da peça da pessoa parar até o fim do lance dela. */
        vezDaMaquina: () => vezDaMaquinaRef.current,
        sala: () => salaRef.current?.estado ?? null,
        /** Cada peça do motor tem a sua peça 3D, do tipo/cor certos, na cena e no centro da casa — e nada sobrando. */
        problemasDoTabuleiro: () => {
          const problemas: string[] = []
          const casas = chessRef.current.board().flat().filter((c): c is NonNullable<typeof c> => !!c)
          for (const casa of casas) {
            const mesh = pieceMeshBySquare.get(casa.square)
            if (!mesh) {
              problemas.push(`sem peça 3D em ${casa.square}`)
              continue
            }
            if (mesh.userData.tipo !== casa.type || mesh.userData.cor !== casa.color) problemas.push(`peça errada em ${casa.square}`)
            if (mesh.parent !== piecesGroup) problemas.push(`peça de ${casa.square} fora da cena`)
            const alvo = squareToPosPeca(casa.square)
            const erro = Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z)
            if (erro > 0.12) problemas.push(`peça de ${casa.square} fora do lugar (${erro.toFixed(2)})`)
          }
          if (pieceMeshBySquare.size !== casas.length) problemas.push(`mapa com ${pieceMeshBySquare.size} peças, motor com ${casas.length}`)
          if (piecesGroup.children.length !== casas.length) problemas.push(`cena com ${piecesGroup.children.length} peças, motor com ${casas.length}`)
          return problemas
        },
        /** Clica numa casa como quem joga: seleciona a peça ou, fora da vez, faz ela recusar. */
        clicarCasa: (casa: string) => tentarSelecionar(casa as Square),
        /** Quanto a peça da casa está fora do centro dela e do giro de descanso. */
        descansoDaPeca: (casa: string) => {
          const mesh = pieceMeshBySquare.get(casa as Square)
          if (!mesh) return null
          const alvo = squareToPosPeca(casa as Square)
          return { distancia: Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z), giro: Math.abs(diferencaAngular(mesh.rotation.y, rumoDeDescanso(mesh))) }
        },
        /** Joga como o jogador (clique na peça e na casa). */
        jogar: (de: string, para: string) => {
          tentarSelecionar(de as Square)
          tentarMover(para as Square)
        },
        /** Responde a pergunta da promoção, como quem toca na peça. */
        escolherPromocao: (peca: PecaPromocao) => resolverPromocaoRef.current?.(peca),
        /** As partes da personalização à vista na peça da casa (a da promoção, vestida parte por parte). */
        partesVisiveis: (casa: string) => {
          const partes = new Set<string>()
          pieceMeshBySquare.get(casa as Square)?.traverse((filho) => {
            if (typeof filho.userData.parte === 'string' && filho.visible) partes.add(filho.userData.parte)
          })
          return [...partes].sort()
        },
        lancesDoJogador: () => (chessRef.current.turn() === corHumanoRef.current ? chessRef.current.moves({ verbose: true }).map((m) => [m.from, m.to]) : []),
        fen: () => chessRef.current.fen(),
        /** O lance que a máquina dessa dificuldade escolhe na posição, sem mexer no tabuleiro. */
        lanceDaMaquina: (fen: string, dificuldade: Dificuldade) => escolherJogadaDaMaquina(new Chess(fen), livroRef.current, dificuldade),
        dificuldadeDaPartida: () => partidaAtualRef.current?.dificuldade ?? null,
        /** Começa uma partida de teste a partir de um PGN (não aparece nas partidas do jogador). */
        carregarTeste: (pgn: string, cor: 'w' | 'b', dificuldade?: PartidaXadrez['dificuldade']) => {
          const agora = Date.now()
          partidaAtualRef.current = { id: `teste-${agora}`, jogador: '__teste__', corJogador: cor, pgn, status: 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora, ...(dificuldade ? { dificuldade } : {}) }
          acoesRef.current?.carregarPgn(pgn, cor)
        },
      }
    }
    // o espaço do tabuleiro também muda sem a janela mudar — recolher/abrir o menu, tela cheia
    const observador = new ResizeObserver(() => onResize())
    observador.observe(container)
    onResize()
    irParaVistaDoMenu(true)

    // interações casuais entre peças aliadas — de vez em quando (não depende de nenhuma ação do
    // jogador), duas peças do mesmo time que estejam próximas viram uma pra outra e acenam, só pra
    // dar uma sensação de vida no tabuleiro enquanto esperam a vez. Roda tanto na tela inicial quanto
    // numa partida de verdade.
    let interacaoTimeoutId: number | undefined
    function agendarProximaInteracaoAmigavel() {
      interacaoTimeoutId = window.setTimeout(tentarInteracaoAmigavel, 6000 + Math.random() * 7000)
    }
    function tentarInteracaoAmigavel() {
      // no meio de um lance, não: o gesto começa outra sequência na peça, e quem estava indo capturar perdia o golpe
      // (a captura nunca terminava e o jogo travava)
      if (lancesEmAndamento > 0) {
        agendarProximaInteracaoAmigavel()
        return
      }
      const casasComPeca: { square: Square; color: 'w' | 'b' }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (casa) casasComPeca.push({ square: casa.square as Square, color: casa.color })
        }
      }
      const origem = casasComPeca[Math.floor(Math.random() * casasComPeca.length)]
      const meshOrigem = origem ? pieceMeshBySquare.get(origem.square) : undefined
      if (origem && meshOrigem) {
        const aliadas = pecasAliadasProximas(origem.square, origem.color, 1.6)
        if (aliadas.length > 0) {
          const alvo = aliadas[Math.floor(Math.random() * aliadas.length)]
          const posOrigem = squareToPos(origem.square)
          const posAlvo = squareToPos(alvo.square)
          // as duas fazem o mesmo gesto sorteado, uma respondendo a outra com um pequeno atraso —
          // fica mais com cara de "interação" do que dois gestos aleatórios sem relação
          const gesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)]
          animarGestoAmigavel(meshOrigem, { x: posAlvo.x - posOrigem.x, z: posAlvo.z - posOrigem.z }, gesto)
          animarGestoAmigavel(alvo.mesh, { x: posOrigem.x - posAlvo.x, z: posOrigem.z - posAlvo.z }, gesto, 400)
        }
      }
      agendarProximaInteracaoAmigavel()
    }
    agendarProximaInteracaoAmigavel()

    return () => {
      montado = false
      window.clearTimeout(interacaoTimeoutId)
      window.removeEventListener('resize', onResize)
      observador.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('webglcontextrestored', gerarReflexoDoAmbiente)
      cancelAnimationFrame(frameId)
      controls.dispose()
      reflexo?.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  function fecharSala() {
    salaRef.current?.conexao.fechar()
    salaRef.current = null
    setSala(null)
    setConectadoNaSala(true)
    setRevanche(null)
  }

  function abrirSala(codigo: string) {
    const token = sessaoAtual()?.token
    if (!token) return
    fecharSala()

    const conexao = abrirConexaoDaSala(codigo, token, {
      estado(estado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        setEmpate(estado.empate ? { tipo: estado.empate === estado.minhaCor ? 'enviado' : 'recebido' } : null)
        if (atual.estado) {
          acoesRef.current?.receberEstadoDaSala(estado)
        } else {
          atual.estado = estado
          const agora = Date.now()
          const encerrada = estado.status === 'fim' || estado.status === 'expirada' || estado.status === 'recusada'
          partidaAtualRef.current = { id: `sala-${codigo}`, jogador, corJogador: estado.minhaCor, pgn: '', status: encerrada ? 'FINALIZADA' : 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora }
          acoesRef.current?.carregarSala()
        }
        setSala(estado)
      },
      lance(lance) {
        if (salaRef.current?.conexao !== conexao) return
        // jogar em vez de responder recusa o empate pedido
        setEmpate((agora) => (agora?.tipo === 'recusado' ? agora : null))
        acoesRef.current?.receberLanceDaSala(lance)
      },
      fim(resultado, motivo) {
        if (salaRef.current?.conexao !== conexao) return
        setEmpate(null)
        acoesRef.current?.receberFimDaSala(resultado, motivo)
        setSala((atual) => atual && { ...atual, status: 'fim', resultado, motivo })
      },
      presenca(adversarioConectado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        if (atual.estado) atual.estado = { ...atual.estado, adversarioConectado }
        setSala((estado) => estado && { ...estado, adversarioConectado })
      },
      conexao(ligada) {
        if (salaRef.current?.conexao === conexao) setConectadoNaSala(ligada)
      },
      recusada() {
        if (salaRef.current?.conexao === conexao) handleMenu()
      },
      revanche(codigo) {
        if (salaRef.current?.conexao === conexao) setRevanche({ codigo, vencida: false })
      },
      empate(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: de }
        setEmpate({ tipo: de === atual.estado.minhaCor ? 'enviado' : 'recebido' })
        acoesRef.current?.atualizarTextos()
      },
      empateRecusado(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: null }
        setEmpate(de === atual.estado.minhaCor ? { tipo: 'recusado', por: 'adversario' } : null)
        acoesRef.current?.atualizarTextos()
      },
    })
    salaRef.current = { conexao, estado: null }
  }

  // espera o servidor: a lista de partidas do menu não pode trazer de volta o convite cancelado
  async function handleCancelarConvite() {
    if (sala) await recusarSala(sala.codigo).catch(() => {})
    handleMenu()
  }

  function handleNovoJogo() {
    setRevancheFalhou(false)
    // o resultado da partida (a taça) fica por cima da escolha de cor: sai antes
    setResultadoOverlay(null)
    setEscolhendoCor(true)
  }

  async function handleAceitarRevanche() {
    if (!revanche) return
    try {
      await entrarEmSala(revanche.codigo)
      abrirSala(revanche.codigo)
    } catch {
      setRevanche({ ...revanche, vencida: true })
    }
  }

  function handleRecusarRevanche() {
    if (revanche && !revanche.vencida) void recusarSala(revanche.codigo).catch(() => {})
    setRevanche(null)
  }

  function handleMenu() {
    fecharSala()
    setConfirmandoDesistencia(false)
    setEscolhendoCor(false)
    acoesRef.current?.mostrarMenu()
  }

  function handleContinuar() {
    const partida = partidasEmAndamento[0]
    if (partida) handleRetomarPartida(partida)
  }

  // não existe mais tela normal: o jogo ocupa sempre a página inteira. No celular, a tela cheia do navegador (que
  // esconde a barra de endereço) só pode ser pedida num toque: cada toque pede de novo, se ela tiver saído (o voltar do
  // celular, um gesto). No iPhone não existe pra página, e lá fica só o jogo ocupando a tela
  useEffect(() => {
    if (!ehCelular()) return
    const pedir = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    }
    window.addEventListener('pointerup', pedir)
    return () => window.removeEventListener('pointerup', pedir)
  }, [])

  // tabuleiro em tela cheia: a página de trás não rola junto
  useEffect(() => {
    if (!ocupaATela) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [ocupaATela])

  function handleDesistir() {
    setConfirmandoDesistencia(false)
    acoesRef.current?.desistir()
  }

  async function handleEscolherCor(cor: 'w' | 'b') {
    // numa partida amistosa, "Novo jogo" chama o mesmo amigo de novo, não a máquina
    if (sala) {
      try {
        const nova = await pedirRevanche(sala.codigo, cor)
        setEscolhendoCor(false)
        abrirSala(nova.codigo)
      } catch {
        setRevancheFalhou(true)
      }
      return
    }
    fecharSala()
    setEscolhendoCor(false)
    const nova = novaPartida(jogador, cor, config.dificuldade)
    try {
      await salvarPartida(nova)
    } catch {
      // sem servidor — segue mesmo assim, só não fica persistido até a conexão voltar
    }
    partidaAtualRef.current = nova
    setPartidasEmAndamento((prev) => [nova, ...prev])
    acoesRef.current?.carregarPgn('', cor)
  }

  // serve também pra rever uma partida terminada: como não sobra lance legal pro chess.js aceitar, o
  // tabuleiro fica naturalmente travado, sem precisar de nenhuma trava extra
  function handleRetomarPartida(partida: PartidaXadrez) {
    fecharSala()
    partidaAtualRef.current = partida
    acoesRef.current?.carregarPgn(partida.pgn, partida.corJogador)
  }

  const adversarioDaSala = sala && (sala.minhaCor === 'w' ? sala.pretas : sala.brancas)
  /** Quem joga de cada cor, pra aba de lances: você, a máquina ou o amigo. */
  const nomeDoLado = (cor: 'w' | 'b') => (cor === corDoJogador ? t('lances.voce') : sala ? ((cor === 'w' ? sala.brancas : sala.pretas) ?? '…') : t('lances.maquina'))
  const avisoDoEmpate =
    empate?.tipo === 'pensando'
      ? t('empate.pensando')
      : empate?.tipo === 'recusado'
        ? empate.por === 'maquina'
          ? t('empate.maquinaRecusou')
          : t('empate.adversarioRecusou', { nome: adversarioDaSala ?? '' })
        : empate?.tipo === 'enviado'
          ? t('empate.enviado', { nome: adversarioDaSala ?? '' })
          : null

  function handlePedirEmpate() {
    acoesRef.current?.pedirEmpate()
  }

  function handleResponderEmpate(aceito: boolean) {
    salaRef.current?.conexao.responderEmpate(aceito)
    setEmpate(null)
  }

  return (
    <div className="space-y-3">
      <div
        ref={tabuleiroRef}
        className={ocupaATela ? `fixed inset-0 z-[65] ${tela === 'menu' ? 'bg-[#1c120a]' : 'bg-[#f5f0e6]'}` : 'relative'}
        aria-label={t('menu.tabuleiroCheio')}
      >
        <div
          ref={containerRef}
          className={ocupaATela ? 'h-full w-full touch-none' : 'w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden border border-ink-100 touch-none'}
        />

        {tela === 'menu' && (
          <MenuXadrez
            t={t}
            config={config}
            onConfig={mudarConfig}
            temPartida={partidasEmAndamento.length > 0}
            partidasTerminadas={partidasFinalizadas}
            partidasContraMaquina={partidasContraMaquina}
            onVerPartida={handleRetomarPartida}
            onContinuar={handleContinuar}
            onNovoJogo={handleNovoJogo}
            onAbrirSala={abrirSala}
            montarVitrine={montarVitrine}
            montarExpositor={montarExpositor}
            onImportou={atualizarListaDePartidas}
          />
        )}

        {tela === 'jogo' && config.registro && <PainelDeLances t={t} lances={historico} brancas={nomeDoLado('w')} pretas={nomeDoLado('b')} />}

        {tela === 'jogo' && (
          // por cima do tabuleiro, no alto: o menu no canto, com as ações da partida logo abaixo. A situação da partida
          // fica embaixo, longe das peças
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="pointer-events-auto flex items-start justify-between gap-2">
              <button type="button" onClick={handleMenu} className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow backdrop-blur">
                {t('menu.menu')}
              </button>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              {podeDesistir && <BotaoDesistir t={t} confirmando={confirmandoDesistencia} onPedir={setConfirmandoDesistencia} onConfirmar={handleDesistir} sobreTabuleiro />}
              {podeEmpatar && <BotaoEmpate t={t} onPedir={handlePedirEmpate} sobreTabuleiro />}
              {!podeDesistir && !resultadoOverlay && sala?.status !== 'aguardando' && (
                <button type="button" onClick={handleNovoJogo} className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow">
                  {t('menu.novoJogo')}
                </button>
              )}
            </div>
          </div>
        )}

        {tela === 'jogo' && (
          // embaixo: o convite esperando o amigo, o pedido de empate, a revanche e a situação da partida
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {sala?.status === 'aguardando' && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="status" data-convite>
                <p className="text-xs text-[#5a4630]">{t('online.esperaDica')}</p>
                <Button variant="secondary" onClick={handleCancelarConvite}>
                  {t('online.cancelarConvite')}
                </Button>
              </div>
            )}
            {empate?.tipo === 'recebido' && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="alertdialog" data-pedido-empate>
                <p className="text-sm font-medium text-[#3a2a1a]">{t('empate.recebido', { nome: adversarioDaSala ?? '' })}</p>
                <span className="flex gap-2">
                  <Button variant="primary" onClick={() => handleResponderEmpate(true)}>
                    {t('empate.aceitar')}
                  </Button>
                  <Button variant="secondary" onClick={() => handleResponderEmpate(false)}>
                    {t('empate.recusar')}
                  </Button>
                </span>
              </div>
            )}
            {revanche && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="status" data-revanche>
                <p className="text-sm font-medium text-[#3a2a1a]">{t(revanche.vencida ? 'amigos.erroPartidaVencida' : 'online.revancheRecebida', { nome: adversarioDaSala ?? '' })}</p>
                <span className="flex gap-2">
                  {!revanche.vencida && (
                    <Button variant="primary" onClick={() => void handleAceitarRevanche()}>
                      {t('amigos.jogar')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={handleRecusarRevanche}>
                    {t(revanche.vencida ? 'resultado.fechar' : 'amigos.recusar')}
                  </Button>
                </span>
              </div>
            )}
            {!resultadoOverlay && (statusTexto || avisoDoEmpate) && (
              <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1" data-status-partida>
                {statusTexto && <p className="rounded-lg bg-white/85 px-3 py-1.5 text-center text-sm font-medium text-[#3a2a1a] shadow backdrop-blur">{statusTexto}</p>}
                {/* na partida com um amigo, contra quem é (ficava na barra da tela normal, que não existe mais) */}
                {adversarioDaSala && (
                  <p className="rounded-lg bg-white/70 px-2.5 py-0.5 text-center text-xs font-medium text-[#5a4630] shadow" data-adversario>
                    {t('online.contra', { nome: adversarioDaSala })}
                  </p>
                )}
                {avisoDoEmpate && (
                  <p className="rounded-lg bg-[#1c120a]/85 px-3 py-1 text-center text-xs font-medium text-[#f5e6c8] shadow" data-aviso-empate>
                    {avisoDoEmpate}
                  </p>
                )}
                {sala && !conectadoNaSala && <p className="rounded-lg bg-rose-700/90 px-3 py-1 text-xs font-medium text-white shadow">{t('online.reconectando')}</p>}
                {sala?.status === 'andamento' && conectadoNaSala && !sala.adversarioConectado && adversarioDaSala && (
                  <p className="rounded-lg bg-[#1c120a]/85 px-3 py-1 text-xs font-medium text-[#f5e6c8] shadow">{t('online.adversarioAusente', { nome: adversarioDaSala })}</p>
                )}
              </div>
            )}
          </div>
        )}

        {resultadoOverlay && tela === 'jogo' && (
          <ResultadoDaPartida
            t={t}
            fim={resultadoOverlay}
            detalhe={statusTexto}
            // contra a máquina, com conta, a vitória paga óticoins pela dificuldade (o servidor paga ao voltar ao menu)
            premio={resultadoOverlay === 'venceu' && !sala && sessao && partidaAtualRef.current?.dificuldade ? PREMIO_DA_VITORIA[partidaAtualRef.current.dificuldade] : 0}
            onNovoJogo={handleNovoJogo}
            onFechar={() => setResultadoOverlay(null)}
          />
        )}

        {promocaoPendente && (
          <div
            role="dialog"
            aria-label={t('promocao.rotulo')}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4"
          >
            <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-xl text-center">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{t('promocao.titulo')}</h3>
              <p className="text-xs text-ink-400 mb-4">{t('promocao.texto')}</p>
              <div className="grid grid-cols-4 gap-2">
                {PECAS_PROMOCAO.map(({ peca, nome, branca, preta }, i) => (
                  <button
                    key={peca}
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => resolverPromocaoRef.current?.(peca)}
                    className="flex flex-col items-center gap-1 rounded-xl border border-ink-200 py-3 transition hover:border-ink-400 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <span aria-hidden className="text-3xl leading-none text-ink-900">
                      {promocaoPendente === 'w' ? branca : preta}
                    </span>
                    <span className="text-xs font-medium text-ink-800">{t(nome)}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => resolverPromocaoRef.current?.(null)}
                className="mt-4 text-xs text-ink-400 underline hover:text-ink-600"
              >
                {t('promocao.voltar')}
              </button>
            </div>
          </div>
        )}

        {escolhendoCor && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4">
            <div className="w-full max-w-xs rounded-xl bg-surface p-4 shadow-xl text-center">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{sala ? t('online.revancheTitulo', { nome: adversarioDaSala ?? '' }) : t('cor.titulo')}</h3>
              <p className="text-xs text-ink-400 mb-4">{sala ? t('online.revancheTexto', { nome: adversarioDaSala ?? '' }) : t('cor.texto')}</p>
              {revancheFalhou && (
                <p role="alert" className="mb-3 text-xs font-medium text-rose-700">
                  {t('online.revancheErro', { nome: adversarioDaSala ?? '' })}
                </p>
              )}
              {!sala && (
                <div className="mb-4" data-dificuldade>
                  <p className="mb-1.5 text-xs font-semibold text-ink-700">{t('dificuldade.titulo')}</p>
                  <div role="radiogroup" aria-label={t('dificuldade.titulo')} className="grid grid-cols-3 gap-1.5">
                    {DIFICULDADES.map((nivel) => (
                      <button
                        key={nivel}
                        type="button"
                        role="radio"
                        aria-checked={config.dificuldade === nivel}
                        onClick={() => mudarConfig({ dificuldade: nivel })}
                        className={`rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${config.dificuldade === nivel ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:bg-ink-50'}`}
                      >
                        {t(`dificuldade.${nivel}`)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-400">{t(`dificuldade.${config.dificuldade}Dica`)}</p>
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => handleEscolherCor('w')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full border-2 border-[#b9b2a6] bg-[#f7f4ee] shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">{t('cor.brancas')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleEscolherCor('b')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full border-2 border-[#6b6358] bg-[#14110e] shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">{t('cor.pretas')}</span>
                </button>
              </div>
              <button type="button" onClick={() => setEscolhendoCor(false)} className="mt-4 text-xs text-ink-400 underline hover:text-ink-600">
                {t(tela === 'jogo' ? 'cor.voltarPartida' : 'cor.voltarMenu')}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
