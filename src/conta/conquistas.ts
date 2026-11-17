import { Chess } from 'chess.js'
import { guardarProgresso, lerConquistas, lerRecompensas, receberConquistas, receberVitorias, sessaoAtual } from '../dados/servidor'
import type { Dificuldade } from '../jogo/engine'
import { resultadoDaPartida, type PartidaXadrez } from '../dados/xadrezRepo'
import catalogo from '../catalogos/conquistas.json'

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

/** Óticoins por vitória contra a máquina, pela dificuldade (o servidor paga o mesmo). */
export const PREMIO_DA_VITORIA: Record<Dificuldade, number> = { facil: 1, intermediario: 2, dificil: 3 }

const chaveDasVitoriasPagas = (usuario: string) => `xadrezCaotico:vitoriasPagas:${usuario}`

function vitoriasPagasNoAparelho(usuario: string): string[] {
  try {
    const lidas = JSON.parse(localStorage.getItem(chaveDasVitoriasPagas(usuario)) ?? '[]') as unknown
    return Array.isArray(lidas) ? lidas.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** No máximo 3 recompensas por vitória a cada 60 minutos, em qualquer modo (o servidor confere e é quem vale). */
export const RECOMPENSAS_POR_HORA = 3
const UMA_HORA = 60 * 60 * 1000

/** Vitória contra a máquina que paga óticoins, ganha e ainda não registrada no servidor. Sem o bilhete do começo da
 * partida, o servidor não paga: nem manda. */
const vitoriaAReceber = (p: PartidaXadrez, registradas: Set<string>) =>
  !!p.dificuldade && !!p.bilhete && !p.demonstracao && p.status === 'FINALIZADA' && resultadoDaPartida(p) === 'venceu' && !registradas.has(p.id)

/**
 * Manda as vitórias contra a máquina que ainda não foram pagas (só as jogadas com dificuldade escolhida). A que ainda
 * não subiu pra nuvem fica pra próxima vez. Devolve quanto entrou agora, quantas ficaram sem prêmio pelo limite da hora
 * e o saldo, se o servidor respondeu.
 */
async function receberAsVitorias(partidas: PartidaXadrez[]): Promise<{ premio: number; semPremio: number; oticoins: number } | null> {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario) return null
  const pagas = new Set(vitoriasPagasNoAparelho(usuario))
  // as mais antigas primeiro: elas chegaram antes e ficam com as vagas da hora
  const aPagar = partidas
    .filter((p) => vitoriaAReceber(p, pagas))
    .sort((a, b) => a.atualizadaEm - b.atualizadaEm)
    .slice(0, 20)
  if (aPagar.length === 0) return null
  const resposta = await receberVitorias(aPagar.map((p) => p.id))
  for (const id of resposta.jaPagas) pagas.add(id)
  try {
    localStorage.setItem(chaveDasVitoriasPagas(usuario), JSON.stringify([...pagas]))
  } catch {
    // sem localStorage: manda de novo da próxima vez, e o servidor não paga duas vezes
  }
  return { premio: resposta.pagas.reduce((soma, p) => soma + p.oticoins, 0), semPremio: resposta.semPremio?.length ?? 0, oticoins: resposta.oticoins }
}

/** A vitória que acabou de sair paga? Sem vaga na hora, diz a partir de quando (no relógio deste aparelho) volta a pagar. */
export type RecompensaDaVitoria = { paga: true } | { paga: false; liberaEm: number } | { paga: false; semBilhete: true }

/**
 * Confere, na tela de vitória, se ela vai pagar: as recompensas que o servidor já pagou na última hora mais as vitórias
 * deste aparelho que ainda vão chegar lá antes dela. Sem conexão, conta que paga (quem decide é o servidor, depois).
 */
export async function recompensaDaVitoria(partidas: PartidaXadrez[], idDaVitoria: string): Promise<RecompensaDaVitoria> {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario) return { paga: true }
  // a partida começou sem o servidor saber (sem conexão no começo): não paga
  const vitoria = partidas.find((p) => p.id === idDaVitoria)
  if (vitoria && !vitoria.bilhete) return { paga: false, semBilhete: true }
  let recompensas: Awaited<ReturnType<typeof lerRecompensas>>
  try {
    recompensas = await lerRecompensas()
  } catch {
    return { paga: true }
  }
  const registradas = new Set(vitoriasPagasNoAparelho(usuario))
  // tudo no relógio do servidor; `diferenca` leva pro deste aparelho
  const { limite, agora } = recompensas
  const diferenca = Date.now() - agora
  const naHora = () => pagas.filter((quando) => quando > agora - UMA_HORA)
  const pagas = [...recompensas.recebidas]
  // as vitórias daqui que ainda não chegaram vão antes desta: as que acharem vaga, pagam agora
  for (const _ of partidas.filter((p) => p.id !== idDaVitoria && vitoriaAReceber(p, registradas))) {
    if (naHora().length < limite) pagas.push(agora)
  }
  const ocupadas = naHora().sort((a, b) => a - b)
  if (ocupadas.length < limite) return { paga: true }
  // libera quando sobrar menos de `limite` na última hora: quando a que ficou de fora da conta fizer uma hora
  return { paga: false, liberaEm: ocupadas[ocupadas.length - limite] + UMA_HORA + diferenca }
}

