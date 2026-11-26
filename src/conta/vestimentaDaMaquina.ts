import { HABILIDADES } from './habilidades'
import { PECAS, partesDaPeca } from './personalizacao'
import type { EscolhasDasPecas } from '../dados/servidor'

// O que as peças da máquina vestem (pedido do usuário, 26/11): a cada partida nova contra ela, um sorteio do catálogo
// pra cada tipo de peça, a armadura parte por parte, a montaria do cavalo, a arma e a habilidade especial. A habilidade
// que pede uma arma (o retalhamento, com a katana) leva a arma junto. O sorteio fica gravado na partida
// (`vestimentaDaMaquina`): voltando a ela, a máquina veste o mesmo. As partidas de antes, e as de teste, ficam sem nada.

/** Um item do catálogo ao acaso (o de sempre também pode sair). */
const aoAcaso = <T,>(lista: T[]): T => lista[Math.floor(Math.random() * lista.length)]

export function sortearVestimentaDaMaquina(): EscolhasDasPecas {
  const escolhas: EscolhasDasPecas = {}
  for (const peca of PECAS) {
    const daPeca: Record<string, string> = {}
    for (const { parte, opcoes } of partesDaPeca(peca)) {
      const opcao = aoAcaso(opcoes)
      // a primeira opção é a de sempre: não precisa ser guardada
      if (opcao !== opcoes[0]) daPeca[parte] = opcao
    }
    // a habilidade que só sai com uma arma na mão leva a arma junto
    const exigida = daPeca.golpe ? HABILIDADES[daPeca.golpe]?.arma?.opcao : undefined
    if (exigida) daPeca.arma = exigida
    if (Object.keys(daPeca).length) escolhas[peca] = daPeca
  }
  return escolhas
}
