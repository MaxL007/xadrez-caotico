import * as THREE from 'three'

// O que as peças de quem joga vestem no tabuleiro (a escolha da Personalização) e a arma do peão.

/** Quem joga veste as próprias peças com o que escolheu na Personalização; o adversário e a máquina, não. No menu,
 * as vestidas são as brancas. */
export let vestimenta: { cor: 'w' | 'b'; escolhas: Record<string, Record<string, string>> } = { cor: 'w', escolhas: {} }
/** Troca o que as peças de quem joga vestem (quem importa lê `vestimenta`, mas só daqui ela muda). */
export function definirVestimenta(nova: typeof vestimenta) {
  vestimenta = nova
}
/** A arma do peão no tabuleiro: a escolhida, ou nenhuma. */
export const armaDoPeaoNoTabuleiro = (peao: THREE.Object3D) => peao.userData.arma as string | undefined
export const assinaturaDaVestimenta = (tipo: string, cor: 'w' | 'b') => (cor === vestimenta.cor ? JSON.stringify(vestimenta.escolhas[tipo] ?? {}) : '{}')
