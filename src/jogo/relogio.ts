import type { Chess } from 'chess.js'

// O relógio da partida blitz, pelas regras da FIDE: cada lado tem um tempo total (até 10 minutos, o que define a
// blitz) e ganha um acréscimo a cada lance que faz, a partir do primeiro (Fischer). Corre o tempo de quem tem a vez;
// quem zera perde, a não ser que o outro lado não consiga dar mate de jeito nenhum: aí é empate (artigo 6.9).
//
// Duas adaptações pro jogo, iguais pros dois lados: o relógio para enquanto a peça anda e golpeia (o lance só termina
// quando a animação acaba, como quem aperta o relógio depois de soltar a peça), e para com o jogo fora da tela.

export type Ritmo = '3+2' | '5+0' | '5+3'
/** 3+2 é o da blitz do Mundial da FIDE; 5+0 e 5+3, os mais jogados. */
export const RITMOS: Ritmo[] = ['3+2', '5+0', '5+3']
export const RITMO_PADRAO: Ritmo = '3+2'

export const ehRitmo = (valor: unknown): valor is Ritmo => typeof valor === 'string' && (RITMOS as string[]).includes(valor)

export function temposDoRitmo(ritmo: Ritmo): { baseMs: number; acrescimoMs: number } {
  const [minutos, segundos] = ritmo.split('+').map(Number)
  return { baseMs: minutos * 60_000, acrescimoMs: segundos * 1000 }
}

/** O que fica gravado na partida: o ritmo e quanto resta a cada lado. */
export interface RelogioSalvo {
  ritmo: Ritmo
  w: number
  b: number
}

export const relogioNovo = (ritmo: Ritmo): RelogioSalvo => ({ ritmo, w: temposDoRitmo(ritmo).baseMs, b: temposDoRitmo(ritmo).baseMs })

export class RelogioDeXadrez {
  readonly ritmo: Ritmo
  readonly restante: { w: number; b: number }
  private readonly acrescimoMs: number
  /** Desde quando o tempo de quem tem a vez está correndo sem ter sido descontado; null com o relógio parado. */
  private desde: number | null = null

  constructor(salvo: RelogioSalvo) {
    this.ritmo = salvo.ritmo
    this.restante = { w: salvo.w, b: salvo.b }
    this.acrescimoMs = temposDoRitmo(salvo.ritmo).acrescimoMs
  }

  /** Desconta de quem tem a vez o tempo desde a última conta, se o relógio estava correndo; `correndo` diz se continua. */
  andar(vez: 'w' | 'b', correndo: boolean, agora = performance.now()) {
    if (this.desde !== null) this.restante[vez] = Math.max(0, this.restante[vez] - (agora - this.desde))
    this.desde = correndo ? agora : null
  }

  /** Quem acabou de jogar ganha o acréscimo; o relógio para até a peça terminar de andar. */
  lance(cor: 'w' | 'b') {
    this.restante[cor] += this.acrescimoMs
    this.desde = null
  }

  salvo(): RelogioSalvo {
    return { ritmo: this.ritmo, w: Math.round(this.restante.w), b: Math.round(this.restante.b) }
  }
}

/** 2:59, e com menos de 10 segundos, 0:09.4 (os décimos contam no fim). */
export function formatarTempo(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 10_000) return `0:0${Math.floor(total / 1000)}.${Math.floor((total % 1000) / 100)}`
  const segundos = Math.ceil(total / 1000)
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

const corDaCasa = (casa: string) => (casa.charCodeAt(0) - 97 + Number(casa[1])) % 2

/**
 * O lado `cor` não consegue dar mate por nenhuma sequência de lances legais, nem com a ajuda do outro (FIDE 6.9): só o
 * rei; rei e um cavalo contra o rei sozinho; ou rei e bispos todos de uma cor de casa, com o outro lado só com o rei e
 * bispos dessa mesma cor. Com qualquer outra coisa existe um mate possível, e quem zerou o tempo perde.
 */
export function semMaterialParaMate(chess: Chess, cor: 'w' | 'b'): boolean {
  const pecas = chess.board().flat().filter((casa) => casa !== null && casa.type !== 'k')
  const minhas = pecas.filter((p) => p!.color === cor)
  const delas = pecas.filter((p) => p!.color !== cor)
  if (minhas.length === 0) return true
  if (minhas.some((p) => p!.type === 'p' || p!.type === 'q' || p!.type === 'r')) return false
  if (minhas.length === 1 && minhas[0]!.type === 'n') return delas.length === 0
  if (minhas.every((p) => p!.type === 'b')) {
    const cores = new Set(minhas.map((p) => corDaCasa(p!.square)))
    if (cores.size > 1) return false
    const [unica] = cores
    return delas.every((p) => p!.type === 'b' && corDaCasa(p!.square) === unica)
  }
  return false
}
