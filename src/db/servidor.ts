import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { derivarChave } from '../conta/senha'

// Conversa com o servidor público do jogo, na Cloudflare. Quem não entrou numa conta joga contra a
// máquina do mesmo jeito, salvando só neste aparelho.

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const CHAVE_SESSAO = 'xadrezCaotico:sessao'
const TEMPO_LIMITE_MS = 8000
const CONFERIR_AMIGOS_MS = 15000

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

// --- amigos ------------------------------------------------------------------------------
export interface Jogador {
  idJogador: string
  nome: string
  /** Sugestão do jogo ('peao-brancas') ou foto própria ('foto:<versão>'). */
  avatar: string | null
  moldura: string | null
}

export interface Amigos {
  meuId: string
  amigos: Jogador[]
  convitesRecebidos: Jogador[]
  convitesEnviados: Jogador[]
  partidasRecebidas: (Jogador & { codigo: string; minhaCor: 'w' | 'b' })[]
}

export interface Retrospecto {
  partidas: number
  vitorias: number
  derrotas: number
  empates: number
}

export interface Perfil extends Jogador {
  desde: number
  geral: Retrospecto
  entreVoces: Retrospecto
}

export const listarAmigos = () => pedir<Amigos>('GET', '/amigos')
/** Aceitar um convite recebido é convidar de volta. */
export const convidarAmigo = (busca: string) => pedir<Jogador & { status: 'pendente' | 'aceita' }>('POST', '/amigos', { busca })
/** Serve também pra recusar um convite recebido e cancelar um enviado. */
export const removerAmigo = (idJogador: string) => pedir('POST', `/amigos/${idJogador}/remover`)
export const verPerfil = (idJogador: string) => pedir<Perfil>('GET', `/amigos/${idJogador}`)

/** O que cada peça veste: `{ p: { cabeca: 'elmo' } }`, só o que foge do padrão. */
export type EscolhasDasPecas = Record<string, Record<string, string>>

/** `tudoLiberado`: a conta pode usar o que ainda não está aberto pra todos, como as molduras e a personalização. */
export const lerMeuPerfil = () =>
  pedir<Omit<Perfil, 'entreVoces'> & { tudoLiberado: boolean; personalizacao: EscolhasDasPecas; itens: string[]; conquistas: string[] }>('GET', '/perfil')
/** Compra um equipamento com óticoins; devolve o saldo e os itens comprados. */
export const comprarNaLoja = (item: string) => pedir<{ oticoins: number; itens: string[] }>('POST', '/loja/comprar', { item })
export const salvarEscolhaDaPeca = (peca: string, parte: string, opcao: string) =>
  pedir<{ personalizacao: EscolhasDasPecas }>('POST', '/perfil/personalizacao', { peca, parte, opcao })
export const mudarAparencia = (aparencia: { avatar?: string; moldura?: string }) => pedir('POST', '/perfil/aparencia', aparencia)
export const enviarFoto = (foto: string) => pedir<{ avatar: string }>('POST', '/perfil/foto', { foto })
export const lerConquistas = () => pedir<{ oticoins: number; recebidas: string[]; convites: number }>('GET', '/conquistas')
export const receberConquistas = (ids: string[]) => pedir<{ oticoins: number; novas: string[]; recebidas: string[] }>('POST', '/conquistas/receber', { ids })
export const enderecoDaFoto = (idJogador: string, versao: string) => `${API}/fotos/${idJogador}?v=${versao}`

/** Confere de tempos em tempos, enquanto a aba está à vista: convites chegam sem precisar recarregar a página. */
export function useAmigos() {
  const token = useSessao()?.token
  const [lido, setLido] = useState<{ token: string; amigos: Amigos } | null>(null)

  const atualizar = useCallback(async () => {
    if (!token) return
    try {
      setLido({ token, amigos: await listarAmigos() })
    } catch (erro) {
      if (erro instanceof ErroDoServidor && erro.status === 401) esquecerSessao()
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    void atualizar()
    const relogio = setInterval(() => {
      if (!document.hidden) void atualizar()
    }, CONFERIR_AMIGOS_MS)
    return () => clearInterval(relogio)
  }, [token, atualizar])

  return { amigos: lido && lido.token === token ? lido.amigos : null, atualizar }
}

// --- salas -------------------------------------------------------------------------------
export interface SalaNaLista {
  codigo: string
  minhaCor: 'w' | 'b'
  brancas: string | null
  pretas: string | null
  status: 'aguardando' | 'andamento' | 'fim' | 'expirada' | 'recusada'
  resultado: 'brancas' | 'pretas' | 'empate' | null
  motivo: string | null
  atualizadaEm: number
}

export const criarSala = (cor: 'w' | 'b' | 'sorteio', amigo: string) => pedir<{ codigo: string; cor: 'w' | 'b' }>('POST', '/salas', { cor, amigo })
export const entrarEmSala = (codigo: string) => pedir<{ codigo: string; cor: 'w' | 'b' }>('POST', `/salas/${codigo}/entrar`)
export const recusarSala = (codigo: string) => pedir('POST', `/salas/${codigo}/recusar`)
/** Outra partida com quem jogou a sala `codigo`. Se ele já tinha chamado, entra nessa. */
export const pedirRevanche = (codigo: string, cor: 'w' | 'b') => pedir<{ codigo: string; cor: 'w' | 'b' }>('POST', `/salas/${codigo}/revanche`, { cor })
export const listarSalas = () => pedir<{ salas: SalaNaLista[] }>('GET', '/salas')
export const enderecoDaSala = (codigo: string) => `${API.replace(/^http/, 'ws')}/salas/${codigo}/ws`
