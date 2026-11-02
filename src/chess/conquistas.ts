import { Chess } from 'chess.js'
import { lerConquistas, receberConquistas, sessaoAtual } from '../db/servidor'
import { resultadoDaPartida, type PartidaXadrez } from '../db/xadrezRepo'
import catalogo from './conquistas.json'

// Conquistas e óticoins. Só contam as partidas contra a máquina: as com amigos ficam de fora. Capturas, xeques, roques
// e vitórias saem das partidas salvas na conta; os convites aceitos, o servidor conta. Cada conquista paga uma vez só,
// e quem guarda o que já foi pago é o servidor.

export type Medida = 'peoes' | 'torres' | 'cavalos' | 'bispos' | 'rainhas' | 'roques' | 'xeques' | 'vitorias' | 'convites'
export type Nivel = 'basicas' | 'intermediarias' | 'avancadas'

export interface Conquista {
  id: string
  nivel: Nivel
  medida: Medida
  meta: number
  oticoins: number
}

export const NIVEIS = catalogo.niveis as Nivel[]
export const CONQUISTAS = catalogo.conquistas as Conquista[]

export type Contagem = Record<Medida, number>

const CAPTURADA: Record<string, Medida> = { p: 'peoes', r: 'torres', n: 'cavalos', b: 'bispos', q: 'rainhas' }
const vazia = (): Contagem => ({ peoes: 0, torres: 0, cavalos: 0, bispos: 0, rainhas: 0, roques: 0, xeques: 0, vitorias: 0, convites: 0 })

// refazer uma partida custa: cada uma é contada uma vez só, enquanto não muda
const contadas = new Map<string, Contagem>()

function contarPartida(partida: PartidaXadrez): Contagem {
  const chave = `${partida.id}:${partida.pgn.length}:${partida.status}`
  const pronta = contadas.get(chave)
  if (pronta) return pronta
  const contagem = vazia()
  try {
    const chess = new Chess()
    if (partida.pgn) chess.loadPgn(partida.pgn)
    for (const lance of chess.history({ verbose: true })) {
      if (lance.color !== partida.corJogador) continue
      const capturada = lance.captured && CAPTURADA[lance.captured]
      if (capturada) contagem[capturada]++
      if (/[kq]/.test(lance.flags)) contagem.roques++
      if (/[+#]$/.test(lance.san)) contagem.xeques++
    }
  } catch {
    // partida com PGN estragado não conta
  }
  if (partida.status === 'FINALIZADA' && resultadoDaPartida(partida) === 'venceu') contagem.vitorias++
  contadas.set(chave, contagem)
  return contagem
}

/** Soma as partidas contra a máquina, dando uma folga ao navegador a cada punhado. */
export async function contarPartidas(partidas: PartidaXadrez[]): Promise<Contagem> {
  const total = vazia()
  for (const [i, partida] of partidas.entries()) {
    const contagem = contarPartida(partida)
    for (const medida of Object.keys(total) as Medida[]) total[medida] += contagem[medida]
    if (i % 25 === 24) await new Promise((pronto) => setTimeout(pronto))
  }
  return total
}

export interface SituacaoDasConquistas {
  contagem: Contagem
  /** null pra quem não entrou numa conta: as conquistas aparecem, mas não pagam. */
  oticoins: number | null
  recebidas: string[]
  /** Pagas agora, pra avisar na tela. */
  novas: Conquista[]
}

/** Confere o que foi alcançado e recebe as óticoins do que ainda não foi pago. */
export async function verificarConquistas(partidas: PartidaXadrez[]): Promise<SituacaoDasConquistas> {
  const contagem = await contarPartidas(partidas)
  if (!sessaoAtual()) return { contagem, oticoins: null, recebidas: [], novas: [] }
  const conta = await lerConquistas()
  contagem.convites = conta.convites
  const alcancadas = CONQUISTAS.filter((c) => contagem[c.medida] >= c.meta && !conta.recebidas.includes(c.id))
  if (alcancadas.length === 0) return { contagem, oticoins: conta.oticoins, recebidas: conta.recebidas, novas: [] }
  const pagas = await receberConquistas(alcancadas.map((c) => c.id))
  return {
    contagem,
    oticoins: pagas.oticoins,
    recebidas: pagas.recebidas,
    novas: CONQUISTAS.filter((c) => pagas.novas.includes(c.id)),
  }
}
