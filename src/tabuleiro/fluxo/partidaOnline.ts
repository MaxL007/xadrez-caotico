// A partida contra outra pessoa, do lado do tabuleiro: monta o tabuleiro com o que o servidor mandou, confere a cada
// estado novo se está igual ao do servidor, anda com os lances do adversário um de cada vez (nunca por cima de outra
// animação) e mostra o fim por desistência ou tempo. A conexão em si fica em useSalaOnline.
import type { Chess } from 'chess.js'
import type { EstadoDaSala, LanceDaSala, ResultadoDaSala } from '../../dados/salaAoVivo'
import type { PartidaXadrez } from '../../dados/xadrezRepo'
import type { FimDaPartida } from '../ResultadoDaPartida'
import type { Ritmo, RelogioDeXadrez } from '../../jogo/relogio'
import type { VistaDaCamera } from '../cena/vistaDaCamera'
import type { MostradorDoRelogio } from '../RelogioDaPartida'
import type { Andamento } from './andamento'

type Ref<T> = { current: T }

export interface DependenciasDaPartidaOnline {
  salaRef: Ref<{ estado: EstadoDaSala | null } | null>
  chessRef: Ref<Chess>
  partidaAtualRef: Ref<PartidaXadrez | null>
  relogioRef: Ref<RelogioDeXadrez | null>
  corHumanoRef: Ref<'w' | 'b'>
  selecionadaRef: Ref<string | null>
  destinosRef: Ref<string[]>
  vezDaMaquinaRef: Ref<boolean>
  andamento: Andamento
  vista: VistaDaCamera
  setRitmoNaTela: (ritmo: Ritmo | null) => void
  setTela: (tela: 'menu' | 'jogo') => void
  setResultadoOverlay: (fim: FimDaPartida | null) => void
  setCorDoJogador: (cor: 'w' | 'b') => void
  novoTabuleiro: () => void
  sincronizarPecas: (recriar?: boolean) => void
  limparDestaques: () => void
  atualizarStatusTexto: () => void
  comemorarFimDaSala: (corVencedora: 'w' | 'b', motivo: string) => void
  executarLanceComAnimacao: (entrada: string, aoTerminar: () => void) => void
}

export function criarPartidaOnline(dependencias: DependenciasDaPartidaOnline) {
  const {
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
  } = dependencias

  /** Anda com os lances do adversário, um de cada vez e nunca por cima de outra animação. */
  function processarFilaDaSala() {
    if (andamento.animandoDaSala || andamento.lancesEmAndamento > 0) return
    const san = andamento.filaDaSala.shift()
    if (!san) return
    andamento.animandoDaSala = true
    // trava os cliques enquanto a peça do adversário anda
    vezDaMaquinaRef.current = true
    executarLanceComAnimacao(san, () => {
      andamento.animandoDaSala = false
      vezDaMaquinaRef.current = false
      atualizarStatusTexto()
      processarFilaDaSala()
    })
  }

  // partida contra outra pessoa: o tabuleiro inteiro a partir do que o servidor mandou
  function carregarSala() {
    const estado = salaRef.current?.estado
    if (!estado) return
    relogioRef.current = null
    // na blitz entre pessoas o relógio mora no servidor (ver mostradorDaSala)
    setRitmoNaTela(estado.ritmo ?? null)
    setTela('jogo')
    andamento.comemoracaoDisparada = false
    setResultadoOverlay(null)
    const chess = chessRef.current
    corHumanoRef.current = estado.minhaCor
    setCorDoJogador(estado.minhaCor)
    vista.virarCameraPara(estado.minhaCor === 'w' ? 1 : -1)
    chess.reset()
    for (const san of estado.lances) chess.move(san)
    selecionadaRef.current = null
    destinosRef.current = []
    vezDaMaquinaRef.current = false
    novoTabuleiro()
    sincronizarPecas(true)
    limparDestaques()
    atualizarStatusTexto()
  }
  // a conexão voltou ou a partida mudou de fase: confere se este tabuleiro está igual ao do servidor
  function receberEstadoDaSala(estado: EstadoDaSala) {
    const atual = salaRef.current
    if (!atual) return
    atual.estado = estado
    const local = [...chessRef.current.history(), ...andamento.filaDaSala]
    const faltaUm = estado.lances.length === local.length + 1 && local.every((san, i) => san === estado.lances[i])
    if (faltaUm) {
      andamento.filaDaSala.push(estado.lances[estado.lances.length - 1])
      processarFilaDaSala()
    } else if (estado.lances.length !== local.length || local.some((san, i) => san !== estado.lances[i])) {
      carregarSala()
    } else {
      atualizarStatusTexto()
    }
  }
  function receberLanceDaSala(lance: LanceDaSala) {
    const atual = salaRef.current
    if (!atual?.estado) return
    atual.estado = { ...atual.estado, empate: null, lances: [...atual.estado.lances.slice(0, lance.n), lance.san] }
    // o nosso próprio lance voltando: já está no tabuleiro desde o clique
    if (lance.n < chessRef.current.history().length + andamento.filaDaSala.length) return
    andamento.filaDaSala.push(lance.san)
    processarFilaDaSala()
  }
  function receberFimDaSala(resultado: ResultadoDaSala, motivo: string) {
    const atual = salaRef.current
    if (!atual?.estado) return
    atual.estado = { ...atual.estado, status: 'fim', resultado, motivo }
    if (partidaAtualRef.current) partidaAtualRef.current.status = 'FINALIZADA'
    selecionadaRef.current = null
    destinosRef.current = []
    limparDestaques()
    if ((motivo === 'desistencia' || motivo === 'tempo') && resultado !== 'empate') comemorarFimDaSala(resultado === 'brancas' ? 'w' : 'b', motivo)
    atualizarStatusTexto()
  }

  /** O que o relógio da blitz entre pessoas mostra agora: o que o servidor mandou, menos o que passou desde então na
   * vez de quem joga. null fora da blitz. */
  function mostradorDaSala(): MostradorDoRelogio | null {
    const estado = salaRef.current?.estado
    const relogio = estado?.relogio
    if (!estado?.ritmo || !relogio) return null
    const vez: 'w' | 'b' = estado.lances.length % 2 === 0 ? 'w' : 'b'
    const correndo = estado.status === 'andamento' && relogio.desde !== null
    const passou = correndo && relogio.desde !== null ? relogio.agora - relogio.desde + (Date.now() - relogio.recebidoEm) : 0
    const restante = { ...relogio.restante, [vez]: Math.max(0, relogio.restante[vez] - passou) }
    return { w: restante.w, b: restante.b, vez, correndo }
  }

  return { processarFilaDaSala, carregarSala, receberEstadoDaSala, receberLanceDaSala, receberFimDaSala, mostradorDaSala }
}
