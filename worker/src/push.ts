// As notificações com o jogo fechado (Web Push): o aparelho se inscreve no serviço de push do navegador (o do Chrome, o
// da Apple, o do Firefox), e o servidor manda o aviso pra esse endereço quando algo acontece longe da tela: o adversário
// jogou, a partida acabou, chegou um convite. O navegador mostra o aviso mesmo com o jogo em segundo plano ou fechado.
//
// Tudo com a WebCrypto, sem biblioteca:
// - a mensagem vai cifrada pro aparelho (RFC 8291, "aes128gcm"): só ele lê, o serviço de push não;
// - o servidor se identifica com um JWT assinado (VAPID, RFC 8292). A chave privada fica no segredo VAPID_PRIVADA (JWK)
//   e a pública em VAPID_PUBLICA (base64url, 65 bytes). Sem as duas (o simulador dos testes), nada é enviado.

export interface InscricaoPush {
  endpoint: string
  /** A chave pública do aparelho (base64url, 65 bytes) e o segredo de autenticação (base64url, 16 bytes). */
  p256dh: string
  auth: string
}

export interface AvisoPush {
  titulo: string
  texto: string
  /** O que abre ao tocar no aviso (relativo ao site). */
  url: string
  /** Avisos com a mesma etiqueta se substituem (a vez numa partida, por exemplo). */
  etiqueta: string
}

/** Os serviços de push conhecidos: o servidor só manda pra eles (e não pra um endereço qualquer que alguém inscreva). */
const SERVICOS_DE_PUSH = [/\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/]

export function enderecoDePushValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && SERVICOS_DE_PUSH.some((servico) => servico.test(url.hostname))
  } catch {
    return false
  }
}

const texto = new TextEncoder()

export function paraBase64Url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function deBase64Url(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (valor.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let i = 0
  for (const p of partes) {
    total.set(p, i)
    i += p.length
  }
  return total
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dados))
}

/** O HKDF de um bloco só (até 32 bytes), como a RFC 8291 usa: extrai com o sal e expande com a informação. */
async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, tamanho: number): Promise<Uint8Array> {
  const prk = await hmac(sal, ikm)
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho)
}

/**
 * Cifra a mensagem pro aparelho (RFC 8291). `chaveDoServidor` e `sal` só se passam nos testes (pra conferir com os
 * valores do exemplo da RFC); no envio de verdade são sorteados.
 */
export async function cifrar(
  mensagem: Uint8Array,
  inscricao: Pick<InscricaoPush, 'p256dh' | 'auth'>,
  teste: { chaveDoServidor?: CryptoKeyPair; sal?: Uint8Array } = {},
): Promise<Uint8Array> {
  const publicaDoAparelho = deBase64Url(inscricao.p256dh)
  const segredoDoAparelho = deBase64Url(inscricao.auth)
  const doServidor = teste.chaveDoServidor ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const publicaDoServidor = new Uint8Array((await crypto.subtle.exportKey('raw', doServidor.publicKey)) as ArrayBuffer)
  const aparelho = await crypto.subtle.importKey('raw', publicaDoAparelho, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // os tipos da Cloudflare chamam o campo de `$public`; o runtime (e o padrão da WebCrypto) usa `public`
  const troca = { name: 'ECDH', public: aparelho } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const segredoEcdh = new Uint8Array(await crypto.subtle.deriveBits(troca, doServidor.privateKey, 256))
  // a chave de entrada amarra o segredo do aparelho, a troca de chaves e as duas chaves públicas
  const ikm = await hkdf(segredoDoAparelho, segredoEcdh, juntar(texto.encode('WebPush: info\0'), publicaDoAparelho, publicaDoServidor), 32)
  const sal = teste.sal ?? crypto.getRandomValues(new Uint8Array(16))
  const chaveDoConteudo = await hkdf(sal, ikm, texto.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sal, ikm, texto.encode('Content-Encoding: nonce\0'), 12)
  // um registro só: a mensagem e o delimitador do último registro (2)
  const aes = await crypto.subtle.importKey('raw', chaveDoConteudo, { name: 'AES-GCM' }, false, ['encrypt'])
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, juntar(mensagem, new Uint8Array([2]))))
  // o cabeçalho: o sal, o tamanho do registro (4096), o tamanho da chave e a chave pública do servidor
  const cabecalho = new Uint8Array(16 + 4 + 1 + publicaDoServidor.length)
  cabecalho.set(sal, 0)
  new DataView(cabecalho.buffer).setUint32(16, 4096)
  cabecalho[20] = publicaDoServidor.length
  cabecalho.set(publicaDoServidor, 21)
  return juntar(cabecalho, cifrado)
}

