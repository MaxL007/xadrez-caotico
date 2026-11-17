import { dbGetAll, dbPut, dbPutVarios } from './db'
import { makeId } from '../app/utils'
import type { Dificuldade } from '../jogo/engine'
import { relogioNovo, type RelogioSalvo, type Ritmo } from '../jogo/relogio'

const STORE_PARTIDAS = 'xadrezPartidas'
const STORE_APRENDIZADO = 'xadrezAprendizado'

export type StatusPartidaXadrez = 'EM_ANDAMENTO' | 'FINALIZADA'

export interface PartidaXadrez {
  id: string
  /** Nome de quem jogou. */
  jogador: string
  /** Cor escolhida pelo jogador nessa partida — a máquina joga sempre com a outra. */
  corJogador: 'w' | 'b'
  /** PGN completo (histórico de lances) — reconstrói o tabuleiro inteiro ao carregar. */
  pgn: string
  status: StatusPartidaXadrez
  resultado?: string
  criadaEm: number
  atualizadaEm: number
  /** Partida do antigo modo demonstração: fica de fora de tudo. */
  demonstracao?: boolean
  /** Como a máquina joga nessa partida. As de antes da escolha de dificuldade jogavam como o difícil. */
  dificuldade?: Dificuldade
  /** Partida blitz: o ritmo e quanto restava a cada lado no último lance. Sem ele, a partida não tem relógio. */
  relogio?: RelogioSalvo
  /** A posição de agora (FEN): o servidor confere com ela que a vitória terminou mesmo assim. */
  fen?: string
  /** O servidor anotou o começo desta partida contra a máquina: sem bilhete, a vitória não paga óticoins. */
  bilhete?: boolean
}

/** `ritmo`: partida blitz, com relógio. */
export function novaPartida(jogador: string, corJogador: 'w' | 'b', dificuldade: Dificuldade, ritmo?: Ritmo): PartidaXadrez {
  const agora = Date.now()
  return { id: makeId(), jogador, corJogador, pgn: '', status: 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora, dificuldade, ...(ritmo ? { relogio: relogioNovo(ritmo) } : {}) }
}

export function resultadoDaPartida(partida: PartidaXadrez): 'venceu' | 'perdeu' | 'empate' {
  if (partida.resultado?.startsWith('Você venceu')) return 'venceu'
  if (partida.resultado?.startsWith('A máquina venceu')) return 'perdeu'
  return 'empate'
}

export async function listPartidas(): Promise<PartidaXadrez[]> {
  const todas = await dbGetAll<PartidaXadrez>(STORE_PARTIDAS)
  return todas.filter((p) => !p.demonstracao).sort((a, b) => b.atualizadaEm - a.atualizadaEm)
}

export async function salvarPartida(partida: PartidaXadrez): Promise<void> {
  await dbPut(STORE_PARTIDAS, partida)
}

const paraLista = <T,>(valor: unknown): T[] => (Array.isArray(valor) ? valor : Object.values((valor ?? {}) as Record<string, T>))

/** Traz um arquivo de partidas exportado pra conta de quem está jogando. Devolve quantas vieram. */
export async function importarPartidas(texto: string, jogador: string): Promise<number> {
  const exportado = JSON.parse(texto) as { xadrezPartidas?: unknown; xadrezAprendizado?: unknown }
  const partidas = paraLista<PartidaXadrez>(exportado.xadrezPartidas)
    .filter((p) => p?.id && !p.demonstracao)
    .map((p) => ({ ...p, jogador }))
  const aprendizado = paraLista<{ id: string }>(exportado.xadrezAprendizado).filter((r) => r?.id)
  await dbPutVarios(STORE_PARTIDAS, partidas)
  await dbPutVarios(STORE_APRENDIZADO, aprendizado)
  return partidas.length
}
