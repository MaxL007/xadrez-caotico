import type { Square } from 'chess.js'
import { HABILIDADES } from '../../conta/habilidades'

// A prévia da Loja (pedido do usuário: uma pré-visualização das armas e habilidades que dê vontade de comprar). O botão
// "Ver em ação" leva o tabuleiro da tela inicial pra uma posição pronta, veste a peça de quem joga com o item, como se
// já fosse dela, e joga a captura de verdade, com a câmera de perto. Nada é salvo e a máquina não responde; no fim o
// tabuleiro volta pra tela inicial e a Loja reabre no item.

export interface CenaDaPrevia {
  /** A posição, com as brancas na vez, e a captura que elas fazem. */
  pgn: string
  de: Square
  para: Square
  /** De que lado a câmera olha (graus; 0 é do lado das brancas). */
  lado: number
}

/** Uma captura pra cada peça, em campo aberto e perto da câmera. */
const CENAS: Record<string, CenaDaPrevia> = {
  // o peão toma o cavalo (peão contra peão teria a chance da honra do samurai)
  p: { pgn: '1. e4 Nc6 2. d4 a6 3. d5 a5', de: 'd5', para: 'c6', lado: -35 },
  r: { pgn: '1. a4 h5 2. a5 h4 3. a6 bxa6', de: 'a1', para: 'a6', lado: -60 },
  n: { pgn: '1. Nc3 d5', de: 'c3', para: 'd5', lado: -30 },
  b: { pgn: '1. e4 e5 2. Bc4 d6', de: 'c4', para: 'f7', lado: -30 },
  q: { pgn: '1. e4 e5 2. Qh5 a6', de: 'h5', para: 'e5', lado: -30 },
  k: { pgn: '1. e4 d5 2. Ke2 dxe4 3. Ke3 a6', de: 'e3', para: 'e4', lado: 30 },
}

/** Só as armas e as habilidades têm prévia (a armadura não muda a captura). */
export function temPrevia(item: string): boolean {
  const [peca, parte] = item.split(':')
  return (parte === 'arma' || parte === 'golpe') && peca in CENAS
}

export function cenaDaPrevia(item: string): CenaDaPrevia | null {
  return temPrevia(item) ? CENAS[item.split(':')[0]] : null
}

/** O que as peças vestem na prévia: o que a pessoa já escolheu, com o item no lugar. A habilidade que pede uma arma
 * vem com ela na mão; a prévia da arma mostra a arma sozinha, sem a habilidade equipada. */
export function vestimentaDaPrevia(item: string, escolhas: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const [peca, parte, opcao] = item.split(':')
  const daPeca: Record<string, string> = { ...(escolhas[peca] ?? {}), [parte]: opcao }
  if (parte === 'golpe') {
    const arma = HABILIDADES[opcao]?.arma
    if (arma) daPeca.arma = arma.opcao
  } else delete daPeca.golpe
  return { ...escolhas, [peca]: daPeca }
}