/** O JWT do VAPID (RFC 8292): diz ao serviço de push quem manda, assinado com a chave privada do servidor. */
export async function jwtDoVapid(endpoint: string, chavePrivadaJwk: string, assunto: string, agora = Date.now()): Promise<string> {
  const jwk = JSON.parse(chavePrivadaJwk) as JsonWebKey
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const parte = (objeto: unknown) => paraBase64Url(texto.encode(JSON.stringify(objeto)))
  const corpo = `${parte({ typ: 'JWT', alg: 'ES256' })}.${parte({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 60 * 60, sub: assunto })}`
  // a WebCrypto já devolve a assinatura no formato do JWS (r e s, 32 bytes cada)
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, texto.encode(corpo)))
  return `${corpo}.${paraBase64Url(assinatura)}`
}

export interface ChavesDoVapid {
  VAPID_PUBLICA?: string
  VAPID_PRIVADA?: string
}

/** Quem manda os avisos, pro serviço de push: o endereço do jogo (sem e-mail de ninguém). */
const ASSUNTO = 'https://maxl007.github.io/xadrez-caotico/'

/**
 * Manda um aviso pra uma inscrição. Devolve 'ok', 'expirou' (o serviço diz que o aparelho saiu: apaga-se a inscrição)
 * ou 'falhou' (tenta-se de novo no próximo aviso).
 */
export async function enviarAviso(inscricao: InscricaoPush, aviso: AvisoPush, chaves: ChavesDoVapid): Promise<'ok' | 'expirou' | 'falhou' | 'sem-chaves'> {
  if (!chaves.VAPID_PUBLICA || !chaves.VAPID_PRIVADA) return 'sem-chaves'
  if (!enderecoDePushValido(inscricao.endpoint)) return 'expirou'
  try {
    const corpo = await cifrar(texto.encode(JSON.stringify(aviso)), inscricao)
    const jwt = await jwtDoVapid(inscricao.endpoint, chaves.VAPID_PRIVADA, ASSUNTO)
    const resposta = await fetch(inscricao.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${chaves.VAPID_PUBLICA}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // um dia no serviço de push, esperando o aparelho ligar; a vez numa partida é urgente
        TTL: String(24 * 60 * 60),
        Urgency: 'high',
        Topic: aviso.etiqueta.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'aviso',
      },
      body: corpo,
    })
    if (resposta.status === 404 || resposta.status === 410) return 'expirou'
    return resposta.ok ? 'ok' : 'falhou'
  } catch {
    return 'falhou'
  }
}

// --- os avisos de cada coisa, nos três idiomas do jogo -----------------------------------------------------------------

type Idioma = 'pt-BR' | 'en' | 'es'
export const IDIOMAS_DO_AVISO: Idioma[] = ['pt-BR', 'en', 'es']
const idiomaValido = (valor: unknown): Idioma => (IDIOMAS_DO_AVISO.includes(valor as Idioma) ? (valor as Idioma) : 'pt-BR')

/** Os acontecimentos que viram aviso, com o que cada um precisa dizer. */
export type Acontecimento =
  | { tipo: 'vez'; codigo: string; adversario: string; lance: string }
  | { tipo: 'fim'; codigo: string; adversario: string; resultado: 'venceu' | 'perdeu' | 'empate'; motivo: string }
  | { tipo: 'convite-partida'; codigo: string; amigo: string }
  | { tipo: 'pedido-amizade'; amigo: string }
  | { tipo: 'adversario-achado'; codigo: string; adversario: string }

const MOTIVOS: Record<Idioma, Record<string, string>> = {
  'pt-BR': { 'xeque-mate': 'xeque-mate', tempo: 'no tempo', desistencia: 'por desistência', afogamento: 'afogamento', repeticao: 'repetição', material: 'falta de material', 'cinquenta-lances': '50 lances', acordo: 'acordo' },
  en: { 'xeque-mate': 'checkmate', tempo: 'on time', desistencia: 'by resignation', afogamento: 'stalemate', repeticao: 'repetition', material: 'insufficient material', 'cinquenta-lances': '50 moves', acordo: 'agreement' },
  es: { 'xeque-mate': 'jaque mate', tempo: 'por tiempo', desistencia: 'por abandono', afogamento: 'ahogado', repeticao: 'repetición', material: 'material insuficiente', 'cinquenta-lances': '50 jugadas', acordo: 'acuerdo' },
}

