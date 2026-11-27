import { useSyncExternalStore } from 'react'
import catalogo from '../catalogos/conquistas.json'
import { lerMeuPerfil, mudarTitulo, ouvirSessao, sessaoAtual } from '../dados/servidor'

// Os títulos (pedido do usuário, 26/11): cada um sai de uma conquista com patamares, como no Mobile Legends: a conquista
// sobe de patamar e, no último, dá o título. O METAMORFO pede as três de ascensões (50,
// 200 e 500). A pessoa escolhe um no Perfil, e ele aparece embaixo do nome dela na partida, contra a máquina ou contra
// um amigo (que também vê). O servidor guarda a escolha e confere as conquistas; o aparelho guarda uma cópia, pra mostrar
// na partida sem perguntar ao servidor.

export interface Titulo {
  id: string
  /** A conquista com patamares que dá o título: cada conquista da lista é um patamar, da primeira à última. */
  serie: string
  conquistas: string[]
}

export const TITULOS = catalogo.titulos as Titulo[]

/** Recebeu todas as conquistas do título (ou a conta tem tudo liberado). */
export const tituloLiberado = (titulo: Titulo, recebidas: readonly string[], tudoLiberado = false) =>
  tudoLiberado || titulo.conquistas.every((c) => recebidas.includes(c))

const chave = (usuario: string) => `xadrezCaotico:titulo:${usuario}`
const ouvintes = new Set<() => void>()
let copia: { usuario: string; titulo: string | null } | null = null

function lerCopia(): string | null {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario) return null
  if (copia?.usuario !== usuario) {
    let titulo: string | null = null
    try {
      titulo = localStorage.getItem(chave(usuario))
    } catch {
      // sem localStorage, só o que veio do servidor nesta visita
    }
    copia = { usuario, titulo: TITULOS.some((t) => t.id === titulo) ? titulo : null }
  }
  return copia.titulo
}

/** Grava o título da conta aberta (veio do servidor ou a pessoa trocou). */
export function guardarMeuTitulo(titulo: string | null) {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario) return
  copia = { usuario, titulo }
  try {
    if (titulo) localStorage.setItem(chave(usuario), titulo)
    else localStorage.removeItem(chave(usuario))
  } catch {
    // fica só nesta visita
  }
  ouvintes.forEach((ouvinte) => ouvinte())
}

function ouvir(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  const pararSessao = ouvirSessao(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
    pararSessao()
  }
}

/** O título que a pessoa escolheu, ou null (sem conta, nenhum). */
export const useMeuTitulo = () => useSyncExternalStore(ouvir, lerCopia)

/** Escolhe (ou tira, com null) o título: o servidor confere e grava. */
export async function escolherTitulo(titulo: string | null) {
  await mudarTitulo(titulo)
  guardarMeuTitulo(titulo)
}

// uma vez por conta a cada visita, o aparelho confere com o servidor (a escolha pode ter sido feita noutro aparelho)
const conferidas = new Set<string>()
export function conferirMeuTitulo() {
  const usuario = sessaoAtual()?.usuario.id
  if (!usuario || conferidas.has(usuario)) return
  conferidas.add(usuario)
  lerMeuPerfil()
    .then((perfil) => {
      if (sessaoAtual()?.usuario.id === usuario) guardarMeuTitulo(perfil.titulo)
    })
    .catch(() => conferidas.delete(usuario))
}
