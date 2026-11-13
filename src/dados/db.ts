import { useSyncExternalStore } from 'react'
import { enviarLote, ErroDoServidor, esquecerSessao, listarRegistrosDesde, ouvirSessao, sessaoAtual } from './servidor'

// As partidas e o aprendizado ficam primeiro neste aparelho (IndexedDB) e vão pro servidor logo depois.
// Assim um lance nunca espera a rede e o jogo continua inteiro sem internet: o que não foi enviado
// fica numa fila e sai quando der. Cada conta tem um banco separado neste aparelho; quem joga sem
// conta usa o de convidado, que passa pra conta quando a pessoa entra.

const STORES = ['xadrezPartidas', 'xadrezAprendizado']
const CONVIDADO = 'convidado'
const TAMANHO_DO_LOTE = 200
/** Ao abrir, dá um tempo pro servidor trazer o que veio de outro aparelho; depois abre sem ele. */
const ESPERA_AO_ABRIR_MS = 2500
const ESPERA_PRA_ENVIAR_MS = 800
const INTERVALO_DE_TENTATIVAS_MS = 60000

export type EstadoDaNuvem = 'convidado' | 'verificando' | 'conectado' | 'sem-conexao'

interface Registro {
  id: string
  atualizadaEm?: number
}

const novaMemoria = () => new Map<string, Map<string, Registro>>(STORES.map((store) => [store, new Map()]))

let memoria = novaMemoria()
const pendentes = new Set<string>()
let banco: IDBDatabase | null = null

const chaveDe = (store: string, id: string) => `${store}/${id}`

function separarChave(chave: string): { store: string; id: string } {
  const barra = chave.indexOf('/')
  return { store: chave.slice(0, barra), id: chave.slice(barra + 1) }
}

// --- IndexedDB ---------------------------------------------------------------------------
function abrirBanco(conta: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(`xadrez-caotico:${conta}`, 1)
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore('registros')
      pedido.result.createObjectStore('pendentes')
    }
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

function lerTudo(alvo: IDBDatabase | null, tabela: string): Promise<{ chaves: string[]; valores: unknown[] }> {
  return new Promise((resolve, reject) => {
    if (!alvo) return resolve({ chaves: [], valores: [] })
    const loja = alvo.transaction(tabela).objectStore(tabela)
    const chaves = loja.getAllKeys()
    const valores = loja.getAll()
    valores.onsuccess = () => resolve({ chaves: chaves.result as string[], valores: valores.result })
    valores.onerror = () => reject(valores.error)
  })
}

/** Grava e apaga na mesma transação. Sem banco (janela anônima), segue só na memória desta sessão. */
function escrever(tabela: string, gravar: [string, unknown][], apagar: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!banco || (gravar.length === 0 && apagar.length === 0)) return resolve()
    const transacao = banco.transaction(tabela, 'readwrite')
    const loja = transacao.objectStore(tabela)
    for (const [chave, valor] of gravar) loja.put(valor, chave)
    for (const chave of apagar) loja.delete(chave)
    transacao.oncomplete = () => resolve()
    transacao.onerror = () => reject(transacao.error)
  })
}

// --- situação da nuvem, pra quem está na tela ---------------------------------------------
let resumo: { estado: EstadoDaNuvem; pendentes: number } = { estado: sessaoAtual() ? 'verificando' : 'convidado', pendentes: 0 }
const ouvintesDoResumo = new Set<() => void>()
const ouvintesDosDados = new Set<() => void>()

function atualizarResumo(estado: EstadoDaNuvem = resumo.estado) {
  if (estado === resumo.estado && pendentes.size === resumo.pendentes) return
  resumo = { estado, pendentes: pendentes.size }
  ouvintesDoResumo.forEach((ouvinte) => ouvinte())
}

function ouvirResumo(ouvinte: () => void) {
  ouvintesDoResumo.add(ouvinte)
  return () => {
    ouvintesDoResumo.delete(ouvinte)
  }
}

