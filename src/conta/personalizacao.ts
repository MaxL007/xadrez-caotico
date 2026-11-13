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

/** O corpo de cima a baixo, a montaria (só no cavalo) e a arma. */
export function partesDaPeca(peca: Peca): ParteDaPeca[] {
  const corpo = Object.entries(catalogo.corpo).map(([parte, opcoes]) => ({ parte, opcoes }))
  const montaria = peca === 'n' ? Object.entries(catalogo.montaria).map(([parte, opcoes]) => ({ parte, opcoes })) : []
  return [...corpo, ...montaria, { parte: 'arma', opcoes: catalogo.armas[peca] }]
}

/** Equipamentos que saem por conquista: valem pra toda peça que usa aquela parte. */
const POR_CONQUISTA = catalogo.itens as Record<string, { conquista: string }>
/** O que cada peça compra na Loja e o preço em óticoins: a compra vale só pra aquela peça. */
export const NA_LOJA = catalogo.loja as Record<Peca, Record<string, number>>

/** Como a opção se libera: é livre, sai por conquista ou se compra na Loja (o item é 'peça:parte:opção'). */
export type Acesso = { tipo: 'livre' } | { tipo: 'conquista'; conquista: string } | { tipo: 'loja'; preco: number; item: string; conquista?: string }

export function acessoDaOpcao(peca: Peca, parte: string, opcao: string): Acesso {
  const preco = NA_LOJA[peca]?.[`${parte}:${opcao}`]
  const porConquista = POR_CONQUISTA[`${parte}:${opcao}`]
  // a arma vendida na Loja também sai pela conquista dela
  if (preco !== undefined) return { tipo: 'loja', preco, item: `${peca}:${parte}:${opcao}`, conquista: porConquista?.conquista }
  if (porConquista) return { tipo: 'conquista', conquista: porConquista.conquista }
  return { tipo: 'livre' }
}

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

/** O que a peça veste naquela parte; uma opção que saiu do catálogo volta a ser a de sempre. */
export function escolhaDaParte(escolhas: EscolhasDasPecas, peca: Peca, { parte, opcoes }: ParteDaPeca) {
  const escolhida = escolhas[peca]?.[parte]
  return escolhida && opcoes.includes(escolhida) ? escolhida : opcoes[0]
}

/** A conta pode vestir essa opção na peça: é do básico, veio de uma conquista ou foi comprada pra ela. */
export function opcaoLiberada(atual: Estado, peca: Peca, parte: string, opcao: string): boolean {
  if (!atual.conta) return false
  if (atual.tudoLiberado) return true
  const acesso = acessoDaOpcao(peca, parte, opcao)
  if (acesso.tipo === 'loja') return atual.itens.includes(acesso.item) || (!!acesso.conquista && atual.conquistas.includes(acesso.conquista))
  if (acesso.tipo === 'conquista') return atual.conquistas.includes(acesso.conquista)
  return true
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
