import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from './ossos'

// A luta de quem não tem arma. Toda peça começa assim (as armas saem pela Loja e pelas conquistas): em vez de brandir
// uma espada que não está na mão ou de lançar um poder, ela vai até a vítima e bate com o corpo, num jab seguido de um
// direto ou num chute de frente. A pose vai por cima do clipe da peça, osso por osso, como a marreta da torre: o clipe
// cuida do resto do corpo (a respiração do Parado) e a luta põe os braços, a perna e o tronco onde o golpe pede.

export type GolpeSemArma = 'socos' | 'chute'

/** Só nos testes e nas fotos: o golpe que sai sempre, sem sorteio. */
let golpeForcado: GolpeSemArma | null = null
export function forcarGolpeSemArma(golpe: GolpeSemArma | null) {
  golpeForcado = golpe
}

export const sortearGolpeSemArma = (): GolpeSemArma => golpeForcado ?? (Math.random() < 0.5 ? 'socos' : 'chute')

/** Até onde o golpe chega, do centro de quem bate (no tamanho do modelo): o braço é curto, a perna vai mais longe. */
const ALCANCE: Record<GolpeSemArma, number> = { socos: 0.27, chute: 0.4 }
/** Do centro da vítima até a frente do corpo dela (no tamanho do modelo); o cavalo é comprido, a cabeça vem antes. */
const frenteDaVitima = (vitima: THREE.Object3D) => (vitima.userData.tipo === 'n' ? 0.2 : 0.1)

/** A que distância do centro da vítima quem bate para, pro golpe chegar nela esticado. */
export function distanciaDaLuta(golpe: GolpeSemArma, atacante: THREE.Object3D, vitima: THREE.Object3D): number {
  return ALCANCE[golpe] * atacante.scale.x + frenteDaVitima(vitima) * vitima.scale.x
}

/** Os instantes de cada golpe, em ms desde o começo: o jab (ou a perna começando a esticar), o acerto e o fim. */
const TEMPOS: Record<GolpeSemArma, { antes: number; acerto: number; fim: number }> = {
  socos: { antes: 250, acerto: 470, fim: 900 },
  chute: { antes: 330, acerto: 480, fim: 1000 },
}

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'RightUpLeg', 'RightLeg']

// as poses, no espaço da peça (ela olha pra +z, e o lado direito fica em -x)
const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
/** Os punhos na frente do queixo. */
const GUARDA_ESQ = new THREE.Vector3(0.06, 0.55, 0.12)
const GUARDA_DIR = new THREE.Vector3(-0.06, 0.53, 0.1)
/** No chute, o braço direito desce pra trás, pra equilibrar. */
const EQUILIBRIO_DIR = new THREE.Vector3(-0.17, 0.42, -0.06)
/** O joelho recolhido no alto, antes de a perna esticar. */
const CAMARA = new THREE.Vector3(-0.08, 0.24, 0.13)

export interface AvisosDaLuta {
  /** Nos socos, o jab: o primeiro, que não derruba. No chute, a perna começando a esticar. */
  antes?: () => void
  /** O golpe chegou na vítima. */
  aoAcertar: () => void
}

interface Luta {
  peca: THREE.Object3D
  golpe: GolpeSemArma
  inicio: number
  /** Os ossos como o clipe deixou neste quadro: a pose da luta é desfeita pra eles antes do quadro seguinte. */
  ossos: OssoSalvo[]
  /** Onde cada golpe mira, no espaço da peça. */
  jab: THREE.Vector3
  direto: THREE.Vector3
  chute: THREE.Vector3
  avisou: boolean
  acertou: boolean
  continua: () => boolean
  avisos: AvisosDaLuta
}

const lutas = new Set<Luta>()

const suave = (t: number) => t * t * (3 - 2 * t)
/** 0 antes de `de`, 1 depois de `ate`, suave no meio. */
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const entre = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t)

/** Começa o golpe, com quem bate já virado pra vítima e perto dela (`distanciaDaLuta`). `continua` falso (outro lance
 * entrou no meio) larga a pose sem acertar. */
