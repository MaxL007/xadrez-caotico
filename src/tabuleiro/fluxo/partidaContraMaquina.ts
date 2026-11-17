// A partida contra a máquina: a vez dela (a pausa de "pensando", o livro de aberturas, o limite de tempo na blitz) e o
// relógio da blitz (corre só com o jogo à vista e nenhuma peça andando, para fora da partida, e o fim no tempo pelas
// regras da FIDE).
import { Chess, type Square } from 'chess.js'
import { buscarNoLivro, type LivroDeAberturas } from '../../jogo/pgnBook'
import { escolherJogadaDaMaquina, usaLivro } from '../../jogo/engine'
import { type MostradorDoRelogio } from '../RelogioDaPartida'
import { RelogioDeXadrez, semMaterialParaMate } from '../../jogo/relogio'
import { type PartidaXadrez, salvarPartida } from '../../dados/xadrezRepo'
import type { Andamento } from './andamento'

/** Pausa "pensando" da máquina antes de mover, pro ritmo geral ficar mais compassado. */
export const PAUSA_MAQUINA_MS = 700
/** Com o lance no livro não há o que calcular: só o suficiente pra resposta não vir no mesmo instante. */
const PAUSA_MAQUINA_LIVRO_MS = 200
export const EMPATE_NO_TEMPO = 'Empate (tempo esgotado, sem peças para dar mate)'

type Ref<T> = { current: T }

export interface DependenciasDaPartida {
  chessRef: Ref<Chess>
  livroRef: Ref<LivroDeAberturas>
  partidaAtualRef: Ref<PartidaXadrez | null>
  corHumanoRef: Ref<'w' | 'b'>
  relogioRef: Ref<RelogioDeXadrez | null>
  salaRef: Ref<unknown>
  resolverPromocaoRef: Ref<((peca: 'q' | 'r' | 'b' | 'n' | null) => void) | null>
  selecionadaRef: Ref<Square | null>
  destinosRef: Ref<Square[]>
  vezDaMaquinaRef: Ref<boolean>
  andamento: Andamento
  executarLanceComAnimacao: (entrada: string, aoTerminar: () => void) => void
  limparDestaques: () => void
  atualizarStatusTexto: () => void
  tocarEmpateUmaVez: () => void
  comemorarFimDaSala: (corVencedora: 'w' | 'b', motivo: string) => void
  setPartidasEmAndamento: (mudar: (antes: PartidaXadrez[]) => PartidaXadrez[]) => void
  setPartidasFinalizadas: (mudar: (antes: PartidaXadrez[]) => PartidaXadrez[]) => void
}

export function criarPartidaContraMaquina(dependencias: DependenciasDaPartida) {
  const {
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
  } = dependencias

  /** Partida do jogador encerrada por desistência, acordo ou tempo (o tabuleiro ainda teria lances legais). */
  function partidaDesistida(): boolean {
    return partidaAtualRef.current?.status === 'FINALIZADA' && !chessRef.current.isGameOver()
  }

  /** O relógio da blitz corre: partida contra a máquina em andamento, com o jogo à vista e nenhuma peça andando. */
  function relogioCorre(): boolean {
    const partida = partidaAtualRef.current
    return !!partida && partida.status !== 'FINALIZADA' && !salaRef.current && !chessRef.current.isGameOver() && andamento.lancesEmAndamento === 0 && document.visibilityState === 'visible'
  }

  /** Desconta o tempo de quem tem a vez; se zerou, a partida acaba no tempo. */
  function andarRelogioDaPartida(): MostradorDoRelogio | null {
    const relogio = relogioRef.current
    if (!relogio) return null
    const vez = chessRef.current.turn()
    const correndo = relogioCorre()
    relogio.andar(vez, correndo)
    if (correndo && relogio.restante[vez] <= 0) acabouOTempo(vez)
    return { w: relogio.restante.w, b: relogio.restante.b, vez, correndo: relogioCorre() }
  }

  /** Grava o tempo de agora na blitz em andamento (ao sair dela ou esconder o jogo): o relógio para fora da tela. */
  function guardarRelogio() {
    const partida = partidaAtualRef.current
    if (!relogioRef.current || !partida || partida.status === 'FINALIZADA' || salaRef.current) return
    andarRelogioDaPartida()
    // o tempo pode ter zerado agora: aí quem salvou foi o fim no tempo
    if ((partida.status as PartidaXadrez['status']) === 'FINALIZADA' || !relogioRef.current) return
    partida.relogio = relogioRef.current.salvo()
    salvarPartida(partida).catch(() => {
      // sem servidor no momento — fica o tempo do último lance
    })
  }
  function aoMudarVisibilidade() {
    if (document.visibilityState === 'hidden') guardarRelogio()
  }
  document.addEventListener('visibilitychange', aoMudarVisibilidade)

  /**
   * O tempo de `cor` zerou: perde, a não ser que o outro lado não consiga dar mate de jeito nenhum (aí é empate). O
   * lance que a máquina estiver pensando não sai mais, e a pergunta da promoção fecha.
   */
  function acabouOTempo(cor: 'w' | 'b') {
    const partida = partidaAtualRef.current
    const chess = chessRef.current
    if (!partida || partida.status === 'FINALIZADA') return
    const outro: 'w' | 'b' = cor === 'w' ? 'b' : 'w'
    const empatou = semMaterialParaMate(chess, outro)
    partida.status = 'FINALIZADA'
    partida.resultado = empatou ? EMPATE_NO_TEMPO : cor === corHumanoRef.current ? 'A máquina venceu (tempo)' : 'Você venceu (tempo)'
    partida.pgn = chess.pgn()
    partida.fen = chess.fen()
    partida.atualizadaEm = Date.now()
    if (relogioRef.current) partida.relogio = relogioRef.current.salvo()
    resolverPromocaoRef.current?.(null)
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
    if (empatou) tocarEmpateUmaVez()
    else comemorarFimDaSala(outro, 'tempo')
    atualizarStatusTexto()
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
    const minhaGeracao = andamento.geracao
    // as partidas de antes da escolha de dificuldade jogavam como o difícil
    const dificuldade = partidaAtualRef.current?.dificuldade ?? 'dificil'
    // na blitz a máquina também tem relógio: com pouco tempo, pensa menos e não faz a pausa de sempre
    const resta = relogioRef.current?.restante[chess.turn()]
    const limiteMs = resta === undefined ? undefined : Math.max(60, Math.min(900, resta / 30))
    const pausa = resta !== undefined && resta < 20_000 ? 100 : usaLivro(dificuldade) && buscarNoLivro(chess, livroRef.current) ? PAUSA_MAQUINA_LIVRO_MS : PAUSA_MAQUINA_MS
    window.setTimeout(async () => {
      if (minhaGeracao !== andamento.geracao) return
      const lance = await escolherJogadaDaMaquina(chess, livroRef.current, dificuldade, limiteMs)
      // outra partida (ou novo jogo) entrou enquanto a máquina pensava: esse lance era da anterior
      if (minhaGeracao !== andamento.geracao) return
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
    }, pausa)
  }

  return { partidaDesistida, andarRelogioDaPartida, guardarRelogio, aoMudarVisibilidade, jogarLanceDaMaquina }
}
