// Contas, senhas e sessões.
//
// A senha nunca chega aqui. O plano gratuito dá 10 ms de processamento por pedido, pouco pra um hash
// de senha, então a parte lenta roda no aparelho de quem joga: o site deriva uma chave da senha com
// 600 mil rodadas de PBKDF2 (src/conta/senha.ts) e manda só a chave. O servidor guarda um HMAC dessa
// chave com a PIMENTA, um segredo que fica na Cloudflare, fora do banco e do código. Quem levasse o
// banco não conseguiria testar senhas sem a pimenta, e com a pimenta ainda pagaria as 600 mil rodadas
// por tentativa.

import type { Ambiente } from './index'

const SESSAO_VALE_MS = 90 * 24 * 60 * 60 * 1000
const UM_DIA_MS = 24 * 60 * 60 * 1000
const CODIGO_RECUPERACAO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const codificador = new TextEncoder()

export function paraBase64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function paraBase64Url(bytes: Uint8Array): string {
  return paraBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
}

function aleatorio(tamanho: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(tamanho))
}

export function nomeDeBusca(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
}

export const nomeValido = (nome: unknown): nome is string => typeof nome === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u.test(nome.trim())

/** 32 bytes em base64: o que sai da derivação no site. */
export const chaveValida = (chave: unknown): chave is string => typeof chave === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(chave)

function chaveHmac(env: Ambiente, usos: ('sign' | 'verify')[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', codificador.encode(env.PIMENTA), { name: 'HMAC', hash: 'SHA-256' }, false, usos)
}

export async function protegerSegredo(env: Ambiente, segredo: string): Promise<{ sal: string; hash: string }> {
  const sal = paraBase64(aleatorio(16))
  const assinatura = await crypto.subtle.sign('HMAC', await chaveHmac(env, ['sign']), codificador.encode(`${sal}:${segredo}`))
  return { sal, hash: paraBase64(assinatura) }
}

/** `crypto.subtle.verify` compara em tempo constante. */
export async function segredoConfere(env: Ambiente, segredo: string, sal: string, hash: string): Promise<boolean> {
  return crypto.subtle.verify('HMAC', await chaveHmac(env, ['verify']), deBase64(hash), codificador.encode(`${sal}:${segredo}`))
}

/** Mesmo trabalho de conferir uma senha, pra uma conta que não existe não responder mais rápido. */
export async function conferirSemConta(env: Ambiente, segredo: string) {
  const { sal, hash } = await protegerSegredo(env, 'sem-conta')
  await segredoConfere(env, segredo, sal, hash)
}

export function novoCodigoDeRecuperacao(): string {
  const bytes = aleatorio(16)
  const letras = Array.from(bytes, (b) => CODIGO_RECUPERACAO[b % CODIGO_RECUPERACAO.length])
  return letras.join('').replace(/(.{4})(?=.)/g, '$1-')
}

export const codigoNormalizado = (codigo: string) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function resumoDoToken(token: string): Promise<string> {
  return paraBase64(await crypto.subtle.digest('SHA-256', codificador.encode(token)))
}

export async function criarSessao(env: Ambiente, usuarioId: string): Promise<string> {
  const token = paraBase64Url(aleatorio(32))
  const agora = Date.now()
  await env.DB.prepare('INSERT INTO sessoes (resumo, usuario_id, criada_em, usada_em) VALUES (?1, ?2, ?3, ?3)').bind(await resumoDoToken(token), usuarioId, agora).run()
  return token
}

export interface Usuario {
  id: string
  nome: string
}

export async function usuarioDoToken(env: Ambiente, token: string | null): Promise<Usuario | null> {
  if (!token) return null
  const resumo = await resumoDoToken(token)
  const linha = await env.DB.prepare('SELECT u.id, u.nome, s.usada_em FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.resumo = ?1')
    .bind(resumo)
    .first<{ id: string; nome: string; usada_em: number }>()
  if (!linha) return null
  const agora = Date.now()
  if (agora - linha.usada_em > SESSAO_VALE_MS) {
    await env.DB.prepare('DELETE FROM sessoes WHERE resumo = ?1').bind(resumo).run()
    return null
  }
  // grava no máximo uma vez por dia: serve só pra sessão esquecida vencer
  if (agora - linha.usada_em > UM_DIA_MS) await env.DB.prepare('UPDATE sessoes SET usada_em = ?1 WHERE resumo = ?2').bind(agora, resumo).run()
  return { id: linha.id, nome: linha.nome }
}

export async function encerrarSessao(env: Ambiente, token: string) {
  await env.DB.prepare('DELETE FROM sessoes WHERE resumo = ?1').bind(await resumoDoToken(token)).run()
}

/** Soma uma tentativa na janela e devolve quantas já houve. */
export async function somarTentativa(env: Ambiente, chave: string, janelaMs: number): Promise<number> {
  const agora = Date.now()
  const linha = await env.DB.prepare(
    `INSERT INTO tentativas (chave, contagem, expira_em) VALUES (?1, 1, ?2)
     ON CONFLICT(chave) DO UPDATE SET
       contagem = CASE WHEN expira_em < ?3 THEN 1 ELSE contagem + 1 END,
       expira_em = CASE WHEN expira_em < ?3 THEN ?2 ELSE expira_em END
     RETURNING contagem`,
  )
    .bind(chave, agora + janelaMs, agora)
    .first<{ contagem: number }>()
  return linha?.contagem ?? 1
}

export async function tentativasFeitas(env: Ambiente, chave: string): Promise<number> {
  const linha = await env.DB.prepare('SELECT contagem, expira_em FROM tentativas WHERE chave = ?1').bind(chave).first<{ contagem: number; expira_em: number }>()
  return linha && linha.expira_em >= Date.now() ? linha.contagem : 0
}

export async function limpezaDiaria(env: Ambiente) {
  const agora = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tentativas WHERE expira_em < ?1').bind(agora),
    env.DB.prepare('DELETE FROM sessoes WHERE usada_em < ?1').bind(agora - SESSAO_VALE_MS),
  ])
}
