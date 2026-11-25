import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ouvirAvisosTocados } from '../app/notificacoes'
import { sessaoAtual } from '../dados/servidor'
import * as THREE from 'three'
import { Chess, type Square } from 'chess.js'
import { Button } from '../telas/ui/Basics'
import { useFecharComEsc } from '../app/teclaEsc'
import { carregarLivroDeAberturas, type LivroDeAberturas } from '../jogo/pgnBook'
import { maquinaAceitaEmpate } from '../jogo/engine'
import { PREMIO_DA_VITORIA, recompensaDaVitoria, RECOMPENSAS_POR_HORA, type RecompensaDaVitoria } from '../conta/conquistas'
import { type FimDaPartida, ResultadoDaPartida } from './ResultadoDaPartida'
import { type MostradorDoRelogio, RelogioDaPartida } from './RelogioDaPartida'
import { RelogioDeXadrez, type Ritmo } from '../jogo/relogio'
import { PainelDeLances } from './PainelDeLances'
import { atualizarLutas, desfazerPosesDasLutas } from './combate/lutaSemArma'
import { atualizarPuxoes, desfazerPosesDosPuxoes } from './combate/puxaoUniversal'
import { atualizarNocautes, desfazerPosesDosNocautes } from './combate/nocaute'
import { atualizarDempseys, desfazerPosesDasDempseys } from './combate/dempseyRoll'
import { atualizarEspirais, desfazerPosesDosEspirais } from './combate/espiralAbsoluto'
import { atualizarEmpurroes, desfazerPosesDosEmpurroes } from './combate/empurraoUniversal'
import { atualizarLancas, desfazerPosesDasLancas } from './combate/lancaDoCavalo'
import { desesmaecer, esmaecer } from './cena/esmaecer'
import { definirMenosMovimento, menosMovimento, type SensacaoDaPartida } from './sensacao/golpeQuePesa'
import { passarQuadro } from './sensacao/relogioDoJogo'
import { aplicarInercia, desfazerInercia } from './sensacao/inercia'
import { Vinheta } from './Vinheta'
import { abafarAmbiente, ambienteDoTabuleiro, configurarSom, definirTomDosGolpes, destravarSom, tocarSom } from '../som/sons'
import { painelDesenhando, type QualidadeXadrez, useConfigXadrez } from '../jogo/configXadrez'
import { type ChaveTexto, tradutor, type Traduzir } from '../textos/idiomas'
import { MenuXadrez } from '../telas/MenuXadrez'
import { listPartidas, novaPartida, type PartidaXadrez, resultadoDaPartida, salvarPartida } from '../dados/xadrezRepo'
import { ouvirDados } from '../dados/db'
import { pedirRevanche, recusarSala, useSessao } from '../dados/servidor'
import { type EstadoDaSala, type LanceDaSala, type ResultadoDaSala } from '../dados/salaAoVivo'
import { registrarAprendizadoDaPartida, type ResultadoPartida as ResultadoPartidaXadrez } from '../dados/xadrezAprendizadoRepo'
import { carregarPersonalizacao, ouvirPersonalizacao, personalizacaoAtual } from '../conta/personalizacao'
import { atualizarPosturas, desfazerPosturas } from './animacoes/posturas'
import { animarComemoracao, animarGestoAmigavel, animarRecusa, atualizarGestoRPG, POOL_GESTOS } from './animacoes/gestos'
import { COR_DESTINO, COR_SELECIONADA, squareToPos, squareToPosPeca } from './casas'
import { atualizarMarretadas } from './combate/marreta'
import { garantirModelosRPG, modelosRPG } from './pecas/modelosRPG'
import { buildPieceMesh } from './pecas/montarPeca'
import { assinaturaDaVestimenta, definirVestimenta, vestimenta } from './pecas/vestimenta'
import { habilidadesQuePodem, textoDoNome } from '../conta/habilidades'
import { montarExpositor, montarVitrine } from './pecas/vitrine'
import { montarCena, QUALIDADES } from './cena/montarCena'
import { criarVistaDaCamera } from './cena/vistaDaCamera'
import { andamentoNovo, type PecaPromocao } from './fluxo/andamento'
import { garantirBilhete } from '../conta/bilhete'
import { instalarGanchosDeTeste, vestimentaDeTeste } from './ganchosDeTeste'
import { criarLanceAnimado } from './fluxo/lanceAnimado'
import { cenaDaPrevia, vestimentaDaPrevia } from './fluxo/previaDaLoja'
import { criarPartidaOnline } from './fluxo/partidaOnline'
import { EscolhaDoNovoJogo } from './EscolhaDoNovoJogo'
import { MenuDoAdversario } from './MenuDoAdversario'
import { type EstadoDoEmpate, useSalaOnline } from './fluxo/useSalaOnline'
import { criarPartidaContraMaquina, PAUSA_MAQUINA_MS } from './fluxo/partidaContraMaquina'



/** Na escolha da habilidade da captura, um sinal pra cada uma (a do catálogo sem sinal fica com o brilho). */
const ICONE_DA_HABILIDADE: Record<string, string> = { retalhamento: '⚔️', puxao: '🌀', dempsey: '🥊', empurrao: '💨', espiral: '🌪️' }

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
/** O fim da blitz no relógio: "Você venceu (tempo)", "A máquina venceu (tempo)" ou este empate. */
const TEMPO = '(tempo'

