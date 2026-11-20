import * as THREE from 'three'
import { girarOssoNoMundo, ossoRPG } from '../pecas/ossos'
import { menosMovimento } from './golpeQuePesa'

// O realismo das ações (pedido do usuário): quanto da física de verdade cada ação segue. 100% seria um boneco de pano
// solto, com os membros sacudidos por cada tranco; 0% é a peça dura de desenho animado. O jogo fica no meio: a física dá
// o rumo (o corpo arrancado com o peito na frente e os braços e as pernas jogados pra trás, o embalo que continua quando
// a cabeça para, o chão que afunda conforme o peso de quem cai) e o desenho animado dá o exagero e o tempo.
// Por enquanto segue o realismo o Puxão Universal; uma ação nova usa `realismo()` e `corpoLargado()` do mesmo jeito.

/** A porcentagem de realismo (0 a 1) das ações que a seguem. */
export const REALISMO = 0.7

/** O realismo valendo agora: quem pediu menos movimento vê os membros sacudindo bem menos. */
export function realismo(): number {
  return REALISMO * (menosMovimento() ? 0.35 : 1)
}

/** O peso de cada peça, pela conta de sempre do xadrez: o rei, que não sai do tabuleiro, pesa como a rainha. */
const MASSA: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 9 }

export function massaDaPeca(tipo: unknown): number {
  return MASSA[String(tipo)] ?? 3
}

/** Os ossos que o corpo largado mexe: quem usa salva estes antes e desfaz depois, a cada quadro. */
export const OSSOS_DO_CORPO_LARGADO = [
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'LeftArm',
  'LeftForeArm',
  'RightArm',
  'RightForeArm',
  'LeftUpLeg',
  'LeftLeg',
  'RightUpLeg',
  'RightLeg',
]

export interface PoseLargada {
  /** O quanto os membros ficam pra trás, arrancados (1), soltos (0) ou jogados pra frente pelo embalo (negativo). */
  pratras: number
  /** O quanto braços e pernas se abrem pros lados (0 a 1): na pancada no chão, o corpo se esparrama. */
  abertura: number
  /** O peito pra frente, as costas arqueadas (0 a 1). */
  arco: number
  /** Os quatro membros jogados pro mesmo lado (-1 a 1, positivo pra esquerda da peça): girando, ficam pra trás do giro. */
  deLado?: number
}

const LADO = new THREE.Vector3(1, 0, 0)
const FRENTE = new THREE.Vector3(0, 0, 1)

function girar(peca: THREE.Object3D, nome: string, eixo: THREE.Vector3, angulo: number) {
  if (Math.abs(angulo) < 1e-4) return
  const osso = ossoRPG(peca, nome)
  if (osso) girarOssoNoMundo(osso, new THREE.Quaternion().setFromAxisAngle(eixo, angulo))
}

/**
 * A pose do corpo largado por cima do clipe, na medida do realismo: as costas arqueadas com o peito na frente, os
 * braços e as pernas pra trás (ou pra frente, no embalo), abertos, tremulando com o vento da velocidade. `agora` dá o
 * tremular; `fase` desencontra duas peças. Só nas peças RPG (as outras não têm ossos).
 */
export function corpoLargado(peca: THREE.Object3D, pose: PoseLargada, agora: number, fase = 0) {
  const r = realismo()
  if (r <= 0) return
  peca.updateWorldMatrix(true, true)
  const lado = LADO.clone().transformDirection(peca.matrixWorld)
  const frente = FRENTE.clone().transformDirection(peca.matrixWorld)
  const pratras = pose.pratras * r
  const abertura = pose.abertura * r
  const deLado = (pose.deLado ?? 0) * r
  // o vento: os membros tremulam mais quanto mais pra trás estão
  const vento = (i: number) => Math.sin(agora / 37 + fase + i * 1.7) * 0.16 * Math.abs(pratras)
  // as costas arqueiam pra trás (o peito vai na frente); o pescoço compensa, a cabeça puxada pra frente
  const arco = pose.arco * r
  for (const nome of ['Spine', 'Spine1', 'Spine2']) girar(peca, nome, lado, -0.17 * arco)
  girar(peca, 'Neck', lado, 0.3 * arco)
  for (const [i, ladoDoCorpo] of (['Left', 'Right'] as const).entries()) {
    const pra = ladoDoCorpo === 'Left' ? 1 : -1
    // girar em volta do lado leva o membro pendurado pra trás (positivo) ou pra frente (negativo)
    girar(peca, `${ladoDoCorpo}Arm`, lado, 1.35 * pratras + vento(i))
    girar(peca, `${ladoDoCorpo}Arm`, frente, pra * (0.25 * Math.abs(pratras) + 0.9 * abertura) + 0.8 * deLado)
    girar(peca, `${ladoDoCorpo}ForeArm`, lado, 0.45 * pratras + vento(i + 2))
    girar(peca, `${ladoDoCorpo}UpLeg`, lado, 0.7 * pratras + vento(i + 4) * 0.7)
    girar(peca, `${ladoDoCorpo}UpLeg`, frente, pra * (0.1 * Math.abs(pratras) + 0.35 * abertura) + 0.45 * deLado)
    // o joelho só dobra pra trás
    girar(peca, `${ladoDoCorpo}Leg`, lado, Math.max(0, 0.95 * pratras) + Math.abs(vento(i + 6)) * 0.6)
  }
}