export function lutarSemArma(peca: THREE.Object3D, vitima: THREE.Object3D, golpe: GolpeSemArma, continua: () => boolean, avisos: AvisosDaLuta) {
  peca.updateWorldMatrix(true, true)
  // o peito da vítima, visto de quem bate; muito alto ou muito baixo, o golpe fica onde um corpo alcança
  const peito = peca.worldToLocal(vitima.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.48 * vitima.scale.y, 0)))
  const altura = THREE.MathUtils.clamp(peito.y, 0.42, 0.62)
  const frente = Math.max(peito.z, 0.3)
  lutas.add({
    peca,
    golpe,
    inicio: performance.now(),
    ossos: salvarOssos(peca, OSSOS),
    jab: new THREE.Vector3(0.03, altura + 0.02, frente),
    direto: new THREE.Vector3(-0.02, altura, frente),
    chute: new THREE.Vector3(-0.04, THREE.MathUtils.clamp(peito.y * 0.62, 0.22, 0.36), frente),
    avisou: false,
    acertou: false,
    continua,
    avisos,
  })
}

/** Inclina ou torce o tronco (metade em cada osso da coluna) em volta de um eixo da peça. */
function girarTronco(peca: THREE.Object3D, eixoNaPeca: THREE.Vector3, angulo: number) {
  if (Math.abs(angulo) < 1e-4) return
  const giro = new THREE.Quaternion().setFromAxisAngle(eixoNaPeca.clone().transformDirection(peca.matrixWorld), angulo / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(peca, nome)
    if (osso) girarOssoNoMundo(osso, giro)
  }
}

function posar(l: Luta, t: number) {
  const { peca } = l
  peca.updateWorldMatrix(true, true)
  const noMundo = (v: THREE.Vector3) => peca.localToWorld(v.clone())
  if (l.golpe === 'socos') {
    const guarda = sobe(t, 0, 140) * (1 - sobe(t, 640, 900))
    const jab = sobe(t, 140, 250) * (1 - sobe(t, 260, 360))
    const direto = sobe(t, 330, 470) * (1 - sobe(t, 540, 700))
    // o direto gira o ombro direito pra frente, e o corpo vai junto com o soco
    girarTronco(peca, CIMA, (0.55 * direto - 0.2 * jab) * guarda)
    girarTronco(peca, LADO, 0.14 * direto * guarda)
    levarBracoAte(peca, 'Left', noMundo(entre(GUARDA_ESQ, l.jab, jab)), guarda)
    levarBracoAte(peca, 'Right', noMundo(entre(GUARDA_DIR, l.direto, direto)), guarda)
    return
  }
  const guarda = sobe(t, 0, 160) * (1 - sobe(t, 700, 1000))
  const perna = sobe(t, 60, 300) * (1 - sobe(t, 640, 900))
  const estica = sobe(t, 330, 480) * (1 - sobe(t, 560, 700))
  // pra perna esticar alto, o tronco vai pra trás
  girarTronco(peca, LADO, -(0.08 * perna + 0.3 * estica))
  levarPernaAte(peca, 'Right', noMundo(entre(CAMARA, l.chute, estica)), perna)
  levarBracoAte(peca, 'Left', noMundo(GUARDA_ESQ), guarda)
  levarBracoAte(peca, 'Right', noMundo(entre(GUARDA_DIR, EQUILIBRIO_DIR, estica)), guarda)
}

/** A peça está no meio de um golpe: nessa hora não começa um gesto. */
export function estaLutando(peca: THREE.Object3D): boolean {
  for (const l of lutas) if (l.peca === peca) return true
  return false
}

/** Antes dos clipes, a cada quadro: tira a pose da luta, pro clipe partir do que ele mesmo deixou. */
export function desfazerPosesDasLutas() {
  for (const l of lutas) restaurarOssos(l.ossos)
}

/** Depois dos clipes, a cada quadro: a pose da luta precisa ser a última a mexer nos ossos. */
export function atualizarLutas(agora: number) {
  for (const l of lutas) {
    if (!l.continua() || !l.peca.parent) {
      lutas.delete(l)
      continue
    }
    const t = agora - l.inicio
    const tempos = TEMPOS[l.golpe]
    if (!l.avisou && t >= tempos.antes) {
      l.avisou = true
      l.avisos.antes?.()
    }
    if (!l.acertou && t >= tempos.acerto) {
      l.acertou = true
      l.avisos.aoAcertar()
    }
    if (t >= tempos.fim) {
      lutas.delete(l)
      continue
    }
    l.ossos = salvarOssos(l.peca, OSSOS)
    posar(l, t)
  }
}
