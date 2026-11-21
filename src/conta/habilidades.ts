import catalogo from '../catalogos/personalizacao.json'
import type { ChaveTexto } from '../textos/idiomas'
import type { Peca } from './personalizacao'

// O cadastro das habilidades especiais, o que o aparelho precisa saber de cada uma (as telas e o tabuleiro). O catálogo
// (src/catalogos/personalizacao.json, `habilidades` e `loja`) diz em que peça cada uma existe e quanto custa, e o
// servidor confere por ele. A animação de cada uma mora em src/tabuleiro/combate/habilidades.ts, e o símbolo em
// src/tabuleiro/pecas/emblemas.ts. Pra criar uma habilidade nova, ver "Como adicionar uma habilidade" no CLAUDE.md:
// o teste das armas acusa o que faltar (`habilidadesIncompletas`).

export interface DadosDaHabilidade {
  peca: Peca
  /** Como a captura começa: 'corpoACorpo' vai até a vítima (com a arma na mão, se tiver), como o golpe de sempre;
   * 'aDistancia' só vira pra ela e a habilidade cuida do resto. */
  alcance: 'corpoACorpo' | 'aDistancia'
  /** A arma que tem de estar na mão pra habilidade sair (sem ela, vale com qualquer arma ou nenhuma): o nome da opção
   * da arma, o aviso da Personalização quando ela não está na mão e o complemento na Loja ("com a katana"). */
  arma?: { opcao: string; aviso: ChaveTexto; naLoja: ChaveTexto }
  /** Luta com as mãos: vai até a vítima sem sacar a arma (a katana fica na bainha), e vale com qualquer arma. */
  maosLivres?: boolean
}

export const HABILIDADES: Record<string, DadosDaHabilidade> = {
  // o peão de katana dá vários cortes rápidos e a peça se desfaz em pedaços
  retalhamento: { peca: 'p', alcance: 'corpoACorpo', arma: { opcao: 'katana', aviso: 'personalizacao.habilidade.semKatana', naLoja: 'loja.comAKatana' } },
  // a rainha puxa a peça pela gravidade até a mão e esmaga no chão; vale com ou sem arma
  puxao: { peca: 'q', alcance: 'aDistancia' },
  // o peão boxeador: o oito da Dempsey Roll, ganchos dos dois lados e o gancho final que arremessa; com os punhos
  dempsey: { peca: 'p', alcance: 'corpoACorpo', maosLivres: true },
}

/** Todas as habilidades do catálogo, peça por peça (sem o "nenhuma"). */
export function habilidadesDoCatalogo(): { peca: Peca; id: string }[] {
  return Object.entries(catalogo.habilidades as Record<string, string[]>).flatMap(([peca, opcoes]) =>
    opcoes.filter((id) => id !== 'nenhuma').map((id) => ({ peca: peca as Peca, id })),
  )
}

/** Os textos de cada habilidade, montados pelo nome dela. */
export const textoDoNome = (id: string) => `personalizacao.opcao.${id}` as ChaveTexto
export const textoDoQueFaz = (id: string) => `personalizacao.habilidade.${id}` as ChaveTexto
