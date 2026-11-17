// Uma sala é uma partida entre duas pessoas: um Durable Object com as duas conexões ao vivo. Ele é o
// árbitro: confere de quem é a vez e se o lance é legal antes de repassar, então um jogador não
// consegue mexer as peças do outro nem fazer lance ilegal mexendo no site.
//
// Na blitz o relógio também mora aqui: cada lance desconta o tempo de quem jogou (e soma o acréscimo), e um alarme
// acorda a sala na hora em que o tempo de quem está com a vez acaba. Regras da FIDE: quem zera perde, a não ser que o
// outro não tenha peças para dar mate (empate). O primeiro lance de cada um não gasta tempo, mas precisa sair em 1 minuto.
//
// As conexões usam a hibernação da Cloudflare: entre um lance e outro a sala dorme e não consome
// nada, e o estado fica no armazenamento dela, não na memória.

import { DurableObject } from 'cloudflare:workers'
import { Chess, type Square } from 'chess.js'
import { semMaterialParaMate, temposDoRitmo, type Ritmo } from '../../src/jogo/relogio'
import type { Ambiente } from './index'
import type { Usuario } from './conta'

const SEM_LANCE_LIMITE_MS = 7 * 24 * 60 * 60 * 1000
const CONVITE_VALE_MS = 3 * 24 * 60 * 60 * 1000
/** Na blitz, o primeiro lance de cada um não gasta tempo, mas precisa sair nesse prazo. */
const PRIMEIRO_LANCE_MS = 60 * 1000
const TAMANHO_MAXIMO_MENSAGEM = 512

type Cor = 'w' | 'b'
type Status = 'aguardando' | 'andamento' | 'fim' | 'expirada' | 'recusada'
type Resultado = 'brancas' | 'pretas' | 'empate'
type Motivo = 'xeque-mate' | 'afogamento' | 'repeticao' | 'material' | 'cinquenta-lances' | 'desistencia' | 'tempo' | 'acordo'

interface RelogioDaSala {
  /** O tempo que resta a cada um, em ms, no começo da vez de agora. */
  restante: Record<Cor, number>
  /** Quando começou a vez de agora; null nos primeiros lances (que não gastam tempo) e com a partida parada. */
  desde: number | null
  acrescimoMs: number
}

interface EstadoDaSala {
  codigo: string
  brancas: Usuario | null
  pretas: Usuario | null
  corDoCriador: Cor
  fen: string
  lances: string[]
  /** Quantas vezes cada posição apareceu: é assim que se vê a repetição sem recalcular a partida. */
  posicoes: Record<string, number>
  status: Status
  resultado?: Resultado
  motivo?: Motivo
  /** Pedido de empate esperando resposta: de quem é. Cai no próximo lance. */
  empate?: Cor
  /** Em que lance cada um pediu empate pela última vez: um pedido por lance, pra ninguém insistir sem parar. */
  empatesPedidos?: Partial<Record<Cor, number>>
  /** Blitz: o ritmo e o relógio. Sem ritmo, cada lance tem 7 dias. */
  ritmo?: Ritmo
  relogio?: RelogioDaSala
  /** Partida do adversário automático: as duas pessoas não precisam ser amigas e ela começa na hora. */
  automatica?: boolean
}

