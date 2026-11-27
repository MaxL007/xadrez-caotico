import { chaveDosAvisos, inscreverAvisos, sairDosAvisos, sessaoAtual } from '../dados/servidor'
import type { Idioma } from '../textos/idiomas'

// Os avisos com o jogo fechado (Web Push): com eles ligados, a vez numa partida online, o fim dela, um convite pra jogar,
// um pedido de amizade e o adversário encontrado chegam como notificação do aparelho, mesmo com o jogo em segundo plano
// ou fechado. O aparelho se inscreve no serviço de push do navegador e entrega o endereço e as chaves ao servidor (que
// cifra cada aviso pra ele: ver worker/src/push.ts). Quem mostra o aviso é o service worker (scripts/aplicativo/sw.js),
// que só existe no site publicado: no desenvolvimento os avisos ficam desligados.

export type SituacaoDosAvisos = 'sem-suporte' | 'bloqueados' | 'desligados' | 'ligados'

const LIGADOS = 'xadrez:avisos'
/** A pergunta do primeiro login (pedido do usuário, 27/11): por conta, neste aparelho. */
const PERGUNTADOS = (usuario: string) => `xadrez:avisosPerguntados:${usuario}`

/** Já perguntamos se essa conta quer os avisos neste aparelho (ou ela já mexeu neles nas Configurações). */
export function avisosJaPerguntados(usuario: string): boolean {
  try {
    return localStorage.getItem(PERGUNTADOS(usuario)) === '1'
  } catch {
    // sem armazenamento, não insiste: a pessoa liga nas Configurações
    return true
  }
}

/** Não pergunta mais: daqui em diante, só nas Configurações, quando a pessoa quiser. */
export function marcarAvisosPerguntados(usuario: string) {
  try {
    localStorage.setItem(PERGUNTADOS(usuario), '1')
  } catch {
    // fica pra próxima
  }
}

/** O navegador sabe mostrar avisos com o jogo fechado (o service worker e o serviço de push). */
export function avisosSuportados(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && import.meta.env.PROD
}

/** Como estão os avisos neste aparelho. */
export async function situacaoDosAvisos(): Promise<SituacaoDosAvisos> {
  if (!avisosSuportados()) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueados'
  const registro = await navigator.serviceWorker.getRegistration()
  const inscricao = await registro?.pushManager.getSubscription()
  return inscricao && Notification.permission === 'granted' && lembrarLigados() ? 'ligados' : 'desligados'
}

function lembrarLigados(): boolean {
  try {
    return localStorage.getItem(LIGADOS) === '1'
  } catch {
    return false
  }
}

function guardarLigados(ligados: boolean) {
  try {
    if (ligados) localStorage.setItem(LIGADOS, '1')
    else localStorage.removeItem(LIGADOS)
  } catch {
    // sem armazenamento: liga de novo na próxima vez
  }
}

/** A chave pública do servidor (VAPID), em bytes, como o PushManager pede. */
function chaveEmBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const paraTexto = (chave: ArrayBuffer | null) => {
  if (!chave) return ''
  let binario = ''
  for (const b of new Uint8Array(chave)) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Entrega a inscrição ao servidor (de novo, se já estava: o idioma ou a conta podem ter mudado). */
async function entregar(inscricao: PushSubscription, idioma: Idioma) {
  await inscreverAvisos({ endpoint: inscricao.endpoint, p256dh: paraTexto(inscricao.getKey('p256dh')), auth: paraTexto(inscricao.getKey('auth')), idioma })
}

/**
 * Liga os avisos: pede a permissão (só funciona no toque de quem joga), inscreve o aparelho e entrega ao servidor.
 * Precisa da conta aberta. Devolve como ficou.
 */
export async function ligarAvisos(idioma: Idioma): Promise<SituacaoDosAvisos> {
  if (!avisosSuportados() || !sessaoAtual()) return situacaoDosAvisos()
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueados' : 'desligados'
  const { chave } = await chaveDosAvisos()
  if (!chave) return 'sem-suporte'
  const registro = await navigator.serviceWorker.ready
  const inscricao = (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chave) as BufferSource }))
  await entregar(inscricao, idioma)
  guardarLigados(true)
  return 'ligados'
}

/** Desliga os avisos neste aparelho: o servidor esquece o endereço e o navegador cancela a inscrição. */
export async function desligarAvisos(): Promise<SituacaoDosAvisos> {
  guardarLigados(false)
  if (!avisosSuportados()) return 'sem-suporte'
  const registro = await navigator.serviceWorker.getRegistration()
  const inscricao = await registro?.pushManager.getSubscription()
  if (inscricao) {
    if (sessaoAtual()) await sairDosAvisos(inscricao.endpoint).catch(() => undefined)
    await inscricao.unsubscribe().catch(() => undefined)
  }
  return situacaoDosAvisos()
}

/** Ao abrir o jogo com a conta e os avisos ligados: entrega a inscrição de novo (o navegador pode tê-la trocado, e o
 * idioma pode ter mudado). Sem permissão mais (a pessoa bloqueou nas configurações do aparelho), desliga. */
export async function manterAvisos(idioma: Idioma) {
  if (!avisosSuportados() || !sessaoAtual() || !lembrarLigados()) return
  if (Notification.permission !== 'granted') {
    guardarLigados(false)
    return
  }
  try {
    const { chave } = await chaveDosAvisos()
    if (!chave) return
    const registro = await navigator.serviceWorker.ready
    const inscricao = (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chave) as BufferSource }))
    await entregar(inscricao, idioma)
  } catch {
    // sem conexão agora: na próxima abertura
  }
}

/** Tocar num aviso com o jogo aberto: o service worker manda o endereço dele, e a tela vai pra lá. */
export function ouvirAvisosTocados(abrir: (url: URL) => void) {
  if (!avisosSuportados()) return
  navigator.serviceWorker.addEventListener('message', (evento) => {
    const dados = evento.data as { tipo?: string; url?: string } | undefined
    if (dados?.tipo === 'abrir-aviso' && typeof dados.url === 'string') abrir(new URL(dados.url))
  })
}
