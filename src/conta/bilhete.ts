import { pedirBilhete, sessaoAtual } from '../dados/servidor'
import { salvarPartida, type PartidaXadrez } from '../dados/xadrezRepo'

/** O bilhete é do começo da partida: o servidor só aceita até o 2º lance. */
const LANCES_ATE_O_BILHETE = 2
const pedindo = new Set<string>()

/**
 * O bilhete da partida contra a máquina: o servidor anota quando ela começou, e a vitória só paga óticoins se tiver
 * passado tempo para os lances dela. Pede no começo; sem conexão, tenta de novo a cada lance, até o 2º. Sem conta (ou
 * numa partida de teste), não pede.
 */
export function garantirBilhete(partida: PartidaXadrez, lances: number) {
  if (partida.bilhete || !partida.dificuldade || partida.demonstracao || !sessaoAtual() || lances > LANCES_ATE_O_BILHETE || pedindo.has(partida.id)) return
  pedindo.add(partida.id)
  pedirBilhete(partida.id, partida.dificuldade, partida.relogio?.ritmo ?? null, lances)
    .then(() => {
      partida.bilhete = true
      return salvarPartida(partida)
    })
    .catch(() => {
      // sem conexão: tenta no próximo lance
    })
    .finally(() => pedindo.delete(partida.id))
}
