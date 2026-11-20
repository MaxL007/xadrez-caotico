import * as THREE from 'three'
import { girarOssoNoMundo, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { menosMovimento } from './golpeQuePesa'

// A inércia das peças ("o golpe que pesa"): andando, o tronco inclina pra frente, mais quanto mais rápido; ao parar, o
// corpo passa um pouco do ponto e volta, como uma mola. Os braços (e com eles a arma, o cajado, a capa) ficam um pouco
// pra trás no arranque e balançam na parada. A pose vai por cima do clipe, osso por osso, como a luta sem arma: desfeita
// antes dos clipes e refeita depois de todas as outras poses.

const OSSOS = ['Spine', 'LeftArm', 'RightArm']
/** Quanto o tronco inclina por unidade de velocidade (casas por segundo, no tabuleiro), e o máximo. */
const INCLINACAO_POR_VELOCIDADE = 0.06
const INCLINACAO_MAXIMA = 0.16
/** A mola: dura e pouco amortecida, pra passar do ponto uma vez ao parar. */
const DUREZA = 70
const AMORTECIMENTO = 10
/** Mais que isso num quadro só não é andar: é a peça aparecendo em outro lugar (tabuleiro novo). */
const SALTO = 0.5

interface Inercia {
  x: number
  z: number
  inclinacao: number
  giro: number
  ossos: OssoSalvo[]
}

const estados = new WeakMap<THREE.Object3D, Inercia>()
const posadas = new Set<THREE.Object3D>()
const LADO = new THREE.Vector3(1, 0, 0)

/** Antes dos clipes, a cada quadro (é a última pose posta, então é a primeira a sair). */
export function desfazerInercia() {
  for (const peca of posadas) {
    const estado = estados.get(peca)
    if (estado) restaurarOssos(estado.ossos)
  }
  posadas.clear()
}

/** Depois de todas as outras poses, a cada quadro; `dt` em segundos (0 no congelamento do impacto). */
export function aplicarInercia(pecas: THREE.Object3D[], dt: number) {
  if (dt <= 0 || menosMovimento()) return
  for (const peca of pecas) {
    if (!peca.userData.acoesRPG) continue
    let estado = estados.get(peca)
    if (!estado) {
      estado = { x: peca.position.x, z: peca.position.z, inclinacao: 0, giro: 0, ossos: [] }
      estados.set(peca, estado)
    }
    const dx = peca.position.x - estado.x
    const dz = peca.position.z - estado.z
    estado.x = peca.position.x
    estado.z = peca.position.z
    const pulou = Math.hypot(dx, dz) > SALTO
    // a velocidade pra frente (pra onde a peça olha)
    const frente = pulou ? 0 : (dx * Math.sin(peca.rotation.y) + dz * Math.cos(peca.rotation.y)) / dt
    const alvo = THREE.MathUtils.clamp(frente * INCLINACAO_POR_VELOCIDADE, -INCLINACAO_MAXIMA / 2, INCLINACAO_MAXIMA)
    const aceleracao = DUREZA * (alvo - estado.inclinacao) - AMORTECIMENTO * estado.giro
    estado.giro += aceleracao * dt
    estado.inclinacao += estado.giro * dt
    if (Math.abs(estado.inclinacao) < 0.002 && Math.abs(estado.giro) < 0.01) continue
    peca.updateWorldMatrix(true, false)
    estado.ossos = salvarOssos(peca, OSSOS)
    const eixo = LADO.clone().transformDirection(peca.matrixWorld)
    const tronco = ossoRPG(peca, 'Spine')
    if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(eixo, estado.inclinacao))
    // os braços vão pro outro lado: ficam pra trás no arranque e jogam pra frente na parada
    for (const lado of ['LeftArm', 'RightArm']) {
      const braco = ossoRPG(peca, lado)
      if (braco) girarOssoNoMundo(braco, new THREE.Quaternion().setFromAxisAngle(eixo, -0.7 * estado.inclinacao))
    }
    posadas.add(peca)
  }
}
