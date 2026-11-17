/** O que muda a cada lance e a cada tabuleiro novo: fica num objeto só, dividido entre o ChessBoard3D e os módulos do
 * fluxo da partida (lance animado, partida contra a máquina). */
export interface Andamento {
  /** "Geração" do tabuleiro: muda a cada tabuleiro novo (outra partida, novo jogo, volta pro menu). Lances e animações
   * que começaram numa geração antiga não mexem mais em nada — antes, começar um jogo no meio da animação de um lance
   * deixava a animação velha terminar por cima do tabuleiro novo (peça sumida, fora da casa, ou a peça errada). */
  geracao: number
  /** Lances com animação ainda rodando (os testes esperam zerar). */
  lancesEmAndamento: number
  /** Lances do adversário que chegaram enquanto outra peça ainda andava. */
  filaDaSala: string[]
  animandoDaSala: boolean
  /** Pra não disparar a comemoração de novo enquanto o fim continuar sendo a posição atual. */
  comemoracaoDisparada: boolean
  /** Em que lance quem joga pediu empate pela última vez: um pedido por lance. */
  ultimoPedidoDeEmpate: number
}

export const andamentoNovo = (): Andamento => ({
  geracao: 0,
  lancesEmAndamento: 0,
  filaDaSala: [],
  animandoDaSala: false,
  comemoracaoDisparada: false,
  ultimoPedidoDeEmpate: -1,
})

/** A peça que o peão vira na promoção. */
export type PecaPromocao = 'q' | 'r' | 'b' | 'n'
