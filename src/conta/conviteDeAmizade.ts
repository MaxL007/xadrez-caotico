import { useSyncExternalStore } from 'react'
import { ErroDoServidor, ouvirSessao, receberConvite, sessaoAtual, verConvite, type Jogador } from '../dados/servidor'

// Convite de amizade por link e por QR Code. O link leva o código fixo de quem convida (?convite=...), e o QR Code é o
// mesmo link: a câmera do celular abre o site, a câmera do jogo lê na aba Amigos. O código fica guardado no aparelho até
// haver uma conta aberta (na hora, ou depois de entrar ou criar uma); aí o pedido de amizade chega pra ela, e a tela
// inicial avisa como avisa qualquer pedido de amizade.

const CHAVE = 'xadrezCaotico:convite'
const FORMATO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/

export type ResultadoDoConvite =
  /** O pedido chegou: falta confirmar ou recusar na aba Amigos. */
  | { tipo: 'pedido'; de: Jogador }
  /** A pessoa já tinha convidado o dono do link: os dois viraram amigos. */
  | { tipo: 'amigos'; de: Jogador }
  /** Falta entrar ou criar a conta; o convite fica guardado. */
  | { tipo: 'semConta'; de: Jogador }
  | { tipo: 'jaAmigos' | 'proprio' | 'invalido' | 'semConexao' }

interface Estado {
  codigo: string | null
  /** O que a tela inicial avisa sobre o último convite. */
  aviso: ResultadoDoConvite | null
}

function lerGuardado(): string | null {
  try {
    const codigo = localStorage.getItem(CHAVE)
    return codigo && FORMATO.test(codigo) ? codigo : null
  } catch {
    return null
  }
}

function guardar(codigo: string | null) {
  try {
    if (codigo) localStorage.setItem(CHAVE, codigo)
    else localStorage.removeItem(CHAVE)
  } catch {
    // sem localStorage o convite vale só até fechar a página
  }
}

let estado: Estado = { codigo: lerGuardado(), aviso: null }
const ouvintes = new Set<() => void>()

function mudarEstado(mudanca: Partial<Estado>) {
  estado = { ...estado, ...mudanca }
  guardar(estado.codigo)
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function useConviteDeAmizade() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
    () => estado,
  )
}

/** O código de um link de convite, ou o próprio código, num texto (o que a câmera leu, por exemplo). */
export function codigoDoConvite(texto: string): string | null {
  const limpo = texto.trim()
  if (FORMATO.test(limpo)) return limpo
  try {
    const codigo = new URL(limpo).searchParams.get('convite')
    return codigo && FORMATO.test(codigo) ? codigo : null
  } catch {
    return null
  }
}

/** O link que a pessoa manda: abre o jogo com o convite dela. */
export const linkDoConvite = (codigo: string) => `${window.location.origin}${import.meta.env.BASE_URL}?convite=${codigo}`

let emAndamento: Promise<ResultadoDoConvite | null> | null = null

/** Leva o convite guardado adiante: com conta, o pedido chega; sem conta, só descobre quem convidou. */
function processar(): Promise<ResultadoDoConvite | null> {
  emAndamento ??= (async (): Promise<ResultadoDoConvite | null> => {
    const codigo = estado.codigo
    if (!codigo) return null
    let resultado: ResultadoDoConvite
    try {
      if (sessaoAtual()) {
        const { status, ...de } = await receberConvite(codigo)
        resultado = { tipo: status === 'aceita' ? 'amigos' : 'pedido', de }
      } else {
        resultado = { tipo: 'semConta', de: await verConvite(codigo) }
      }
    } catch (falha) {
      const codigoDoErro = falha instanceof ErroDoServidor ? falha.message : ''
      if (codigoDoErro === 'ja-amigos') resultado = { tipo: 'jaAmigos' }
      else if (codigoDoErro === 'voce-mesmo') resultado = { tipo: 'proprio' }
      else if (['convite-nao-encontrado', 'convite-invalido', 'muitos-amigos'].includes(codigoDoErro)) resultado = { tipo: 'invalido' }
      // sem conexão (ou tentativas demais): o convite fica guardado e vai de novo ao entrar na conta ou abrir o jogo
      else return { tipo: 'semConexao' }
    }
    // sem conta, o convite espera a pessoa entrar
    mudarEstado({ codigo: resultado.tipo === 'semConta' ? codigo : null, aviso: resultado })
    return resultado
  })().finally(() => {
    emAndamento = null
  })
  return emAndamento
}

/** Ao abrir o jogo: guarda o convite do link e tira ele do endereço, pra não valer de novo ao recarregar. */
export function iniciarConvites() {
  const endereco = new URL(window.location.href)
  const codigo = endereco.searchParams.get('convite')
  if (codigo !== null) {
    endereco.searchParams.delete('convite')
    window.history.replaceState(window.history.state, '', endereco.pathname + endereco.search + endereco.hash)
    if (FORMATO.test(codigo)) mudarEstado({ codigo, aviso: null })
  }
  void processar()
  // entrou ou criou a conta: o pedido chega pra ela
  ouvirSessao(() => {
    if (sessaoAtual()) void processar()
  })
}

/** Um convite lido pela câmera do jogo; null quando o texto não é convite. */
export async function receberConviteLido(texto: string): Promise<ResultadoDoConvite | null> {
  const codigo = codigoDoConvite(texto)
  if (!codigo) return null
  await emAndamento
  mudarEstado({ codigo, aviso: null })
  return processar()
}

export function dispensarAvisoDoConvite() {
  mudarEstado({ aviso: null })
}

// --- pedidos de amizade já avisados na tela inicial ------------------------------------------
const chaveDosAvisados = (usuarioId: string) => `xadrezCaotico:pedidosAvisados:${usuarioId}`

export function pedidosAvisados(usuarioId: string): string[] {
  try {
    const lidos = JSON.parse(localStorage.getItem(chaveDosAvisados(usuarioId)) ?? '[]') as unknown
    return Array.isArray(lidos) ? lidos.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Guarda só os pedidos ainda abertos, pra lista não crescer pra sempre. */
export function guardarPedidosAvisados(usuarioId: string, ids: string[]) {
  try {
    localStorage.setItem(chaveDosAvisados(usuarioId), JSON.stringify(ids))
  } catch {
    // sem localStorage o aviso volta ao recarregar
  }
}