function chaveDaPosicao(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export class Sala extends DurableObject<Ambiente> {
  private async ler(): Promise<EstadoDaSala | undefined> {
    return this.ctx.storage.get<EstadoDaSala>('estado')
  }

  private async gravar(estado: EstadoDaSala) {
    await this.ctx.storage.put('estado', estado)
  }

  /** Só no simulador (.dev.vars): o relógio anda mais depressa, pros testes não esperarem minutos. */
  private escala(): number {
    const escala = Number(this.env.ACELERAR_RELOGIO)
    return escala > 0 ? escala : 1
  }

  async criar(codigo: string, brancas: Usuario, pretas: Usuario, corDoCriador: Cor, opcoes: { ritmo?: Ritmo | null; automatica?: boolean } = {}) {
    const fen = new Chess().fen()
    const escala = this.escala()
    const tempos = opcoes.ritmo ? temposDoRitmo(opcoes.ritmo) : null
    const estado: EstadoDaSala = {
      codigo,
      brancas,
      pretas,
      corDoCriador,
      fen,
      lances: [],
      posicoes: { [chaveDaPosicao(fen)]: 1 },
      status: opcoes.automatica ? 'andamento' : 'aguardando',
      ...(opcoes.ritmo && tempos
        ? { ritmo: opcoes.ritmo, relogio: { restante: { w: tempos.baseMs / escala, b: tempos.baseMs / escala }, desde: null, acrescimoMs: tempos.acrescimoMs / escala } }
        : {}),
      ...(opcoes.automatica ? { automatica: true } : {}),
    }
    await this.gravar(estado)
    await this.ctx.storage.setAlarm(opcoes.automatica ? this.proximoAlarme(estado) : Date.now() + CONVITE_VALE_MS)
  }

  /** Quando a sala precisa acordar sozinha: o tempo de quem está com a vez acabando (blitz) ou os 7 dias sem lance. */
  private proximoAlarme(estado: EstadoDaSala): number {
    const relogio = estado.relogio
    if (!relogio) return Date.now() + SEM_LANCE_LIMITE_MS
    if (relogio.desde === null) return Date.now() + PRIMEIRO_LANCE_MS / this.escala()
    return relogio.desde + relogio.restante[new Chess(estado.fen).turn()]
  }

  /** Os dois lugares têm dono desde a criação: a partida começa quando o amigo chamado aceita. */
  async entrar(usuario: Usuario): Promise<{ ok: true; cor: Cor } | { ok: false; erro: 'sala-nao-existe' | 'sala-cheia' | 'sala-encerrada' }> {
    const estado = await this.ler()
    if (!estado) return { ok: false, erro: 'sala-nao-existe' }
    const cor = this.corDe(estado, usuario.id)
    if (!cor) return { ok: false, erro: 'sala-cheia' }
    if (cor === estado.corDoCriador || estado.status === 'andamento' || estado.status === 'fim') return { ok: true, cor }
    if (estado.status !== 'aguardando') return { ok: false, erro: 'sala-encerrada' }

    estado.status = 'andamento'
    await this.gravar(estado)
    await this.ctx.storage.setAlarm(this.proximoAlarme(estado))
    await this.env.DB.prepare('UPDATE salas SET status = ?1, atualizada_em = ?2 WHERE codigo = ?3').bind('andamento', Date.now(), estado.codigo).run()
    this.avisarTodos(estado)
    return { ok: true, cor }
  }

  /** Quem continua com esta partida aberta na tela fica sabendo na hora do convite pra outra. */
  avisarRevanche(autorId: string, codigo: string) {
    const texto = JSON.stringify({ t: 'revanche', codigo })
    for (const conexao of this.ctx.getWebSockets()) {
      if (this.ctx.getTags(conexao)[0] === autorId) continue
      try {
        conexao.send(texto)
      } catch {
        // conexão já caiu: o convite aparece em Amigos
      }
    }
  }

  /** O amigo chamado recusou ou quem chamou desistiu de esperar. */
  async recusar(usuarioId: string) {
    const estado = await this.ler()
    if (!estado || estado.status !== 'aguardando' || !this.corDe(estado, usuarioId)) return
    estado.status = 'recusada'
    await this.gravar(estado)
    await this.ctx.storage.deleteAlarm()
    await this.env.DB.prepare('UPDATE salas SET status = ?1, atualizada_em = ?2 WHERE codigo = ?3').bind('recusada', Date.now(), estado.codigo).run()
    this.avisarTodos(estado)
  }

  /** Só chega aqui depois de o Worker conferir a sessão: ele manda quem é em X-Usuario-Id. */
  async fetch(pedido: Request): Promise<Response> {
    const usuarioId = pedido.headers.get('X-Usuario-Id')
    const estado = await this.ler()
    if (!estado || !usuarioId || !this.corDe(estado, usuarioId)) return new Response('sem lugar nesta sala', { status: 403 })

    const par = new WebSocketPair()
    const [cliente, servidor] = Object.values(par)
    this.ctx.acceptWebSocket(servidor, [usuarioId])
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'))
    servidor.send(JSON.stringify(this.fotografia(estado, usuarioId)))
    this.avisarPresenca(estado)
    return new Response(null, { status: 101, webSocket: cliente, headers: { 'Sec-WebSocket-Protocol': 'xadrez' } })
  }

  async webSocketMessage(conexao: WebSocket, mensagem: string | ArrayBuffer) {
    if (typeof mensagem !== 'string' || mensagem.length > TAMANHO_MAXIMO_MENSAGEM) return
    let pedido: { t?: string; n?: number; de?: string; para?: string; promocao?: string; aceito?: unknown }
    try {
      pedido = JSON.parse(mensagem)
    } catch {
      return
    }
    const estado = await this.ler()
    const usuarioId = this.ctx.getTags(conexao)[0]
    if (!estado || !usuarioId) return
    const cor = this.corDe(estado, usuarioId)
    if (!cor) return

    if (pedido.t === 'lance') await this.receberLance(estado, cor, conexao, usuarioId, pedido)
    else if (pedido.t === 'desistir' && estado.status === 'andamento') await this.encerrar(estado, cor === 'w' ? 'pretas' : 'brancas', 'desistencia')
    else if (pedido.t === 'empate') await this.pedirEmpate(estado, cor)
    else if (pedido.t === 'responderEmpate') await this.responderEmpate(estado, cor, pedido.aceito === true)
  }

  /** Pede empate ao outro. Um pedido de cada vez, e no máximo um por lance de cada jogador. */
  private async pedirEmpate(estado: EstadoDaSala, cor: Cor) {
    if (estado.status !== 'andamento' || estado.empate || estado.empatesPedidos?.[cor] === estado.lances.length) return
    estado.empate = cor
    estado.empatesPedidos = { ...estado.empatesPedidos, [cor]: estado.lances.length }
    await this.gravar(estado)
    this.enviar({ t: 'empate', de: cor })
  }

  /** Só quem recebeu o pedido responde. Aceito, a partida acaba empatada por acordo. */
  private async responderEmpate(estado: EstadoDaSala, cor: Cor, aceito: boolean) {
    if (estado.status !== 'andamento' || !estado.empate || estado.empate === cor) return
    const de = estado.empate
    estado.empate = undefined
    if (aceito) return this.encerrar(estado, 'empate', 'acordo')
    await this.gravar(estado)
    this.enviar({ t: 'empateRecusado', de })
  }

  private async receberLance(estado: EstadoDaSala, cor: Cor, conexao: WebSocket, usuarioId: string, pedido: { n?: number; de?: string; para?: string; promocao?: string }) {
    const reenviar = () => conexao.send(JSON.stringify(this.fotografia(estado, usuarioId)))
    if (estado.status !== 'andamento' || pedido.n !== estado.lances.length) return reenviar()

    const chess = new Chess(estado.fen)
    if (chess.turn() !== cor) return reenviar()
    // o tempo acabou antes do lance chegar: o alarme ainda não tinha acordado a sala
    const agora = Date.now()
    const relogio = estado.relogio
    const gasto = relogio?.desde != null ? agora - relogio.desde : 0
    if (relogio && relogio.desde !== null && gasto >= relogio.restante[cor]) return this.acabouOTempo(estado, cor)
    let lance
    try {
      lance = chess.move({ from: pedido.de as Square, to: pedido.para as Square, promotion: pedido.promocao })
    } catch {
      return reenviar()
    }

    estado.fen = chess.fen()
    estado.lances.push(lance.san)
    // jogar em vez de responder recusa o empate pedido
    estado.empate = undefined
    const posicao = chaveDaPosicao(estado.fen)
    estado.posicoes[posicao] = (estado.posicoes[posicao] ?? 0) + 1
    if (relogio) {
      // o primeiro lance de cada um não gasta tempo nem ganha acréscimo; o relógio do próximo começa a partir do
      // segundo lance das brancas
      if (relogio.desde !== null) relogio.restante[cor] += relogio.acrescimoMs - gasto
      relogio.desde = estado.lances.length >= 2 ? agora : null
    }

    const fim = this.fimDePartida(chess, estado)
    if (!fim) await this.ctx.storage.setAlarm(this.proximoAlarme(estado))
    await this.gravar(estado)
    this.enviar({ t: 'lance', n: estado.lances.length - 1, de: lance.from, para: lance.to, promocao: lance.promotion, san: lance.san, relogio: this.relogioParaEnviar(estado) })
    if (fim) await this.encerrar(estado, fim.resultado, fim.motivo)
  }

  private fimDePartida(chess: Chess, estado: EstadoDaSala): { resultado: Resultado; motivo: Motivo } | null {
    if (chess.isCheckmate()) return { resultado: chess.turn() === 'w' ? 'pretas' : 'brancas', motivo: 'xeque-mate' }
    if (chess.isStalemate()) return { resultado: 'empate', motivo: 'afogamento' }
    if (chess.isInsufficientMaterial()) return { resultado: 'empate', motivo: 'material' }
    if (chess.isDrawByFiftyMoves()) return { resultado: 'empate', motivo: 'cinquenta-lances' }
    if (estado.posicoes[chaveDaPosicao(estado.fen)] >= 3) return { resultado: 'empate', motivo: 'repeticao' }
    return null
  }

  /** O tempo de `cor` zerou: perde, a não ser que o outro não tenha peças para dar mate de jeito nenhum (empate). */
  private async acabouOTempo(estado: EstadoDaSala, cor: Cor) {
    if (estado.relogio) {
      estado.relogio.restante[cor] = 0
      estado.relogio.desde = null
    }
    const outro: Cor = cor === 'w' ? 'b' : 'w'
    const empate = semMaterialParaMate(new Chess(estado.fen), outro)
    await this.encerrar(estado, empate ? 'empate' : outro === 'w' ? 'brancas' : 'pretas', 'tempo')
  }

  private async encerrar(estado: EstadoDaSala, resultado: Resultado, motivo: Motivo) {
    // o relógio para no tempo de agora
    const relogio = estado.relogio
    if (relogio && relogio.desde !== null) {
      const vez = new Chess(estado.fen).turn()
      relogio.restante[vez] = Math.max(0, relogio.restante[vez] - (Date.now() - relogio.desde))
      relogio.desde = null
    }
    estado.status = 'fim'
    estado.resultado = resultado
    estado.motivo = motivo
    await this.gravar(estado)
    await this.ctx.storage.deleteAlarm()
    await this.env.DB.prepare('UPDATE salas SET status = ?1, resultado = ?2, motivo = ?3, lances = ?4, atualizada_em = ?5 WHERE codigo = ?6')
      .bind('fim', resultado, motivo, JSON.stringify(estado.lances), Date.now(), estado.codigo)
      .run()
    this.enviar({ t: 'fim', resultado, motivo, relogio: this.relogioParaEnviar(estado) })
  }

  /** Convite sem resposta expira; partida parada perde quem está com a vez (na blitz, quando o tempo dela acaba). */
  async alarm() {
    const estado = await this.ler()
    if (!estado) return
    if (estado.status === 'aguardando') {
      estado.status = 'expirada'
      await this.gravar(estado)
      await this.env.DB.prepare('UPDATE salas SET status = ?1, atualizada_em = ?2 WHERE codigo = ?3').bind('expirada', Date.now(), estado.codigo).run()
      this.avisarTodos(estado)
    } else if (estado.status === 'andamento') {
      const vez = new Chess(estado.fen).turn()
      const relogio = estado.relogio
      // o alarme pode acordar um pouco antes da hora: aí só marca de novo
      if (relogio && relogio.desde !== null && Date.now() < relogio.desde + relogio.restante[vez] - 20) {
        await this.ctx.storage.setAlarm(relogio.desde + relogio.restante[vez])
        return
      }
      if (relogio) await this.acabouOTempo(estado, vez)
      else await this.encerrar(estado, vez === 'w' ? 'pretas' : 'brancas', 'tempo')
    }
  }

  async webSocketClose(conexao: WebSocket) {
    const estado = await this.ler()
    if (estado) this.avisarPresenca(estado, conexao)
  }

  async webSocketError(conexao: WebSocket) {
    await this.webSocketClose(conexao)
  }

  private corDe(estado: EstadoDaSala, usuarioId: string): Cor | null {
    if (estado.brancas?.id === usuarioId) return 'w'
    if (estado.pretas?.id === usuarioId) return 'b'
    return null
  }

  private conectados(saindo?: WebSocket): Set<string> {
    const ids = new Set<string>()
    for (const conexao of this.ctx.getWebSockets()) {
      if (conexao !== saindo) ids.add(this.ctx.getTags(conexao)[0])
    }
    return ids
  }

  /** O relógio como o aparelho precisa: o que resta, desde quando corre a vez de agora e a hora do servidor (o aparelho
   * calcula o que passou sem depender do relógio dele estar certo). */
  private relogioParaEnviar(estado: EstadoDaSala) {
    const relogio = estado.relogio
    return relogio ? { restante: relogio.restante, desde: relogio.desde, agora: Date.now() } : null
  }

  /** O que cada jogador vê. Só nomes: o id de quem joga não sai do servidor. */
  private fotografia(estado: EstadoDaSala, usuarioId: string, saindo?: WebSocket) {
    const cor = this.corDe(estado, usuarioId)
    const adversario = cor === 'w' ? estado.pretas : estado.brancas
    return {
      t: 'estado',
      codigo: estado.codigo,
      status: estado.status,
      brancas: estado.brancas?.nome ?? null,
      pretas: estado.pretas?.nome ?? null,
      minhaCor: cor,
      lances: estado.lances,
      resultado: estado.resultado,
      motivo: estado.motivo,
      empate: estado.status === 'andamento' ? (estado.empate ?? null) : null,
      adversarioConectado: !!adversario && this.conectados(saindo).has(adversario.id),
      ritmo: estado.ritmo ?? null,
      relogio: this.relogioParaEnviar(estado),
      automatica: !!estado.automatica,
    }
  }

  private enviar(mensagem: unknown, saindo?: WebSocket) {
    const texto = JSON.stringify(mensagem)
    for (const conexao of this.ctx.getWebSockets()) {
      if (conexao === saindo) continue
      try {
        conexao.send(texto)
      } catch {
        // conexão já caiu: quem voltar recebe o estado inteiro
      }
    }
  }

  private avisarTodos(estado: EstadoDaSala) {
    for (const conexao of this.ctx.getWebSockets()) {
      try {
        conexao.send(JSON.stringify(this.fotografia(estado, this.ctx.getTags(conexao)[0])))
      } catch {
        // conexão já caiu: quem voltar recebe o estado inteiro
      }
    }
  }

  private avisarPresenca(estado: EstadoDaSala, saindo?: WebSocket) {
    for (const conexao of this.ctx.getWebSockets()) {
      if (conexao === saindo) continue
      const usuarioId = this.ctx.getTags(conexao)[0]
      const { adversarioConectado } = this.fotografia(estado, usuarioId, saindo)
      try {
        conexao.send(JSON.stringify({ t: 'presenca', adversarioConectado }))
      } catch {
        // conexão já caiu: quem voltar recebe o estado inteiro
      }
    }
  }
}
