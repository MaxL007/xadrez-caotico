// Uma sala é uma partida entre duas pessoas: um Durable Object com as duas conexões ao vivo. Ele é o
// árbitro: confere de quem é a vez e se o lance é legal antes de repassar, então um jogador não
// consegue mexer as peças do outro nem fazer lance ilegal mexendo no site.
//
// As conexões usam a hibernação da Cloudflare: entre um lance e outro a sala dorme e não consome
// nada, e o estado fica no armazenamento dela, não na memória.

import { DurableObject } from 'cloudflare:workers'
import { Chess, type Square } from 'chess.js'
import type { Ambiente } from './index'
import type { Usuario } from './conta'

const SEM_LANCE_LIMITE_MS = 7 * 24 * 60 * 60 * 1000
const CONVITE_VALE_MS = 3 * 24 * 60 * 60 * 1000
const TAMANHO_MAXIMO_MENSAGEM = 512

type Cor = 'w' | 'b'
type Status = 'aguardando' | 'andamento' | 'fim' | 'expirada' | 'recusada'
type Resultado = 'brancas' | 'pretas' | 'empate'
type Motivo = 'xeque-mate' | 'afogamento' | 'repeticao' | 'material' | 'cinquenta-lances' | 'desistencia' | 'tempo' | 'acordo'

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

  async criar(codigo: string, brancas: Usuario, pretas: Usuario, corDoCriador: Cor) {
    const fen = new Chess().fen()
    await this.gravar({
      codigo,
      brancas,
      pretas,
      corDoCriador,
      fen,
      lances: [],
      posicoes: { [chaveDaPosicao(fen)]: 1 },
      status: 'aguardando',
    })
    await this.ctx.storage.setAlarm(Date.now() + CONVITE_VALE_MS)
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
    await this.ctx.storage.setAlarm(Date.now() + SEM_LANCE_LIMITE_MS)
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

    const fim = this.fimDePartida(chess, estado)
    if (!fim) await this.ctx.storage.setAlarm(Date.now() + SEM_LANCE_LIMITE_MS)
    await this.gravar(estado)
    this.enviar({ t: 'lance', n: estado.lances.length - 1, de: lance.from, para: lance.to, promocao: lance.promotion, san: lance.san })
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

  private async encerrar(estado: EstadoDaSala, resultado: Resultado, motivo: Motivo) {
    estado.status = 'fim'
    estado.resultado = resultado
    estado.motivo = motivo
    await this.gravar(estado)
    await this.ctx.storage.deleteAlarm()
    await this.env.DB.prepare('UPDATE salas SET status = ?1, resultado = ?2, motivo = ?3, lances = ?4, atualizada_em = ?5 WHERE codigo = ?6')
      .bind('fim', resultado, motivo, JSON.stringify(estado.lances), Date.now(), estado.codigo)
      .run()
    this.enviar({ t: 'fim', resultado, motivo })
  }

  /** Convite sem resposta expira; partida parada perde quem está com a vez. */
  async alarm() {
    const estado = await this.ler()
    if (!estado) return
    if (estado.status === 'aguardando') {
      estado.status = 'expirada'
      await this.gravar(estado)
      await this.env.DB.prepare('UPDATE salas SET status = ?1, atualizada_em = ?2 WHERE codigo = ?3').bind('expirada', Date.now(), estado.codigo).run()
      this.avisarTodos(estado)
    } else if (estado.status === 'andamento') {
      await this.encerrar(estado, new Chess(estado.fen).turn() === 'w' ? 'pretas' : 'brancas', 'tempo')
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