export function useResumoDaNuvem() {
  return useSyncExternalStore(ouvirResumo, () => resumo)
}

/** Avisa quando os dados mudam por fora da partida: vieram do servidor ou outra conta entrou. */
export function ouvirDados(ouvinte: () => void) {
  ouvintesDosDados.add(ouvinte)
  return () => {
    ouvintesDosDados.delete(ouvinte)
  }
}

const avisarDados = () => ouvintesDosDados.forEach((ouvinte) => ouvinte())

// --- sincronização ------------------------------------------------------------------------
const chaveDoDesde = (usuarioId: string) => `xadrezCaotico:desde:${usuarioId}`

function lerDesde(usuarioId: string): number {
  try {
    return Number(localStorage.getItem(chaveDoDesde(usuarioId)) ?? 0) || 0
  } catch {
    return 0
  }
}

function gravarDesde(usuarioId: string, valor: number) {
  try {
    localStorage.setItem(chaveDoDesde(usuarioId), String(valor))
  } catch {
    // sem localStorage a próxima leitura só traz tudo de novo
  }
}

async function enviarPendentes() {
  while (pendentes.size > 0) {
    const lote = [...pendentes].slice(0, TAMANHO_DO_LOTE)
    const registros = lote.flatMap((chave) => {
      const { store, id } = separarChave(chave)
      const dados = memoria.get(store)?.get(id)
      return dados ? [{ store, dados }] : []
    })
    // sai da fila antes de enviar: o que mudar durante o envio entra de novo e não se perde
    lote.forEach((chave) => pendentes.delete(chave))
    try {
      await enviarLote(registros)
    } catch (erro) {
      lote.forEach((chave) => pendentes.add(chave))
      throw erro
    }
    await escrever('pendentes', [], lote.filter((chave) => !pendentes.has(chave)))
    atualizarResumo()
  }
}

async function trazerDoServidor(usuarioId: string) {
  let desde = lerDesde(usuarioId)
  let chegouAlgo = false
  for (;;) {
    const { registros, fim } = await listarRegistrosDesde(desde)
    const novos: [string, Registro][] = []
    for (const { store, dados, atualizadoEm } of registros) {
      desde = Math.max(desde, atualizadoEm)
      const chave = chaveDe(store, dados.id)
      if (pendentes.has(chave)) continue
      const locais = memoria.get(store)
      const local = locais?.get(dados.id)
      if (!locais || (local && (local.atualizadaEm ?? 0) > (dados.atualizadaEm ?? 0))) continue
      if (local && JSON.stringify(local) === JSON.stringify(dados)) continue
      locais.set(dados.id, dados)
      novos.push([chave, dados])
    }
    await escrever('registros', novos)
    gravarDesde(usuarioId, desde)
    chegouAlgo ||= novos.length > 0
    if (fim) break
  }
  if (chegouAlgo) avisarDados()
}

let emAndamento: Promise<void> | null = null

async function executarSincronia(trazer: boolean) {
  const usuario = sessaoAtual()?.usuario
  if (!usuario) return atualizarResumo('convidado')
  try {
    await enviarPendentes()
    if (trazer) await trazerDoServidor(usuario.id)
    atualizarResumo('conectado')
  } catch (erro) {
    if (erro instanceof ErroDoServidor && erro.status === 401) esquecerSessao()
    else atualizarResumo('sem-conexao')
  }
}

export function sincronizar(trazer = true): Promise<void> {
  emAndamento ??= executarSincronia(trazer).finally(() => {
    emAndamento = null
  })
  return emAndamento
}

let envioAgendado: ReturnType<typeof setTimeout> | null = null

function agendarEnvio() {
  if (envioAgendado) return
  envioAgendado = setTimeout(() => {
    envioAgendado = null
    void sincronizar(false)
  }, ESPERA_PRA_ENVIAR_MS)
}