/** O pedido de empate na tela: a máquina pensando, a recusa, o pedido enviado ao amigo ou o pedido dele. */

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
    /** Partida blitz: desconta o tempo de quem tem a vez e devolve o que o relógio mostra (null sem relógio). */
    andarRelogio: () => MostradorDoRelogio | null
    /** A prévia da Loja: a captura com a arma ou a habilidade, no tabuleiro da tela inicial (ver fluxo/previaDaLoja.ts). */
    verEmAcao: (item: string) => void
    pularPrevia: () => void
  } | null>(null)
  // o relógio da partida blitz contra a máquina; null nas partidas sem relógio
  const relogioRef = useRef<RelogioDeXadrez | null>(null)
  const [ritmoNaTela, setRitmoNaTela] = useState<Ritmo | null>(null)
  const andarRelogio = useCallback(() => acoesRef.current?.andarRelogio() ?? null, [])

  const [config, mudarConfig] = useConfigXadrez()
  // o tabuleiro lê as configurações e os textos fora do React, nas animações
  const configRef = useRef(config)
  configRef.current = config
  const t = useMemo(() => tradutor(config.idioma), [config.idioma])
  const tRef = useRef(t)
  tRef.current = t
  const sessao = useSessao()
  const jogador = sessao?.usuario.nome ?? t('conta.convidado')
  const [revancheFalhou, setRevancheFalhou] = useState(false)
  // a tela inicial por cima do tabuleiro, ou a partida
  const [tela, setTela] = useState<'menu' | 'jogo'>('menu')
  /** O item da Loja em prévia no tabuleiro (o menu fica escondido enquanto isso). */
  const [previa, setPrevia] = useState<string | null>(null)
  const [statusTexto, setStatusTexto] = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [partidasEmAndamento, setPartidasEmAndamento] = useState<PartidaXadrez[]>([])
  const [partidasFinalizadas, setPartidasFinalizadas] = useState<PartidaXadrez[]>([])
  // true quando ainda não há partida em andamento e o jogador precisa escolher a cor antes de
  // começar (tanto na primeira vez quanto em "Novo jogo")
  const [escolhendoCor, setEscolhendoCor] = useState(false)
  useEffect(() => {
    configurarSom({
      ligado: config.som,
      ambiente: config.ambiente,
      volume: config.volume,
      porCategoria: { efeitos: config.volumeEfeitos, passos: config.volumePassos, ambiente: config.volumeAmbiente },
    })
  }, [config.som, config.ambiente, config.volume, config.volumeEfeitos, config.volumePassos, config.volumeAmbiente])
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
  // a captura com duas ou mais habilidades equipadas: quem joga escolhe qual usar (os blocos de habilidade)
  const [habilidadesNaEscolha, setHabilidadesNaEscolha] = useState<string[] | null>(null)
  const resolverHabilidadeRef = useRef<((id: string | null) => void) | null>(null)
  useFecharComEsc(() => resolverHabilidadeRef.current?.(null), habilidadesNaEscolha !== null)
  const [resultadoOverlay, setResultadoOverlay] = useState<FimDaPartida | null>(null)
  // a vitória contra a máquina paga, ou não (3 recompensas por hora): a taça só diz depois de perguntar ao servidor
  const [recompensa, setRecompensa] = useState<RecompensaDaVitoria | null>(null)
  // partida do jogador em andamento (dá pra desistir) — atualizado a cada lance
  const [podeDesistir, setPodeDesistir] = useState(false)
  // dá pra pedir empate: partida em andamento, um pedido por lance, e contra a máquina só na sua vez
  const [podeEmpatar, setPodeEmpatar] = useState(false)
  const [empate, setEmpate] = useState<EstadoDoEmpate>(null)
  // partida contra outra pessoa (ver fluxo/useSalaOnline.ts)
  const { salaRef, sala, conectadoNaSala, revanche, fecharSala, abrirSala, aceitarRevanche: handleAceitarRevanche, recusarRevanche: handleRecusarRevanche } = useSalaOnline({
    acoesRef,
    partidaAtualRef,
    jogador,
    setEmpate,
    aoRecusada: () => handleMenu(),
  })
  // tocar no aviso de uma partida (com o jogo fechado ou em segundo plano) abre o jogo em ?sala=<código>: entra direto
  // nela. Com o jogo já aberto, o service worker manda o endereço do aviso e a tela vai pra lá
  const abrirSalaRef = useRef(abrirSala)
  abrirSalaRef.current = abrirSala
  useEffect(() => {
    const abrirDoAviso = (endereco: URL) => {
      const codigo = endereco.searchParams.get('sala')
      if (codigo && /^[A-Z0-9]{8}$/.test(codigo) && sessaoAtual()) abrirSalaRef.current(codigo)
      // o ?amigos= fica pro menu (que abre a aba Amigos)
      if (endereco.searchParams.has('amigos')) history.replaceState(history.state, '', `${location.pathname}?amigos=1`)
    }
    const aberto = new URL(location.href)
    if (aberto.searchParams.has('sala')) {
      // o endereço fica limpo (recarregar a página não volta pra partida do aviso)
      const limpo = new URL(aberto.href)
      limpo.searchParams.delete('sala')
      history.replaceState(history.state, '', limpo.href)
      abrirDoAviso(aberto)
    }
    ouvirAvisosTocados(abrirDoAviso)
  }, [])
  // a recusa some sozinha depois de um tempo
  useEffect(() => {
    if (empate?.tipo !== 'recusado') return
    const prazo = window.setTimeout(() => setEmpate(null), 6000)
    return () => window.clearTimeout(prazo)
  }, [empate])
  // a cor de quem joga, pra aba de lances dizer quem fez cada lance
  const [corDoJogador, setCorDoJogador] = useState<'w' | 'b'>('w')
  // "o golpe que pesa": a borda escurece na luta (o peso dela, de 0 a 1) e pulsa com o rei de quem joga em xeque
  const [vinhetaDaLuta, setVinhetaDaLuta] = useState<number | null>(null)
  const [emXeque, setEmXeque] = useState(false)
  useEffect(() => definirMenosMovimento(config.menosMovimento), [config.menosMovimento])
  // no xeque, o vento e a música abaixam
  useEffect(() => {
    abafarAmbiente('xeque', emXeque)
    return () => abafarAmbiente('xeque', false)
  }, [emXeque])
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false)
  // tabuleiro ocupando a tela toda (e a tela cheia do navegador, se der)
  // a tela inicial sempre ocupa a página inteira
  const ocupaATela = true
  // as conquistas contam as partidas contra a máquina, terminadas ou não; as com amigos ficam de fora
  const partidasContraMaquina = useMemo(() => [...partidasEmAndamento, ...partidasFinalizadas], [partidasEmAndamento, partidasFinalizadas])
  const partidasContraMaquinaRef = useRef(partidasContraMaquina)
  partidasContraMaquinaRef.current = partidasContraMaquina
  // a vitória contra a máquina, com conta, paga pela dificuldade, mas só 3 por hora: a taça confere antes de prometer
  useEffect(() => {
    setRecompensa(null)
    const partida = partidaAtualRef.current
    if (resultadoOverlay !== 'venceu' || sala || !sessao || !partida?.dificuldade) return
    let cancelado = false
    void recompensaDaVitoria(partidasContraMaquinaRef.current, partida.id).then((r) => {
      if (!cancelado) setRecompensa(r)
    })
    return () => {
      cancelado = true
    }
  }, [resultadoOverlay, sala, sessao])
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
    // geração do tabuleiro, lances rodando, fila da sala, comemoração e empate (ver fluxo/andamento.ts)
    const andamento = andamentoNovo()
    /** Na prévia da Loja, o que as peças vestem (o item no lugar); fora dela, null. */
    let escolhasDaPrevia: Record<string, Record<string, string>> | null = null
    /** A resolução dinâmica da qualidade baixa (ver medirQuadro): o fator sobre a resolução e a janela de quadros medida. */
    const FATOR_MINIMO = 0.7
    const QUADRO_LENTO_MS = 1000 / 24
    const QUADRO_FOLGADO_MS = 1000 / 29
    let fatorDinamico = 1
    let janela = { quadros: 0, tempo: 0 }
    let janelasFolgadas = 0
    function novoTabuleiro() {
      resolverPromocaoRef.current?.(null)
      resolverHabilidadeRef.current?.(null)
      andamento.geracao++
      andamento.lancesEmAndamento = 0
      andamento.filaDaSala = []
      andamento.habilidadesDaSala.clear()
      andamento.animandoDaSala = false
      andamento.ultimoPedidoDeEmpate = -1
      andamento.capturasSeguidas = 0
      setEmpate(null)
      sensacao.terminarLuta()
    }

    const cena = montarCena(container, configRef.current.qualidade)
    const vista = criarVistaDaCamera(cena, {
      container: () => containerRef.current,
      telaMovel: () => configRef.current.telaMovel,
      resolucao: (largura, altura) => resolucaoDoJogo(largura, altura),
    })
    const { scene, camera, renderer, controls, dirLight, squareMeshes, piecesGroup, highlightGroup, xequeMesh, xequeMat, gerarReflexoDoAmbiente } = cena
    // "o golpe que pesa": durante a captura a câmera chega perto, a borda escurece, o ambiente abaixa e os golpes saem
    // no tom da troca (ver sensacao/golpeQuePesa.ts)
    const sensacao: SensacaoDaPartida = {
      comecarLuta: (area, peso, tom) => {
        // o golpe inteiro à vista: a câmera olha de lado pras duas peças, e as outras que ainda ficarem no caminho
        // esmaecem até a luta acabar
        esmaecer(vista.enquadrarLuta(area.pontos, area.rumo, piecesGroup.children.filter((peca) => !area.envolvidas.includes(peca)), area.comeco))
        abafarAmbiente('luta', true)
        definirTomDosGolpes(tom)
        setVinhetaDaLuta(peso)
      },
      acompanharVoo: (voo) => vista.acompanharVoo(voo.pouso, voo.progresso, voo.foraDoTabuleiro),
      terminarLuta: () => {
        desesmaecer()
        vista.voltarDaLuta()
        abafarAmbiente('luta', false)
        definirTomDosGolpes(1)
        setVinhetaDaLuta(null)
      },
      linhasDeFoco: (ponto, ms) => {
        const naTela = ponto.clone().project(camera)
        foco = { x: (naTela.x + 1) / 2, y: (1 - naTela.y) / 2, inicio: performance.now(), ms, desenho: -1 }
      },
      quadroDeImpacto: (ms) => {
        if (menosMovimento()) return
        renderer.domElement.style.filter = 'invert(1) grayscale(1) contrast(2.2)'
        window.setTimeout(() => (renderer.domElement.style.filter = ''), ms)
      },
      socoNaCamera: (graus, ms) => vista.socoNaCamera(graus, ms),
      focarNaAscensao: (ponto) => {
        vista.focarNaPeca(ponto)
        abafarAmbiente('ascensao', true)
        setVinhetaDaLuta(0.55)
      },
      soltarFoco: () => {
        vista.voltarDaLuta()
        abafarAmbiente('ascensao', false)
        setVinhetaDaLuta(null)
      },
      rumoDaCamera: (ponto) => Math.atan2(camera.position.x - ponto.x, camera.position.z - ponto.z),
    }
    // as linhas de foco do anime: riscos escuros vindo das bordas da tela pro ponto do golpe, redesenhados em dois (a cada
    // 83 ms, outros riscos), sumindo no fim
    const telaDeFoco = document.createElement('canvas')
    Object.assign(telaDeFoco.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
    container.appendChild(telaDeFoco)
    let foco: { x: number; y: number; inicio: number; ms: number; desenho: number } | null = null
    function desenharFoco(agora: number) {
      if (!foco) return
      const u = (agora - foco.inicio) / foco.ms
      const ctx = telaDeFoco.getContext('2d')
      if (!ctx) return
      if (u >= 1) {
        ctx.clearRect(0, 0, telaDeFoco.width, telaDeFoco.height)
        foco = null
        return
      }
      const desenho = Math.floor((agora - foco.inicio) / (1000 / 12))
      if (desenho === foco.desenho) return
      foco.desenho = desenho
      const densidade = Math.min(2, window.devicePixelRatio || 1)
      const largura = Math.round(telaDeFoco.clientWidth * densidade)
      const altura = Math.round(telaDeFoco.clientHeight * densidade)
      if (telaDeFoco.width !== largura || telaDeFoco.height !== altura) {
        telaDeFoco.width = largura
        telaDeFoco.height = altura
      }
      ctx.clearRect(0, 0, largura, altura)
      const cx = foco.x * largura
      const cy = foco.y * altura
      const longe = Math.hypot(largura, altura)
      const livre = Math.min(largura, altura) * 0.2
      ctx.fillStyle = `rgba(18, 10, 6, ${0.5 * (1 - u * u)})`
      for (let i = 0; i < 90; i++) {
        const angulo = Math.random() * Math.PI * 2
        const grossura = (2 + Math.random() * 9) * densidade
        const ponta = livre * (1 + Math.random() * 0.9)
        const dx = Math.cos(angulo)
        const dy = Math.sin(angulo)
        ctx.beginPath()
        ctx.moveTo(cx + dx * longe - dy * grossura, cy + dy * longe + dx * grossura)
        ctx.lineTo(cx + dx * ponta, cy + dy * ponta)
        ctx.lineTo(cx + dx * longe + dy * grossura, cy + dy * longe - dx * grossura)
        ctx.closePath()
        ctx.fill()
      }
    }
    function marcarXeque() {
      const chess = chessRef.current
      const rei = chess.isCheck() ? chess.board().flat().find((c) => c && c.type === 'k' && c.color === chess.turn()) : undefined
      if (!rei) {
        xequeMesh.visible = false
        return
      }
      // o mate tem o som dele; aqui é só xeque novo, não a mesma tela sendo redesenhada
      if (!chess.isCheckmate() && (!xequeMesh.visible || xequeMesh.userData.casa !== rei.square)) {
        tocarSom('xeque')
        if (rei.color === corHumanoRef.current) {
          const { x, z } = squareToPos(rei.square)
          vista.encostarNoRei(new THREE.Vector3(x, 0, z))
        }
      }
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
      // na partida contra outra pessoa, as peças dela vestem o que ela comprou e equipou (o servidor manda)
      const adversario = escolhasDaPrevia ? {} : (salaRef.current?.estado?.vestimentaDoAdversario ?? {})
      definirVestimenta({ cor: corHumanoRef.current, escolhas: escolhasDaPrevia ?? vestimentaDeTeste ?? personalizacaoAtual().escolhas, adversario })
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
      partida.fen = chess.fen()
      partida.atualizadaEm = Date.now()
      if (relogioRef.current) partida.relogio = relogioRef.current.salvo()
      // começou sem conexão: pede o bilhete de novo (até o 2º lance)
      garantirBilhete(partida, chess.history().length)
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
    // mostra "Você venceu"/"Você perdeu" em destaque — só uma vez por mate (andamento.comemoracaoDisparada
    // só volta a false quando uma partida nova é carregada, em carregarPgn)
    function dispararComemoracaoDeXequeMate(chess: Chess) {
      if (andamento.comemoracaoDisparada) return
      andamento.comemoracaoDisparada = true

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
      if (andamento.comemoracaoDisparada) return
      andamento.comemoracaoDisparada = true
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
      if (andamento.comemoracaoDisparada) return
      andamento.comemoracaoDisparada = true
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
      setEmXeque(jogando && chess.isCheck() && chess.turn() === corHumano)
      setPodeEmpatar(
        jogando && andamento.ultimoPedidoDeEmpate !== chess.history().length && (salaAtual ? !salaAtual.empate : chess.turn() === corHumano && !vezDaMaquinaRef.current),
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
      } else if (salaAtual?.motivo === 'tempo' && salaAtual.ritmo) {
        // blitz: o relógio de alguém zerou
        const empatou = salaAtual.resultado === 'empate'
        setStatusTexto(t(empatou ? 'online.empateNoRelogio' : venciASala ? 'online.venceuNoRelogio' : 'online.perdeuNoRelogio', { nome: adversario }))
        if (empatou) tocarEmpateUmaVez()
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
      } else if (partidaDoJogador?.status === 'FINALIZADA' && partidaDoJogador.resultado?.includes(TEMPO)) {
        const fim = resultadoDaPartida(partidaDoJogador)
        setStatusTexto(t(fim === 'venceu' ? 'blitz.tempoDaMaquina' : fim === 'perdeu' ? 'blitz.seuTempo' : 'blitz.tempoSemMate'))
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

    const executarLanceComAnimacao = criarLanceAnimado({
      cena,
      pieceMeshBySquare,
      chessRef,
      partidaAtualRef,
      relogioRef,
      andamento,
      sincronizarPecas,
      salvarProgresso,
      pecasAliadasProximas,
      andarRelogioDaPartida: () => maquina.andarRelogioDaPartida(),
      setHistorico,
      sensacao,
    })

    const maquina = criarPartidaContraMaquina({
      chessRef,
      livroRef,
      partidaAtualRef,
      corHumanoRef,
      relogioRef,
      salaRef,
      resolverPromocaoRef,
      selecionadaRef,
      destinosRef,
      vezDaMaquinaRef,
      andamento,
      executarLanceComAnimacao,
      limparDestaques,
      atualizarStatusTexto,
      tocarEmpateUmaVez,
      comemorarFimDaSala,
      setPartidasEmAndamento,
      setPartidasFinalizadas,
    })

    const online = criarPartidaOnline({
      salaRef,
      chessRef,
      partidaAtualRef,
      relogioRef,
      corHumanoRef,
      selecionadaRef,
      destinosRef,
      vezDaMaquinaRef,
      andamento,
      vista,
      setRitmoNaTela,
      setTela,
      setResultadoOverlay,
      setCorDoJogador,
      novoTabuleiro,
      sincronizarPecas,
      limparDestaques,
      atualizarStatusTexto,
      comemorarFimDaSala,
      executarLanceComAnimacao,
    })


    /** Retorno ao tocar numa peça: som e, no celular, uma vibração curta. */
    function tocarToque(som: string) {
      if (!configRef.current.toque) return
      tocarSom(som)
      navigator.vibrate?.(12)
    }

    function tentarSelecionar(square: Square) {
      if (!partidaAtualRef.current || maquina.partidaDesistida()) return
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
      const jogar = (promotion?: PecaPromocao, habilidade?: string) => {
        const conexaoDaSala = salaRef.current?.conexao
        const numeroDoLance = chess.history().length
        executarLanceComAnimacao({ from: origem, to: destino, promotion, habilidade }, () => {
          atualizarStatusTexto()
          if (salaRef.current) online.processarFilaDaSala()
          else if (!chess.isGameOver()) maquina.jogarLanceDaMaquina()
        })
        conexaoDaSala?.enviarLance(numeroDoLance, origem, destino, promotion, habilidade)
      }
      // a captura de uma peça com duas ou mais habilidades: o lance só sai depois de escolher qual usar. Cancelando,
      // a peça fica onde está e a vez continua de quem ia jogar. Na partida contra outra pessoa a escolha vai junto
      // com o lance, e o adversário vê a mesma habilidade (as peças desta conta estão vestidas na tela dele)
      const escolherHabilidadeEJogar = (promotion?: PecaPromocao) => {
        const lance = chess.moves({ square: origem, verbose: true }).find((m) => m.to === destino)
        const mesh = pieceMeshBySquare.get(origem)
        const opcoes =
          lance?.captured && mesh?.userData.acoesRPG && lance.color === vestimenta.cor
            ? habilidadesQuePodem(vestimenta.escolhas[lance.piece] ?? {}, lance.piece, (mesh.userData.arma as string | undefined) ?? 'nenhuma')
            : []
        if (opcoes.length < 2) {
          // com uma só, ela vai no lance do mesmo jeito: o adversário vê a habilidade mesmo que esta conta a tenha
          // equipado depois de entrar na partida
          jogar(promotion, opcoes[0])
          return
        }
        resolverHabilidadeRef.current = (id) => {
          resolverHabilidadeRef.current = null
          setHabilidadesNaEscolha(null)
          if (id) jogar(promotion, id)
        }
        setHabilidadesNaEscolha(opcoes)
      }
      if (!chess.moves({ square: origem, verbose: true }).some((m) => m.to === destino && m.promotion)) {
        escolherHabilidadeEJogar()
        return
      }
      // o peão chegou ao outro lado: o lance só sai depois de escolher a peça. Cancelando, ele fica
      // onde está e a vez continua de quem ia jogar
      resolverPromocaoRef.current = (peca) => {
        resolverPromocaoRef.current = null
        setPromocaoPendente(null)
        if (peca) escolherHabilidadeEJogar(peca)
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

    /** A prévia acabou (ou foi pulada): o tabuleiro volta pra posição de início e a câmera pra tela inicial. */
    function encerrarPrevia() {
      if (!escolhasDaPrevia) return
      escolhasDaPrevia = null
      chessRef.current.reset()
      novoTabuleiro()
      sincronizarPecas(true)
      limparDestaques()
      setHistorico([])
      vista.irParaVistaDoMenu()
      setPrevia(null)
    }

    acoesRef.current = {
      // carrega uma partida salva (PGN) ou começa uma nova (pgn vazio) — usado tanto pra
      // retomar a partida em andamento ao abrir quanto pra começar uma partida nova depois
      carregarPgn(pgn: string, corHumano: 'w' | 'b') {
        setTela('jogo')
        andamento.comemoracaoDisparada = false
        setResultadoOverlay(null)
        // a blitz volta com o tempo que restava no último lance (o tempo fora da partida não conta)
        const relogioSalvo = partidaAtualRef.current?.relogio
        relogioRef.current = relogioSalvo ? new RelogioDeXadrez(relogioSalvo) : null
        setRitmoNaTela(relogioSalvo?.ritmo ?? null)
        const chess = chessRef.current
        corHumanoRef.current = corHumano
        setCorDoJogador(corHumano)
        vista.virarCameraPara(corHumano === 'w' ? 1 : -1)
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
        if (!chess.isGameOver() && chess.turn() !== corHumanoRef.current) maquina.jogarLanceDaMaquina()
      },
      verEmAcao(item) {
        const cenaDaLoja = cenaDaPrevia(item)
        if (!cenaDaLoja || andamento.lancesEmAndamento > 0) return
        setPrevia(item)
        escolhasDaPrevia = vestimentaDaPrevia(item, personalizacaoAtual().escolhas)
        const chess = chessRef.current
        try {
          chess.loadPgn(cenaDaLoja.pgn)
        } catch {
          chess.reset()
        }
        partidaAtualRef.current = null
        corHumanoRef.current = 'w'
        selecionadaRef.current = null
        destinosRef.current = []
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        const geracao = andamento.geracao
        const de = squareToPos(cenaDaLoja.de)
        const para = squareToPos(cenaDaLoja.para)
        const chega = vista.irParaAcao(new THREE.Vector3((de.x + para.x) / 2, 0.45, (de.z + para.z) / 2), THREE.MathUtils.degToRad(cenaDaLoja.lado))
        // a câmera chega, e a peça ataca; no fim, um instante pra ver a peça vitoriosa e volta pra Loja
        window.setTimeout(() => {
          if (geracao !== andamento.geracao) return
          executarLanceComAnimacao({ from: cenaDaLoja.de, to: cenaDaLoja.para }, () => {
            window.setTimeout(() => geracao === andamento.geracao && encerrarPrevia(), 900)
          })
        }, chega + 150)
      },
      pularPrevia: () => encerrarPrevia(),
      carregarSala: () => online.carregarSala(),
      receberEstadoDaSala: (estado) => online.receberEstadoDaSala(estado),
      receberLanceDaSala: (lance) => online.receberLanceDaSala(lance),
      receberFimDaSala: (resultado, motivo) => online.receberFimDaSala(resultado, motivo),
      // volta pra tela inicial: as peças na posição de início, vistas de lado. A partida que estava
      // aberta continua salva, a cada lance, e volta pelo "Continuar partida"
      mostrarMenu() {
        // a blitz em andamento guarda o tempo de agora: o relógio para fora da partida e volta daqui no "Continuar"
        maquina.guardarRelogio()
        relogioRef.current = null
        setRitmoNaTela(null)
        partidaAtualRef.current = null
        corHumanoRef.current = 'w'
        andamento.comemoracaoDisparada = false
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
        vista.irParaVistaDoMenu()
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
        if (!andamento.comemoracaoDisparada) {
          andamento.comemoracaoDisparada = true
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
        if (!partida || partida.status === 'FINALIZADA' || chess.isGameOver() || andamento.ultimoPedidoDeEmpate === noLance) return
        if (salaRef.current) {
          andamento.ultimoPedidoDeEmpate = noLance
          salaRef.current.conexao.pedirEmpate()
          atualizarStatusTexto()
          return
        }
        if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) return
        andamento.ultimoPedidoDeEmpate = noLance
        setEmpate({ tipo: 'pensando' })
        atualizarStatusTexto()
        const minhaGeracao = andamento.geracao
        window.setTimeout(() => {
          // outra partida entrou, ou a pessoa jogou enquanto a máquina pensava: o pedido era de outra posição
          if (minhaGeracao !== andamento.geracao || partida.status === 'FINALIZADA' || chess.history().length !== noLance) {
            if (minhaGeracao === andamento.geracao) setEmpate(null)
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
      aplicarTelaMovel: vista.liberarCamera,
      revestir: () => sincronizarPecas(),
      // a blitz entre pessoas mostra o relógio do servidor; contra a máquina, o deste aparelho
      andarRelogio: () => online.mostradorDaSala() ?? maquina.andarRelogioDaPartida(),
    }

    sincronizarPecas()
    atualizarStatusTexto()

    // os modelos RPG das peças carregam em segundo plano — quando (e se) chegarem, re-sincroniza
    // pra trocar as peças já desenhadas (geométricas) pelos modelos novos, sem recarregar a página
    let montado = true
    garantirModelosRPG(() => {
      if (montado) sincronizarPecas()
    })

    // a resolução dinâmica (qualidade baixa): a cada janela de quadros, se o aparelho não segura ~24 por segundo a
    // resolução desce um degrau (até 70%); com folga por várias janelas seguidas, sobe de volta. Assim o celular fraco
    // fica nítido quando dá e fluido quando aperta (uma luta com muitos efeitos), sem a pessoa mexer em nada
    // (o fator e as janelas ficam no começo do efeito: a vista pode pedir a resolução a qualquer momento)
    function medirQuadro(intervalo: number) {
      if (!QUALIDADES[configRef.current.qualidade].resolucaoDinamica) return
      // a aba em segundo plano (ou a página travada um instante) não conta
      if (intervalo <= 0 || intervalo > 250) return
      janela.quadros++
      janela.tempo += intervalo
      if (janela.quadros < 45) return
      const media = janela.tempo / janela.quadros
      janela = { quadros: 0, tempo: 0 }
      let novo = fatorDinamico
      if (media > QUADRO_LENTO_MS) {
        janelasFolgadas = 0
        novo = Math.max(FATOR_MINIMO, fatorDinamico - 0.1)
      } else if (media < QUADRO_FOLGADO_MS && ++janelasFolgadas >= 3) {
        janelasFolgadas = 0
        novo = Math.min(1, fatorDinamico + 0.1)
      }
      if (Math.abs(novo - fatorDinamico) < 0.001) return
      fatorDinamico = novo
      // só a resolução: o onResize da vista também reenquadra a câmera, o que não cabe no meio da partida
      const el = containerRef.current
      if (!el || !el.clientWidth || !el.clientHeight) return
      renderer.setPixelRatio(resolucaoDoJogo(el.clientWidth, el.clientHeight))
      renderer.setSize(el.clientWidth, el.clientHeight, false)
    }

    /** Resolução que vale agora, pela qualidade escolhida (e, na baixa, o ajuste dinâmico ao aparelho). */
    function resolucaoDoJogo(largura: number, altura: number): number {
      const qualidade = QUALIDADES[configRef.current.qualidade]
      return qualidade.resolucao(largura, altura) * (qualidade.resolucaoDinamica ? fatorDinamico : 1)
    }

    function aplicarQualidade(qualidade: QualidadeXadrez) {
      fatorDinamico = 1
      janela = { quadros: 0, tempo: 0 }
      janelasFolgadas = 0
      const { sombras } = QUALIDADES[qualidade]
      dirLight.castShadow = sombras > 0
      if (sombras > 0 && dirLight.shadow.mapSize.x !== sombras) {
        dirLight.shadow.mapSize.set(sombras, sombras)
        dirLight.shadow.map?.dispose()
        dirLight.shadow.map = null
      }
      vista.onResize()
    }

    const relogio = new THREE.Clock()
    let frameId = 0
    let ultimoQuadro = 0
    function animate() {
      frameId = requestAnimationFrame(animate)
      // na qualidade leve, no máximo 30 quadros por segundo: metade do trabalho pro aparelho fraco. O tempo que passou
      // entra todo no quadro seguinte, então as animações andam no mesmo ritmo
      // com a Loja ou a Personalização desenhando por cima, o tabuleiro é só o fundo: 20 por segundo bastam, e a placa
      // de vídeo fica pro painel
      const atrasDoPainel = painelDesenhando()
      const teto = atrasDoPainel ? 20 : QUALIDADES[configRef.current.qualidade].quadrosPorSegundo
      const agoraDoQuadro = performance.now()
      if (teto && agoraDoQuadro - ultimoQuadro < 1000 / teto - 2) return
      // o ritmo reduzido de propósito não conta como aparelho lento
      if (!atrasDoPainel) medirQuadro(agoraDoQuadro - ultimoQuadro)
      ultimoQuadro = agoraDoQuadro
      const delta = relogio.getDelta()
      const agora = performance.now()
      // o relógio do corpo das peças para no congelamento do impacto ("o golpe que pesa"): os clipes não andam, e a
      // luta, a marreta e o puxão ficam no quadro do acerto
      const { agora: agoraDoCorpo, congelado } = passarQuadro(agora)
      // as poses saem na ordem contrária à que entraram (a última posta é a primeira tirada)
      desfazerInercia()
      desfazerPosturas()
      desfazerPosesDosNocautes()
      desfazerPosesDosEspirais()
      desfazerPosesDosEmpurroes()
      desfazerPosesDasLancas()
      desfazerPosesDosPuxoes()
      desfazerPosesDasDempseys()
      desfazerPosesDasLutas()
      for (const peca of piecesGroup.children) {
        if (!congelado) (peca.userData.mixer as THREE.AnimationMixer | undefined)?.update(delta)
        atualizarGestoRPG(peca, agora)
      }
      atualizarMarretadas(agoraDoCorpo)
      atualizarLutas(agoraDoCorpo)
      atualizarDempseys(agoraDoCorpo)
      atualizarPuxoes(agoraDoCorpo)
      atualizarLancas(agoraDoCorpo)
      atualizarEmpurroes(agoraDoCorpo)
      atualizarEspirais(agoraDoCorpo)
      atualizarNocautes(agoraDoCorpo)
      atualizarPosturas(agora)
      // a inércia é a última pose: o tronco inclinando ao andar e balançando ao parar
      aplicarInercia(piecesGroup.children, congelado ? 0 : delta)
      vista.atualizarGiroCamera(agora)
      vista.atualizarAproximacao(agora)
      desenharFoco(agora)
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

    window.addEventListener('resize', vista.onResize)
    // só no desenvolvimento: os testes conferem o que está dentro do desenho 3D (casa em xeque, câmera)
    if (import.meta.env.DEV) {
      instalarGanchosDeTeste({
        cena,
        vista,
        pieceMeshBySquare,
        andamento,
        chessRef,
        livroRef,
        partidaAtualRef,
        corHumanoRef,
        relogioRef,
        vezDaMaquinaRef,
        salaRef,
        resolverPromocaoRef,
        resolverHabilidadeRef,
        carregarPgn: (pgn, cor) => acoesRef.current?.carregarPgn(pgn, cor),
        sincronizarPecas: () => sincronizarPecas(),
        tentarSelecionar,
        tentarMover,
      })
    }
    // o espaço do tabuleiro também muda sem a janela mudar — recolher/abrir o menu, tela cheia
    const observador = new ResizeObserver(() => vista.onResize())
    observador.observe(container)
    vista.onResize()
    vista.irParaVistaDoMenu(true)

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
      if (andamento.lancesEmAndamento > 0) {
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
      window.removeEventListener('resize', vista.onResize)
      document.removeEventListener('visibilitychange', maquina.aoMudarVisibilidade)
      observador.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('webglcontextrestored', gerarReflexoDoAmbiente)
      cancelAnimationFrame(frameId)
      controls.dispose()
      cena.descartarReflexo()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      container.removeChild(telaDeFoco)
    }
    // a ref da sala vem do useSalaOnline: é a mesma em todas as renderizações, então o efeito roda uma vez só
  }, [salaRef])


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

  // não existe tela normal: o jogo ocupa sempre a página inteira. A tela cheia do navegador não é pedida: o Chrome do
  // celular põe embaixo, toda vez que ela entra, o aviso "Para sair da tela cheia, arraste…", e nenhuma página consegue
  // tirar. Instalado, o jogo já abre sem barras (`display: fullscreen` no manifest), sem esse aviso

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
    const nova = novaPartida(jogador, cor, config.dificuldade, config.modo === 'blitz' ? config.ritmo : undefined)
    try {
      await salvarPartida(nova)
    } catch {
      // sem servidor — segue mesmo assim, só não fica persistido até a conexão voltar
    }
    partidaAtualRef.current = nova
    // o servidor anota o começo da partida: é o que deixa a vitória pagar óticoins
    garantirBilhete(nova, 0)
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
          className={ocupaATela ? 'relative h-full w-full touch-none' : 'relative w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden border border-ink-100 touch-none'}
        />

        {tela === 'menu' && previa && (
          // a prévia da Loja: o que está passando e o botão de pular
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <p className="rounded-lg bg-[#1c120a]/85 px-3 py-1.5 text-sm font-semibold text-[#f5e6c8] shadow" data-previa={previa}>
              ▶ {t('loja.previa')} · {t(`personalizacao.opcao.${previa.split(':')[2]}` as ChaveTexto)}
            </p>
            <button type="button" onClick={() => acoesRef.current?.pularPrevia()} className="pointer-events-auto rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow">
              {t('loja.pular')}
            </button>
          </div>
        )}
        {tela === 'menu' && previa && <Vinheta luta={vinhetaDaLuta} xeque={false} calma={config.menosMovimento || menosMovimento()} />}

        {tela === 'menu' && (
          <MenuXadrez
            escondido={previa !== null}
            onVerEmAcao={(item) => acoesRef.current?.verEmAcao(item)}
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

        {tela === 'jogo' && <Vinheta luta={vinhetaDaLuta} xeque={emXeque} calma={config.menosMovimento || menosMovimento()} />}
        {tela === 'jogo' && config.registro && <PainelDeLances t={t} lances={historico} brancas={nomeDoLado('w')} pretas={nomeDoLado('b')} />}

        {tela === 'jogo' && (
          // por cima do tabuleiro, no alto: o menu no canto, com as ações da partida logo abaixo. A situação da partida
          // fica embaixo, longe das peças
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="pointer-events-auto flex items-start justify-between gap-2">
              <button type="button" onClick={handleMenu} className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow backdrop-blur">
                {t('menu.menu')}
              </button>
              {/* a blitz: o relógio no canto de cima, o da máquina em cima e o seu embaixo */}
              {ritmoNaTela && <RelogioDaPartida t={t} ritmo={ritmoNaTela} corDoJogador={corDoJogador} andar={andarRelogio} adversario={adversarioDaSala} />}
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
                {adversarioDaSala && sala && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1.5">
                      <p className="rounded-lg bg-white/70 px-2.5 py-0.5 text-center text-xs font-medium text-[#5a4630] shadow" data-adversario>
                        {t('online.contra', { nome: adversarioDaSala })}
                      </p>
                      {/* bloquear e denunciar: some com o convite ainda esperando resposta */}
                      {sala.status !== 'aguardando' && <MenuDoAdversario key={sala.codigo} t={t} codigo={sala.codigo} nome={adversarioDaSala} />}
                    </span>
                  </div>
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
            // contra a máquina, com conta, a vitória paga óticoins pela dificuldade (o servidor paga ao voltar ao menu), no
            // máximo 3 por hora: sem vaga, a taça diz a que horas volta a pagar
            premio={recompensa?.paga && partidaAtualRef.current?.dificuldade ? PREMIO_DA_VITORIA[partidaAtualRef.current.dificuldade] : 0}
            semPremio={recompensa && !recompensa.paga ? ('semBilhete' in recompensa ? { semBilhete: true } : { limite: RECOMPENSAS_POR_HORA, liberaEm: recompensa.liberaEm }) : null}
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

        {habilidadesNaEscolha && (
          <div role="dialog" aria-label={t('habilidade.escolher')} className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl bg-[#1c120a] p-4 text-center text-[#f5e6c8] shadow-xl ring-1 ring-[#c9a24a]/60" data-escolha-de-habilidade>
              <h3 className="mb-1 font-display text-base font-semibold">{t('habilidade.escolher')}</h3>
              <p className="mb-4 text-xs text-[#c9b48a]">{t('habilidade.escolherTexto')}</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${habilidadesNaEscolha.length}, minmax(0, 1fr))` }}>
                {habilidadesNaEscolha.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => resolverHabilidadeRef.current?.(id)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-[#c9a24a]/60 px-2 py-3 transition hover:bg-[#3a2614] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c675]"
                    data-escolher-habilidade={id}
                  >
                    <span aria-hidden className="text-2xl leading-none">
                      {ICONE_DA_HABILIDADE[id] ?? '✨'}
                    </span>
                    <span className="text-xs font-semibold">{t(textoDoNome(id))}</span>
                    <span className="text-[0.6rem] text-[#c9b48a]">{t('habilidade.bloco', { n: i + 1 })}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => resolverHabilidadeRef.current?.(null)} className="mt-4 text-xs text-[#c9b48a] underline hover:text-[#f5e6c8]">
                {t('promocao.voltar')}
              </button>
            </div>
          </div>
        )}

        {escolhendoCor && (
          <EscolhaDoNovoJogo
            t={t}
            config={config}
            mudarConfig={mudarConfig}
            adversario={sala ? (adversarioDaSala ?? '') : null}
            revancheFalhou={revancheFalhou}
            emPartida={tela === 'jogo'}
            onEscolher={(cor) => void handleEscolherCor(cor)}
            onVoltar={() => setEscolhendoCor(false)}
          />
        )}
      </div>

    </div>
  )
}
