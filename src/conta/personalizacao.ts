import { useSyncExternalStore } from 'react'
import { comprarNaLoja, lerMeuPerfil, ouvirSessao, salvarEscolhaDaPeca, sessaoAtual, type EscolhasDasPecas } from '../db/servidor'
import catalogo from './personalizacao.json'

// O que cada peça de quem joga veste e o que a conta pode usar. O catálogo é o mesmo JSON que o servidor confere:
// o básico é livre, o resto libera com uma conquista ou com a compra na Loja. As escolhas ficam guardadas também no
// aparelho, pra peça já nascer vestida enquanto o servidor responde.

export type Peca = 'p' | 'r' | 'n' | 'b' | 'q' | 'k'
export const PECAS = catalogo.pecas as Peca[]

export interface ParteDaPeca {
  parte: string
  /** A primeira é a de sempre. */
  opcoes: string[]
}

/** O corpo de cima a baixo, depois a arma ou, no cavalo, a montaria. */
export function partesDaPeca(peca: Peca): ParteDaPeca[] {
  const corpo = Object.entries(catalogo.corpo).map(([parte, opcoes]) => ({ parte, opcoes }))
  if (peca === 'n') return [...corpo, ...Object.entries(catalogo.montaria).map(([parte, opcoes]) => ({ parte, opcoes }))]
  return [...corpo, { parte: 'arma', opcoes: catalogo.armas[peca] }]
}

export interface ItemDaLoja {
  conquista: string
  preco: number
}
export const ITENS = catalogo.itens as Record<string, ItemDaLoja>
export const idDoItem = (parte: string, opcao: string) => `${parte}:${opcao}`
/** Undefined quando a opção é do básico. */
export const itemDaOpcao = (parte: string, opcao: string): ItemDaLoja | undefined => ITENS[idDoItem(parte, opcao)]

const CHAVE = 'xadrezCaotico:personalizacao'

interface Estado {
  /** Só com conta dá pra personalizar: a escolha fica guardada nela. */
  conta: boolean
  /** A conta usa tudo, sem conquista nem compra. */
  tudoLiberado: boolean
  escolhas: EscolhasDasPecas
  /** Comprados na Loja. */
  itens: string[]
  /** Conquistas recebidas: cada uma libera os itens dela. */
  conquistas: string[]
}

const SEM_CONTA: Estado = { conta: false, tudoLiberado: false, escolhas: {}, itens: [], conquistas: [] }

function lerDoAparelho(): Estado {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as (Estado & { usuario?: string }) | null
    if (salvo && sessaoAtual() && salvo.usuario === sessaoAtual()?.usuario.id) {
      return { conta: true, tudoLiberado: Boolean(salvo.tudoLiberado), escolhas: salvo.escolhas ?? {}, itens: salvo.itens ?? [], conquistas: salvo.conquistas ?? [] }
    }
  } catch {
    // sem localStorage: tudo chega do servidor
  }
  return SEM_CONTA
}

let estado = lerDoAparelho()
const ouvintes = new Set<() => void>()

function mudarEstado(novo: Estado) {
  estado = novo
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...novo, usuario: sessaoAtual()?.usuario.id }))
  } catch {
    // vale só até fechar a página
  }
  ouvintes.forEach((ouvinte) => ouvinte())
}

// saiu da conta: as peças voltam a ser as de sempre
ouvirSessao(() => {
  if (!sessaoAtual()) mudarEstado(SEM_CONTA)
})

export function ouvirPersonalizacao(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

export const personalizacaoAtual = () => estado

export function usePersonalizacao() {
  return useSyncExternalStore(ouvirPersonalizacao, personalizacaoAtual)
}

export const escolhaDaParte = (escolhas: EscolhasDasPecas, peca: Peca, { parte, opcoes }: ParteDaPeca) => escolhas[peca]?.[parte] ?? opcoes[0]

/** A conta pode vestir essa opção: é do básico, veio de uma conquista ou foi comprada. */
export function opcaoLiberada(atual: Estado, parte: string, opcao: string): boolean {
  if (!atual.conta) return false
  const item = itemDaOpcao(parte, opcao)
  return !item || atual.tudoLiberado || atual.itens.includes(idDoItem(parte, opcao)) || atual.conquistas.includes(item.conquista)
}

/** Traz da conta o que cada peça veste e o que ela pode usar. */
export async function carregarPersonalizacao() {
  if (!sessaoAtual()) return
  try {
    const perfil = await lerMeuPerfil()
    mudarEstado({ conta: true, tudoLiberado: perfil.tudoLiberado, escolhas: perfil.personalizacao, itens: perfil.itens, conquistas: perfil.conquistas })
  } catch {
    // sem conexão: fica o que estava no aparelho
  }
}

let fila: Promise<unknown> = Promise.resolve()

/** Veste na hora e salva na conta, uma escolha de cada vez, pra uma não passar por cima da outra no servidor. */
export function escolherOpcao(peca: Peca, parte: ParteDaPeca, opcao: string): Promise<void> {
  const daPeca = { ...estado.escolhas[peca] }
  if (opcao === parte.opcoes[0]) delete daPeca[parte.parte]
  else daPeca[parte.parte] = opcao
  const escolhas = { ...estado.escolhas }
  if (Object.keys(daPeca).length > 0) escolhas[peca] = daPeca
  else delete escolhas[peca]
  mudarEstado({ ...estado, escolhas })

  const salvar = fila.then(() => salvarEscolhaDaPeca(peca, parte.parte, opcao))
  fila = salvar.catch(() => undefined)
  return salvar.then(
    () => undefined,
    async (erro: unknown) => {
      // o servidor não aceitou: volta ao que está na conta
      await carregarPersonalizacao()
      throw erro
    },
  )
}

/** Compra o item na Loja; devolve o saldo novo. */
export async function comprarItem(item: string): Promise<number> {
  const resposta = await comprarNaLoja(item)
  mudarEstado({ ...estado, itens: resposta.itens })
  return resposta.oticoins
}