// --- abertura e troca de conta ------------------------------------------------------------
/** Abre o banco da conta. A primeira conta a entrar leva as partidas jogadas como convidado. */
async function abrirConta() {
  const usuario = sessaoAtual()?.usuario
  banco?.close()
  banco = await abrirBanco(usuario?.id ?? CONVIDADO).catch(() => null)
  memoria = novaMemoria()
  pendentes.clear()

  const registros = await lerTudo(banco, 'registros').catch(() => ({ chaves: [], valores: [] }))
  registros.chaves.forEach((chave, i) => {
    const { store, id } = separarChave(chave)
    memoria.get(store)?.set(id, registros.valores[i] as Registro)
  })
  const fila = await lerTudo(banco, 'pendentes').catch(() => ({ chaves: [] as string[] }))
  fila.chaves.forEach((chave) => pendentes.add(chave))

  if (usuario) await adotarConvidado()
  atualizarResumo(usuario ? 'verificando' : 'convidado')
}

async function adotarConvidado() {
  const convidado = await abrirBanco(CONVIDADO).catch(() => null)
  if (!convidado) return
  const { chaves, valores } = await lerTudo(convidado, 'registros').catch(() => ({ chaves: [] as string[], valores: [] as unknown[] }))
  const adotados: [string, Registro][] = []
  chaves.forEach((chave, i) => {
    const { store, id } = separarChave(chave)
    if (memoria.get(store)?.has(id)) return
    memoria.get(store)?.set(id, valores[i] as Registro)
    pendentes.add(chave)
    adotados.push([chave, valores[i] as Registro])
  })
  await escrever('registros', adotados)
  await escrever('pendentes', adotados.map(([chave]) => [chave, true]))
  if (chaves.length > 0) {
    await new Promise<void>((resolve) => {
      const transacao = convidado.transaction(['registros', 'pendentes'], 'readwrite')
      transacao.objectStore('registros').clear()
      transacao.objectStore('pendentes').clear()
      transacao.oncomplete = () => resolve()
      transacao.onerror = () => resolve()
    })
  }
  convidado.close()
}

let contaAberta: string | null | undefined
let carregado: Promise<void> | null = null

async function abrirESincronizar() {
  contaAberta = sessaoAtual()?.usuario.id ?? null
  await abrirConta()
  await Promise.race([sincronizar(), new Promise((r) => setTimeout(r, ESPERA_AO_ABRIR_MS))])
}

function carregar(): Promise<void> {
  carregado ??= abrirESincronizar()
  return carregado
}

ouvirSessao(() => {
  if ((sessaoAtual()?.usuario.id ?? null) === contaAberta) return
  carregado = abrirESincronizar().then(avisarDados)
})

setInterval(() => {
  if (sessaoAtual() && (pendentes.size > 0 || resumo.estado !== 'conectado')) void sincronizar()
}, INTERVALO_DE_TENTATIVAS_MS)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void sincronizar()
})
window.addEventListener('online', () => void sincronizar())

// --- leitura e gravação -------------------------------------------------------------------
export async function dbGet<T>(store: string, id: string): Promise<T | undefined> {
  await carregar()
  return memoria.get(store)?.get(id) as T | undefined
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  await carregar()
  return [...(memoria.get(store)?.values() ?? [])] as T[]
}

export async function dbPutVarios<T extends Registro>(store: string, lista: T[]): Promise<void> {
  await carregar()
  const chaves = lista.map((dados) => chaveDe(store, dados.id))
  lista.forEach((dados, i) => {
    memoria.get(store)?.set(dados.id, dados)
    pendentes.add(chaves[i])
  })
  await Promise.all([escrever('registros', lista.map((dados, i) => [chaves[i], dados])), escrever('pendentes', chaves.map((chave) => [chave, true]))])
  atualizarResumo()
  agendarEnvio()
}

export const dbPut = <T extends Registro>(store: string, dados: T) => dbPutVarios(store, [dados])

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__dadosJogo = { resumo: () => resumo, sincronizar, carregar }
}