/** O texto do aviso no idioma do aparelho. `url` é relativa ao site do jogo. */
export function avisoDe(acontecimento: Acontecimento, idioma: Idioma): AvisoPush {
  const pt = idioma === 'pt-BR'
  const en = idioma === 'en'
  const m = (motivo: string) => MOTIVOS[idioma][motivo] ?? motivo
  switch (acontecimento.tipo) {
    case 'vez':
      return {
        titulo: pt ? 'Sua vez' : en ? 'Your move' : 'Tu turno',
        texto: pt ? `${acontecimento.adversario} jogou ${acontecimento.lance}` : en ? `${acontecimento.adversario} played ${acontecimento.lance}` : `${acontecimento.adversario} jugó ${acontecimento.lance}`,
        url: `?sala=${acontecimento.codigo}`,
        etiqueta: `sala-${acontecimento.codigo}`,
      }
    case 'fim': {
      const r = acontecimento.resultado
      const titulo = r === 'venceu' ? (pt ? 'Você venceu!' : en ? 'You won!' : '¡Ganaste!') : r === 'perdeu' ? (pt ? 'Você perdeu' : en ? 'You lost' : 'Perdiste') : pt ? 'Empate' : en ? 'Draw' : 'Empate'
      const contra = pt ? `contra ${acontecimento.adversario}` : en ? `against ${acontecimento.adversario}` : `contra ${acontecimento.adversario}`
      return { titulo, texto: `${contra} · ${m(acontecimento.motivo)}`, url: `?sala=${acontecimento.codigo}`, etiqueta: `sala-${acontecimento.codigo}` }
    }
    case 'convite-partida':
      return {
        titulo: pt ? 'Convite pra jogar' : en ? 'Game invite' : 'Invitación a jugar',
        texto: pt ? `${acontecimento.amigo} chamou você pra uma partida` : en ? `${acontecimento.amigo} invited you to a game` : `${acontecimento.amigo} te invitó a una partida`,
        url: '?amigos=1',
        etiqueta: `convite-${acontecimento.codigo}`,
      }
    case 'pedido-amizade':
      return {
        titulo: pt ? 'Pedido de amizade' : en ? 'Friend request' : 'Solicitud de amistad',
        texto: pt ? `${acontecimento.amigo} quer ser seu amigo no Xadrez Caótico` : en ? `${acontecimento.amigo} wants to be your friend in Xadrez Caótico` : `${acontecimento.amigo} quiere ser tu amigo en Xadrez Caótico`,
        url: '?amigos=1',
        etiqueta: 'amizade',
      }
    case 'adversario-achado':
      return {
        titulo: pt ? 'Adversário encontrado' : en ? 'Opponent found' : 'Rival encontrado',
        texto: pt ? `Sua partida contra ${acontecimento.adversario} começou` : en ? `Your game against ${acontecimento.adversario} has started` : `Tu partida contra ${acontecimento.adversario} empezó`,
        url: `?sala=${acontecimento.codigo}`,
        etiqueta: `sala-${acontecimento.codigo}`,
      }
  }
}

export interface AmbienteDoPush extends ChavesDoVapid {
  DB: D1Database
}

/**
 * Avisa a pessoa em todos os aparelhos em que ela ligou os avisos, cada um no idioma dele. Nunca falha pra quem chamou
 * (o aviso é um extra): o que der errado fica de fora. A inscrição que o serviço diz ter expirado é apagada.
 */
export async function avisar(env: AmbienteDoPush, usuarioId: string, acontecimento: Acontecimento): Promise<void> {
  if (!env.VAPID_PUBLICA || !env.VAPID_PRIVADA) return
  try {
    const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth, idioma FROM inscricoes_push WHERE usuario_id = ?1 LIMIT 10')
      .bind(usuarioId)
      .all<InscricaoPush & { idioma: string }>()
    await Promise.all(
      results.map(async (inscricao) => {
        const resultado = await enviarAviso(inscricao, avisoDe(acontecimento, idiomaValido(inscricao.idioma)), env)
        if (resultado === 'expirou') await env.DB.prepare('DELETE FROM inscricoes_push WHERE endpoint = ?1').bind(inscricao.endpoint).run()
      }),
    )
  } catch {
    // sem a tabela (o banco ainda sem a migração) ou sem banco no momento: fica sem aviso
  }
}

export { idiomaValido }
