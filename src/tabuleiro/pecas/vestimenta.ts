import * as THREE from 'three'

// O que as peças vestem no tabuleiro (a escolha da Personalização) e a arma do peão.

type EscolhasDasPecas = Record<string, Record<string, string>>

/** Quem joga veste as próprias peças com o que escolheu na Personalização. Na partida contra outra pessoa, as peças do
 * adversário vestem o que ele escolheu (o servidor manda, e só deixa equipar o que foi comprado): as armas, as
 * armaduras e as habilidades dele aparecem pra quem joga contra. A máquina não veste nada. No menu, as vestidas são
 * as brancas. */
export let vestimenta: { cor: 'w' | 'b'; escolhas: EscolhasDasPecas; adversario: EscolhasDasPecas } = { cor: 'w', escolhas: {}, adversario: {} }
/** Troca o que as peças vestem (quem importa lê `vestimenta`, mas só daqui ela muda). */
export function definirVestimenta(nova: { cor: 'w' | 'b'; escolhas: EscolhasDasPecas; adversario?: EscolhasDasPecas }) {
  vestimenta = { ...nova, adversario: nova.adversario ?? {} }
}
/** O que as peças daquela cor vestem: as de quem joga ou as do adversário. */
export const escolhasDaCor = (cor: 'w' | 'b'): EscolhasDasPecas => (cor === vestimenta.cor ? vestimenta.escolhas : vestimenta.adversario)
/** A arma do peão no tabuleiro: a escolhida, ou nenhuma. */
export const armaDoPeaoNoTabuleiro = (peao: THREE.Object3D) => peao.userData.arma as string | undefined
export const assinaturaDaVestimenta = (tipo: string, cor: 'w' | 'b') => JSON.stringify(escolhasDaCor(cor)[tipo] ?? {})