export interface SituacaoDasConquistas {
  contagem: Contagem
  /** null pra quem não entrou numa conta: as conquistas aparecem, mas não pagam. */
  oticoins: number | null
  recebidas: string[]
  /** Pagas agora, pra avisar na tela. */
  novas: Conquista[]
  /** Óticoins das vitórias contra a máquina pagas agora. */
  premioDasVitorias: number
  /** Vitórias que chegaram agora com as recompensas da hora já usadas: ficam sem prêmio. */
  vitoriasSemPremio: number
}

// o último progresso que o servidor guardou, por conta: só manda de novo quando muda
const progressoEnviado = new Map<string, string>()

/** Manda o progresso pros amigos verem no perfil. Os convites o servidor conta sozinho. */
function enviarProgresso(contagem: Contagem) {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario) return
  const { convites: _, ...doAparelho } = contagem
  const texto = JSON.stringify(doAparelho)
  if (progressoEnviado.get(usuario) === texto) return
  progressoEnviado.set(usuario, texto)
  void guardarProgresso(doAparelho).catch(() => progressoEnviado.delete(usuario))
}

/** Confere o que foi alcançado e recebe as óticoins do que ainda não foi pago. */
export async function verificarConquistas(partidas: PartidaXadrez[]): Promise<SituacaoDasConquistas> {
  const contagem = await contarPartidas(partidas)
  if (!sessaoAtual()) return { contagem, oticoins: null, recebidas: [], novas: [], premioDasVitorias: 0, vitoriasSemPremio: 0 }
  enviarProgresso(contagem)
  // as vitórias pagam antes: sem conexão, as conquistas seguem do mesmo jeito
  const vitorias = await receberAsVitorias(partidas).catch(() => null)
  const premioDasVitorias = vitorias?.premio ?? 0
  const vitoriasSemPremio = vitorias?.semPremio ?? 0
  const conta = await lerConquistas()
  contagem.convites = conta.convites
  const alcancadas = CONQUISTAS.filter((c) => contagem[c.medida] >= c.meta && !conta.recebidas.includes(c.id))
  if (alcancadas.length === 0) return { contagem, oticoins: conta.oticoins, recebidas: conta.recebidas, novas: [], premioDasVitorias, vitoriasSemPremio }
  const pagas = await receberConquistas(alcancadas.map((c) => c.id))
  return {
    contagem,
    oticoins: pagas.oticoins,
    recebidas: pagas.recebidas,
    novas: CONQUISTAS.filter((c) => pagas.novas.includes(c.id)),
    premioDasVitorias,
    vitoriasSemPremio,
  }
}
