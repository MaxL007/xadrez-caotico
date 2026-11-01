import { useSyncExternalStore } from 'react'
import { derivarChave } from '../conta/senha'

// Conversa com o servidor público do jogo, na Cloudflare. Quem não entrou numa conta joga contra a
// máquina do mesmo jeito, salvando só neste aparelho.

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const CHAVE_SESSAO = 'xadrezCaotico:sessao'
const TEMPO_LIMITE_MS = 8000

export interface Usuario {
  id: string
  nome: string
}

interface Sessao {
  token: string
  usuario: Usuario
}

export class ErroDoServidor extends Error {
  status: number
  constructor(status: number, codigo: string) {
    super(codigo)
    this.status = status
  }
}

function lerSessao(): Sessao | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSAO) ?? 'null') as Sessao | null
  } catch {
    return null
  }
}

let sessao = lerSessao()
const ouvintes = new Set<() => void>()

function mudarSessao(nova: Sessao | null) {
  sessao = nova
  try {
    if (nova) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(nova))
    else localStorage.removeItem(CHAVE_SESSAO)
  } catch {
    // sem localStorage a sessão vale só até fechar a página
  }
  ouvintes.forEach((ouvinte) => ouvinte())
}

export function ouvirSessao(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

export const sessaoAtual = () => sessao

export function useSessao() {
  return useSyncExternalStore(ouvirSessao, sessaoAtual)
}

/** A sessão venceu ou foi derrubada: volta a ser convidado, sem perder o que está neste aparelho. */
export function esquecerSessao() {
  mudarSessao(null)
}

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  let resposta: Response
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method: metodo,
      signal: controle.signal,
      headers: {
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
  } catch {
    throw new ErroDoServidor(0, 'sem-conexao')
  } finally {
    clearTimeout(prazo)
  }
  if (!resposta.ok) {
    const erro = (await resposta.json().catch(() => ({}))) as { erro?: string }
    throw new ErroDoServidor(resposta.status, erro.erro ?? 'erro')
  }
  return resposta.json() as Promise<T>
}

// --- conta -------------------------------------------------------------------------------
export async function criarConta(nome: string, senha: string): Promise<string> {
  const r = await pedir<Sessao & { codigoRecuperacao: string }>('POST', '/contas', { nome, chave: await derivarChave(nome, senha) })
  mudarSessao({ token: r.token, usuario: r.usuario })
  return r.codigoRecuperacao
}

export async function entrarNaConta(nome: string, senha: string): Promise<void> {
  const r = await pedir<Sessao>('POST', '/sessoes', { nome, chave: await derivarChave(nome, senha) })
  mudarSessao({ token: r.token, usuario: r.usuario })
}

export async function recuperarConta(nome: string, codigo: string, senhaNova: string): Promise<string> {
  const r = await pedir<Sessao & { codigoRecuperacao: string }>('POST', '/contas/recuperar', { nome, codigo, chaveNova: await derivarChave(nome, senhaNova) })
  mudarSessao({ token: r.token, usuario: r.usuario })
  return r.codigoRecuperacao
}

export async function sairDaConta() {
  await pedir('POST', '/sessoes/sair').catch(() => {
    // sem conexão: a sessão vence sozinha no servidor
  })
  mudarSessao(null)
}

export async function excluirConta(senha: string) {
  if (!sessao) return
  await pedir('POST', '/contas/excluir', { chave: await derivarChave(sessao.usuario.nome, senha) })
  mudarSessao(null)
}

// --- partidas salvas ---------------------------------------------------------------------
export interface RegistroRemoto {
  store: string
  dados: { id: string; atualizadaEm?: number }
  atualizadoEm: number
}

export function listarRegistrosDesde(desde: number) {
  return pedir<{ registros: RegistroRemoto[]; fim: boolean }>('GET', `/registros?desde=${desde}`)
}

export async function enviarLote(registros: { store: string; dados: unknown }[]) {
  await pedir('POST', '/registros', { registros })
}

// --- salas -------------------------------------------------------------------------------
export interface SalaNaLista {
  codigo: string
  minhaCor: 'w' | 'b'
  brancas: string | null
  pretas: string | null
  status: 'aguardando' | 'andamento' | 'fim' | 'expirada'
  resultado: 'brancas' | 'pretas' | 'empate' | null
  motivo: string | null
  atualizadaEm: number
}

export const criarSala = (cor: 'w' | 'b' | 'sorteio') => pedir<{ codigo: string; cor: 'w' | 'b' }>('POST', '/salas', { cor })
export const entrarEmSala = (codigo: string) => pedir<{ codigo: string; cor: 'w' | 'b' }>('POST', `/salas/${codigo}/entrar`)
export const listarSalas = () => pedir<{ salas: SalaNaLista[] }>('GET', '/salas')
export const enderecoDaSala = (codigo: string) => `${API.replace(/^http/, 'ws')}/salas/${codigo}/ws`
