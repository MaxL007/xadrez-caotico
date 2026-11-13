import * as THREE from 'three'

// Os ossos das peças RPG, o mesmo esqueleto do Mixamo nas seis: achar pelo nome, girar no mundo e levar uma mão ou um
// pé até um ponto, por cima do clipe que está tocando. Servem à marreta da torre e à luta sem arma.

export function ossoRPG(mesh: THREE.Object3D, nome: string): THREE.Object3D | undefined {
  return mesh.getObjectByName(`mixamorig${nome}`) ?? mesh.getObjectByName(`mixamorig:${nome}`)
}

/** Gira um osso por um giro dado no mundo, levando junto o que vem depois dele. */
export function girarOssoNoMundo(osso: THREE.Object3D, giro: THREE.Quaternion) {
  const pai = (osso.parent as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion())
  osso.quaternion.premultiply(pai.clone().invert().multiply(giro).multiply(pai))
  osso.updateWorldMatrix(false, true)
}

/** Vira o osso pro filho dele apontar pro alvo; com `peso` menor, vai só uma parte do caminho. */
export function apontarOsso(osso: THREE.Object3D, filho: THREE.Object3D, alvo: THREE.Vector3, peso: number) {
  const base = osso.getWorldPosition(new THREE.Vector3())
  const atual = filho.getWorldPosition(new THREE.Vector3()).sub(base).normalize()
  const giro = new THREE.Quaternion().setFromUnitVectors(atual, alvo.clone().sub(base).normalize())
  girarOssoNoMundo(osso, new THREE.Quaternion().slerp(giro, peso))
}

/** Dois ossos (ombro e cotovelo, quadril e joelho) levando a ponta até `alvo`; a junta do meio dobra pro lado de
 * `dobra`, dado no espaço da peça. Longe demais, o membro estica todo na direção do alvo. */
function levarMembroAte(peca: THREE.Object3D, nomes: [string, string, string], dobraNaPeca: THREE.Vector3, alvo: THREE.Vector3, peso: number) {
  const [raiz, meio, ponta] = nomes.map((nome) => ossoRPG(peca, nome))
  if (!raiz || !meio || !ponta || peso <= 0) return
  const naRaiz = raiz.getWorldPosition(new THREE.Vector3())
  const noMeio = meio.getWorldPosition(new THREE.Vector3())
  const primeiro = naRaiz.distanceTo(noMeio)
  const segundo = noMeio.distanceTo(ponta.getWorldPosition(new THREE.Vector3()))
  const rumo = alvo.clone().sub(naRaiz)
  const distancia = Math.min(rumo.length(), (primeiro + segundo) * 0.995)
  rumo.normalize()
  const aoLongo = (primeiro * primeiro - segundo * segundo + distancia * distancia) / (2 * distancia)
  const pontaDoMeio = Math.sqrt(Math.max(0, primeiro * primeiro - aoLongo * aoLongo))
  const dobra = dobraNaPeca.clone().transformDirection(peca.matrixWorld)
  dobra.addScaledVector(rumo, -dobra.dot(rumo)).normalize()
  const destinoDoMeio = naRaiz.clone().addScaledVector(rumo, aoLongo).addScaledVector(dobra, pontaDoMeio)
  apontarOsso(raiz, meio, destinoDoMeio, peso)
  apontarOsso(meio, ponta, naRaiz.clone().addScaledVector(rumo, distancia), peso)
}

/** Leva a mão até `alvo` dobrando o cotovelo pra fora e pra baixo, como um braço de verdade. */
export function levarBracoAte(peca: THREE.Object3D, lado: 'Left' | 'Right', alvo: THREE.Vector3, peso: number) {
  levarMembroAte(peca, [`${lado}Arm`, `${lado}ForeArm`, `${lado}Hand`], new THREE.Vector3(lado === 'Right' ? -1 : 1, -0.8, -0.4), alvo, peso)
}

/** Leva o pé até `alvo` com o joelho dobrando pra frente e pra cima. */
export function levarPernaAte(peca: THREE.Object3D, lado: 'Left' | 'Right', alvo: THREE.Vector3, peso: number) {
  levarMembroAte(peca, [`${lado}UpLeg`, `${lado}Leg`, `${lado}Foot`], new THREE.Vector3(lado === 'Right' ? -0.15 : 0.15, 0.45, 1), alvo, peso)
}

/** Um osso com o giro de um instante: o mixer só regrava um osso quando o valor do clipe muda, então a pose posta por
 * cima tem de ser desfeita antes do clipe seguinte, senão o giro de um quadro soma no do outro. */
export type OssoSalvo = [THREE.Object3D, THREE.Quaternion]

export function salvarOssos(peca: THREE.Object3D, nomes: string[]): OssoSalvo[] {
  return nomes.flatMap((nome): OssoSalvo[] => {
    const osso = ossoRPG(peca, nome)
    return osso ? [[osso, osso.quaternion.clone()]] : []
  })
}

export function restaurarOssos(ossos: OssoSalvo[]) {
  for (const [osso, posicao] of ossos) osso.quaternion.copy(posicao)
}
