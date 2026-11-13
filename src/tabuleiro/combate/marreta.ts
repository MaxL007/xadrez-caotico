import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, type OssoSalvo, restaurarOssos, salvarOssos } from '../pecas/ossos'
import { tocarSom } from '../../som/sons'
import { prepararParaSumir } from '../animacoes/queda'
import { animarParticulas, geoOndaPoder, type Particula, texturaBrilho } from './poderes'
import { materiaisPorFaccao, materialCoroa, materialLaminaEspada } from '../pecas/materiais'
import { mostrarEspadaRPG, novaSequenciaRPG } from '../pecas/modelosRPG'

// As armas da torre feitas em código: marreta, machado e maça, com a pose do corpo seguindo o cabo, a peça presa na maça e os efeitos da pancada.

// ---------------------------------------------------------------------------
// Marreta da torre — na captura a torre vai até a vítima, a marreta surge nas mãos dela, sobe acima
// da cabeça e desce com tudo: o tabuleiro treme, a madeira racha, sobe poeira e a vítima fica
// achatada. O corpo não segue um clipe do modelo: a cada quadro, por cima do "Parado", a pose da
// marreta é calculada e os braços são levados até o cabo, pras duas mãos ficarem nele o tempo todo.
// ---------------------------------------------------------------------------
const COMPRIMENTO_CABO_MARRETA = 0.72
/** Onde cada mão segura, a partir da ponta do cabo. */
const PEGADA_MAO_ESQUERDA = 0.03
const PEGADA_MAO_DIREITA = 0.12

const geoCaboMarreta = new THREE.CylinderGeometry(0.017, 0.022, COMPRIMENTO_CABO_MARRETA + 0.05, 16)
const geoPegadaMarreta = new THREE.CylinderGeometry(0.026, 0.026, 0.22, 16)
const geoPonteiraMarreta = new THREE.SphereGeometry(0.034, 16, 12)
const geoCabecaMarreta = new RoundedBoxGeometry(0.25, 0.25, 0.36, 3, 0.03)
const geoCintaMarreta = new RoundedBoxGeometry(0.265, 0.265, 0.04, 2, 0.012)
const geoFaceMarreta = new RoundedBoxGeometry(0.27, 0.27, 0.05, 2, 0.015)
const geoAmeiaMarreta = new RoundedBoxGeometry(0.075, 0.075, 0.06, 2, 0.012)
const geoGemaMarreta = new THREE.SphereGeometry(0.036, 16, 12)

/** A marreta é da peça: os mesmos materiais do corpo (armadura), dos detalhes, do dourado da coroa e
 * do brilho, e as ameias da torre nas duas faces. Montada com a ponta do cabo na origem, o cabo pra
 * cima (+Y) e as faces da cabeça em Z: girando em X, ela desce batendo com a face. */
export const ARMAS_DA_TORRE = ['marreta', 'machado', 'maca']

/** A lâmina do machado em meia-lua, no plano do golpe (Y pra cima, Z pra frente): a curva de fora é o fio, a de
 * dentro abraça o cabo. `espessura` em X. */
function laminaMeiaLua(espessura: number, raioFora: number, raioDentro: number): THREE.BufferGeometry {
  const forma = new THREE.Shape()
  const abertura = THREE.MathUtils.degToRad(68)
  // a curva de fora, centrada um pouco atrás do cabo, e a de dentro voltando, mais perto
  forma.absarc(0.04, 0, raioFora, -abertura, abertura, false)
  forma.absarc(-0.02, 0, raioDentro, abertura * 0.95, -abertura * 0.95, true)
  forma.closePath()
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 24 })
  // a forma foi desenhada com X pra frente: vira pra Z, e a espessura fica em X, centrada no cabo
  geo.rotateY(-Math.PI / 2)
  geo.translate(espessura / 2, 0, 0)
  return geo
}

/** O fio dourado acompanhando a curva da lâmina. */
function filoMeiaLua(): THREE.BufferGeometry {
  const abertura = THREE.MathUtils.degToRad(68)
  const geo = new THREE.TorusGeometry(0.2, 0.009, 6, 32, abertura * 2)
  geo.rotateZ(-abertura)
  geo.translate(0.04, 0, 0)
  // no mesmo plano da lâmina: X da forma vira Z
  geo.rotateY(-Math.PI / 2)
  return geo
}

export function criarMarreta(cor: 'w' | 'b', arma = 'marreta'): THREE.Group {
  const { armadura, detalhe, brilho } = materiaisPorFaccao[cor]
  const marreta = new THREE.Group()
  const topo = COMPRIMENTO_CABO_MARRETA
  const pecas: [THREE.BufferGeometry, THREE.Material, number, number, number][] = [
    [geoCaboMarreta, detalhe, 0, topo / 2, 0],
    [geoPegadaMarreta, armadura, 0, 0.1, 0],
    [geoPonteiraMarreta, materialCoroa, 0, -0.01, 0],
  ]
  if (arma === 'machado') {
    // a lâmina em meia-lua bate pra frente, onde a marreta bate com a face, com o fio dourado na curva; atrás, uma ponta
    pecas.push(
      [new RoundedBoxGeometry(0.12, 0.15, 0.13, 2, 0.02), armadura, 0, topo, 0],
      [laminaMeiaLua(0.03, 0.2, 0.15), materialLaminaEspada, 0, topo, 0],
      [filoMeiaLua(), materialCoroa, 0, topo, 0],
      [geoGemaMarreta, brilho, 0.065, topo, 0],
      [geoGemaMarreta, brilho, -0.065, topo, 0],
    )
  } else if (arma === 'maca') {
    pecas.push([new THREE.SphereGeometry(0.15, 16, 12), armadura, 0, topo, 0], [new THREE.CylinderGeometry(0.155, 0.155, 0.03, 16), materialCoroa, 0, topo, 0])
  } else {
    pecas.push(
      [geoCabecaMarreta, armadura, 0, topo, 0],
      [geoCintaMarreta, materialCoroa, 0, topo, 0],
      [geoFaceMarreta, detalhe, 0, topo, 0.175],
      [geoFaceMarreta, detalhe, 0, topo, -0.175],
      [geoGemaMarreta, brilho, 0.13, topo, 0],
      [geoGemaMarreta, brilho, -0.13, topo, 0],
    )
    // as ameias, nos quatro cantos de cada face
    for (const face of [1, -1]) {
      for (const x of [-0.095, 0.095]) {
        for (const y of [-0.095, 0.095]) pecas.push([geoAmeiaMarreta, detalhe, x, topo + y, face * 0.225])
      }
    }
  }
  for (const [geometria, material, x, y, z] of pecas) {
    const parte = new THREE.Mesh(geometria, material)
    parte.position.set(x, y, z)
    parte.castShadow = true
    marreta.add(parte)
  }
  // pontas que saem da cabeça, cada uma apontando pra fora
  const pontas: [THREE.Vector3, number, THREE.Material][] =
    arma === 'machado'
      ? [[new THREE.Vector3(0, 0, -1), 0.065, detalhe]]
      : arma === 'maca'
        ? [
            [new THREE.Vector3(1, 0, 0), 0.15, detalhe],
            [new THREE.Vector3(-1, 0, 0), 0.15, detalhe],
            [new THREE.Vector3(0, 0, 1), 0.15, detalhe],
            [new THREE.Vector3(0, 0, -1), 0.15, detalhe],
            [new THREE.Vector3(0, 1, 0), 0.15, detalhe],
            [new THREE.Vector3(1, 0.8, 1).normalize(), 0.15, brilho],
            [new THREE.Vector3(-1, 0.8, -1).normalize(), 0.15, brilho],
            [new THREE.Vector3(1, -0.8, -1).normalize(), 0.15, brilho],
            [new THREE.Vector3(-1, -0.8, 1).normalize(), 0.15, brilho],
          ]
        : []
  for (const [direcao, raio, material] of pontas) {
    const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 8), material)
    ponta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao)
    ponta.position.set(0, topo, 0).addScaledVector(direcao, raio + 0.04)
    ponta.castShadow = true
    marreta.add(ponta)
  }
  return marreta
}

/** A marreta vista de lado: `angulo` é o giro do cabo a partir da vertical (positivo pra frente);
 * `y`/`z`, a ponta do cabo; `tronco`, quanto o corpo inclina (positivo pra frente). */
interface PoseMarreta {
  angulo: number
  y: number
  z: number
  tronco: number
}
export const POSE_MARRETA_GUARDA: PoseMarreta = { angulo: 0.45, y: 0.43, z: 0.16, tronco: 0 }
const POSE_MARRETA_ERGUIDA: PoseMarreta = { angulo: -0.75, y: 0.52, z: 0.04, tronco: -0.24 }
const POSE_MARRETA_PANCADA: PoseMarreta = { angulo: 2.06, y: 0.47, z: 0.14, tronco: 0.55 }

const MARRETA_SURGIU_MS = 240
const MARRETA_ERGUIDA_MS = 640
const MARRETA_NO_ALTO_ATE_MS = 780
export const MARRETA_PANCADA_MS = 920
const MARRETA_CRAVADA_ATE_MS = 1350
const MARRETA_FIM_MS = 1700

/** A maça: depois da pancada, sobe com a peça presa nos espinhos, sacode e a peça cai. */
const POSE_MACA_SACODE: PoseMarreta = { angulo: 0.95, y: 0.5, z: 0.2, tronco: 0.12 }
export const MACA_ERGUIDA_ATE_MS = 1900
const MACA_SOLTA_MS = 2420
const MACA_SACODE_ATE_MS = 2650
const MACA_FIM_MS = 3050

function misturarPoses(a: PoseMarreta, b: PoseMarreta, t: number): PoseMarreta {
  const m = (x: number, y: number) => x + (y - x) * t
  return { angulo: m(a.angulo, b.angulo), y: m(a.y, b.y), z: m(a.z, b.z), tronco: m(a.tronco, b.tronco) }
}
const suaveMarreta = (t: number) => t * t * (3 - 2 * t)

/** Em que ponto do golpe a marreta está: `peso` é quanto os braços seguem o cabo (0 = o clipe
 * normal da peça) e `escala`, o tamanho da marreta, que surge e some nas mãos. */
function poseDaMarreta(decorrido: number, pancada = POSE_MARRETA_PANCADA): { pose: PoseMarreta; peso: number; escala: number } {
  if (decorrido < MARRETA_SURGIU_MS) {
    const t = suaveMarreta(decorrido / MARRETA_SURGIU_MS)
    return { pose: POSE_MARRETA_GUARDA, peso: t, escala: t }
  }
  if (decorrido < MARRETA_ERGUIDA_MS) {
    const t = suaveMarreta((decorrido - MARRETA_SURGIU_MS) / (MARRETA_ERGUIDA_MS - MARRETA_SURGIU_MS))
    return { pose: misturarPoses(POSE_MARRETA_GUARDA, POSE_MARRETA_ERGUIDA, t), peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_NO_ALTO_ATE_MS) {
    // no alto, um tremor do peso, antes de descer
    const tremor = 0.02 * Math.sin(decorrido / 18)
    return { pose: { ...POSE_MARRETA_ERGUIDA, angulo: POSE_MARRETA_ERGUIDA.angulo + tremor }, peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_PANCADA_MS) {
    const t = (decorrido - MARRETA_NO_ALTO_ATE_MS) / (MARRETA_PANCADA_MS - MARRETA_NO_ALTO_ATE_MS)
    return { pose: misturarPoses(POSE_MARRETA_ERGUIDA, pancada, t * t * t), peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_CRAVADA_ATE_MS) {
    // pulo da cabeça da marreta logo depois de bater
    const t = (decorrido - MARRETA_PANCADA_MS) / (MARRETA_CRAVADA_ATE_MS - MARRETA_PANCADA_MS)
    const quique = 0.09 * Math.sin(Math.min(1, t * 2.5) * Math.PI)
    return { pose: { ...pancada, angulo: pancada.angulo - quique }, peso: 1, escala: 1 }
  }
  const t = suaveMarreta(Math.min(1, (decorrido - MARRETA_CRAVADA_ATE_MS) / (MARRETA_FIM_MS - MARRETA_CRAVADA_ATE_MS)))
  return { pose: misturarPoses(pancada, POSE_MARRETA_GUARDA, t), peso: 1 - t, escala: 1 - suaveMarreta(Math.max(0, t * 2 - 1)) }
}

/** `pancada`: a maça para no peito da vítima (`pancadaNoPeito`), em vez de descer até o chão como a marreta. */
function poseDaMaca(decorrido: number, pancada: PoseMarreta): { pose: PoseMarreta; peso: number; escala: number } {
  if (decorrido < MARRETA_CRAVADA_ATE_MS) return poseDaMarreta(decorrido, pancada)
  if (decorrido < MACA_ERGUIDA_ATE_MS) {
    const t = suaveMarreta((decorrido - MARRETA_CRAVADA_ATE_MS) / (MACA_ERGUIDA_ATE_MS - MARRETA_CRAVADA_ATE_MS))
    return { pose: misturarPoses(pancada, POSE_MACA_SACODE, t), peso: 1, escala: 1 }
  }
  if (decorrido < MACA_SACODE_ATE_MS) {
    // chacoalha pra frente e pra trás, cada vez mais forte, até a peça soltar
    const t = (decorrido - MACA_ERGUIDA_ATE_MS) / (MACA_SACODE_ATE_MS - MACA_ERGUIDA_ATE_MS)
    const sacode = Math.sin(t * Math.PI * 2 * 4) * (0.22 + 0.2 * t)
    return { pose: { ...POSE_MACA_SACODE, angulo: POSE_MACA_SACODE.angulo + sacode, tronco: POSE_MACA_SACODE.tronco + sacode * 0.2 }, peso: 1, escala: 1 }
  }
  const t = suaveMarreta(Math.min(1, (decorrido - MACA_SACODE_ATE_MS) / (MACA_FIM_MS - MACA_SACODE_ATE_MS)))
  return { pose: misturarPoses(POSE_MACA_SACODE, POSE_MARRETA_GUARDA, t), peso: 1 - t, escala: 1 - suaveMarreta(Math.max(0, t * 2 - 1)) }
}

/** O corpo por cima do clipe da peça: inclina o tronco e põe as duas mãos no cabo. */
export function posarComMarreta(torre: THREE.Object3D, pose: PoseMarreta, peso: number) {
  torre.updateWorldMatrix(true, true)
  const eixo = new THREE.Vector3(1, 0, 0).transformDirection(torre.matrixWorld)
  const inclinacao = new THREE.Quaternion().setFromAxisAngle(eixo, (pose.tronco * peso) / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(torre, nome)
    if (osso) girarOssoNoMundo(osso, inclinacao)
  }
  const pegada = (s: number) =>
    torre.localToWorld(new THREE.Vector3(0, pose.y + s * Math.cos(pose.angulo), pose.z + s * Math.sin(pose.angulo)))
  levarBracoAte(torre, 'Left', pegada(PEGADA_MAO_ESQUERDA), peso)
  levarBracoAte(torre, 'Right', pegada(PEGADA_MAO_DIREITA), peso)
}

/** Os ossos que o golpe mexe, com a posição de antes dele. O mixer só regrava um osso quando o valor
 * do clipe muda: sem voltar pra essa posição a cada quadro, o giro de um quadro somava no do seguinte
 * e o tronco ia dobrando até o chão. */
const OSSOS_DO_GOLPE = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']

export const salvarOssosDoGolpe = (torre: THREE.Object3D): OssoSalvo[] => salvarOssos(torre, OSSOS_DO_GOLPE)

interface Marretada {
  torre: THREE.Object3D
  marreta: THREE.Group
  ossos: OssoSalvo[]
  inicio: number
  acertou: boolean
  continua: () => boolean
  aoAcertar: () => void
  /** Só a maça: quando a peça presa nos espinhos solta. */
  aoSoltar?: () => void
  soltou: boolean
  /** Só a maça: onde ela para, no peito da vítima. */
  pancada: PoseMarreta
}
export const marretadas = new Set<Marretada>()

function encerrarMarretada(m: Marretada) {
  restaurarOssos(m.ossos)
  soltarDaMaca(m.marreta)
  m.torre.remove(m.marreta)
  marretadas.delete(m)
}

/** Roda a cada quadro, depois dos clipes: a pose precisa ser a última a mexer nos ossos. */
export function atualizarMarretadas(agora: number) {
  for (const m of marretadas) {
    if (!m.continua() || !m.torre.parent) {
      encerrarMarretada(m)
      continue
    }
    const decorrido = agora - m.inicio
    const ehMaca = m.torre.userData.arma === 'maca'
    const { pose, peso, escala } = ehMaca ? poseDaMaca(decorrido, m.pancada) : poseDaMarreta(decorrido)
    m.marreta.position.set(0, pose.y, pose.z)
    m.marreta.rotation.x = pose.angulo
    m.marreta.scale.setScalar(Math.max(0.001, escala))
    restaurarOssos(m.ossos)
    posarComMarreta(m.torre, pose, peso)
    const presa = pecasPresas.get(m.marreta)
    if (presa) pendurar(presa, agora)
    if (!m.acertou && decorrido >= MARRETA_PANCADA_MS) {
      m.acertou = true
      m.aoAcertar()
    }
    if (m.aoSoltar && !m.soltou && decorrido >= MACA_SOLTA_MS) {
      m.soltou = true
      m.aoSoltar()
    }
    if (decorrido >= (ehMaca ? MACA_FIM_MS : MARRETA_FIM_MS)) encerrarMarretada(m)
  }
}

/** Começa o golpe; `aoAcertar` roda no instante em que a marreta bate no chão (a maça, no peito da vítima: `pancada`).
 * `continua` falso (outro jogo entrou no meio) tira a marreta da mão sem acertar. */
export function baterComMarreta(
  torre: THREE.Object3D,
  cor: 'w' | 'b',
  continua: () => boolean,
  aoAcertar: () => void,
  aoSoltar?: () => void,
  pancada = POSE_MARRETA_PANCADA,
): THREE.Group {
  const marreta = criarMarreta(cor, torre.userData.arma as string | undefined)
  marreta.scale.setScalar(0.001)
  torre.add(marreta)
  marretadas.add({ torre, marreta, ossos: salvarOssosDoGolpe(torre), inicio: performance.now(), acertou: false, continua, aoAcertar, aoSoltar, soltou: false, pancada })
  return marreta
}

/** O peito da peça, no mundo: o do cavaleiro, no cavalo. */
function peitoDa(peca: THREE.Object3D): THREE.Vector3 {
  const osso = ossoRPG(peca, 'Spine2')
  if (osso) return osso.getWorldPosition(new THREE.Vector3())
  return peca.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.48 * peca.scale.y, 0))
}

// A peça presa na maça, com as medidas de verdade: a bola tem raio 0,15 e o espinho da ponta do cabo sai uns 0,1 dela.
// É esse espinho que entra no peito; a bola só encosta na frente do corpo, nunca passa por dentro dele.
/** Do centro da bola até onde ela encosta no corpo (no tamanho da torre): o raio e um fio de folga. */
const BOLA_ATE_O_CORPO = 0.162
/** Do centro da torre até o peito da vítima pra maça chegar nele com o cabo esticado: a pegada, o cabo e a bola. */
const ALCANCE_DA_MACA = 0.06 + COMPRIMENTO_CABO_MARRETA + BOLA_ATE_O_CORPO
/** Da frente do peito até o osso do peito, quando não dá pra medir (no tamanho da vítima). */
const FUNDO_DO_PEITO = 0.06

/** A torre de maça para mais longe que a de marreta: o cabo inteiro e a bola ficam entre ela e a vítima. */
export const alcanceDaMaca = (torre: THREE.Object3D, vitima: THREE.Object3D) => ALCANCE_DA_MACA * torre.scale.x + FUNDO_DO_PEITO * vitima.scale.x

/** A maça não desce até o chão: o golpe para com a bola encostada no peito da vítima e o espinho da ponta dentro dele.
 * O cabo sai mais deitado ou mais em pé conforme a altura do peito (o do cavaleiro é mais alto) e a pegada recua ou
 * avança pra bola chegar nele. */
export function pancadaNoPeito(torre: THREE.Object3D, vitima: THREE.Object3D): PoseMarreta {
  torre.updateWorldMatrix(true, false)
  vitima.updateWorldMatrix(true, true)
  const peito = torre.worldToLocal(peitoDa(vitima))
  const y = 0.48
  const angulo = Math.acos(THREE.MathUtils.clamp((peito.y - y) / COMPRIMENTO_CABO_MARRETA, -0.4, 0.4))
  const frente = Math.hypot(peito.x, peito.z) - BOLA_ATE_O_CORPO - (FUNDO_DO_PEITO * vitima.scale.x) / torre.scale.x
  const z = THREE.MathUtils.clamp(frente - COMPRIMENTO_CABO_MARRETA * Math.sin(angulo), -0.08, 0.22)
  return { angulo, y, z, tronco: 0.22 }
}

/** Visível de verdade: ela e tudo acima dela até a peça (a katana guardada, por exemplo, fica escondida). */
function visivelNaPeca(objeto: THREE.Object3D, peca: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = objeto; o && o !== peca.parent; o = o.parent) if (!o.visible) return false
  return true
}

/** Do osso do peito até a frente do corpo, medido no próprio modelo (com a armadura que ele estiver vestindo), na
 * direção em que o espinho entra. */
function fundoDoPeito(vitima: THREE.Object3D, peito: THREE.Vector3, rumo: THREE.Vector3): number {
  vitima.updateMatrixWorld(true)
  const raio = new THREE.Raycaster(peito.clone().addScaledVector(rumo, -3), rumo, 0, 3)
  const frente = raio.intersectObject(vitima, true).find((acerto) => visivelNaPeca(acerto.object, vitima))
  return frente ? THREE.MathUtils.clamp(peito.distanceTo(frente.point), 0.02, 0.3) : FUNDO_DO_PEITO * vitima.scale.x
}

/** Os ossos que a peça presa deixa cair com o peso: braços, pernas e a cabeça. */
const OSSOS_PENDURADOS = ['Neck', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']
interface PecaPresa {
  peca: THREE.Object3D
  /** A pose em que ela foi espetada: a cada quadro, o peso é posto por cima dela. */
  ossos: OssoSalvo[]
  desde: number
}
/** Por maça, a peça presa nela. */
const pecasPresas = new Map<THREE.Group, PecaPresa>()

/** Espetada, a peça fica mole: os braços e as pernas caem pro chão, seja qual for a inclinação do cabo, e a cabeça
 * tomba pra frente. Sem os clipes (ela saiu do tabuleiro), só isso mexe nos ossos dela. */
function pendurar(presa: PecaPresa, agora: number) {
  const { peca } = presa
  restaurarOssos(presa.ossos)
  const peso = suaveMarreta(Math.min(1, (agora - presa.desde) / 280))
  peca.updateWorldMatrix(true, true)
  const ponto = new THREE.Vector3()
  for (const lado of ['Left', 'Right'] as const) {
    const ombro = ossoRPG(peca, `${lado}Arm`)
    if (ombro) levarBracoAte(peca, lado, ombro.getWorldPosition(ponto).add(new THREE.Vector3(0, -1, 0)), 0.9 * peso)
    const quadril = ossoRPG(peca, `${lado}UpLeg`)
    if (quadril) levarPernaAte(peca, lado, quadril.getWorldPosition(ponto).add(new THREE.Vector3(0, -1, 0)), 0.75 * peso)
  }
  const pescoco = ossoRPG(peca, 'Neck')
  if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0).transformDirection(peca.matrixWorld), 0.5 * peso))
}

/** A maça soltou a peça (ou o golpe parou no meio): ela volta à pose dos clipes. */
export function soltarDaMaca(maca: THREE.Group) {
  const presa = pecasPresas.get(maca)
  if (!presa) return
  restaurarOssos(presa.ossos)
  pecasPresas.delete(maca)
}

/** No instante do golpe, a vítima vira de frente pra torre e o espinho da ponta entra no peito dela: o corpo fica
 * encostado na bola, nem antes nem dentro dela, medido na frente do próprio corpo. Daí ela vai junto com a maça. */
export function prenderPeloPeito(maca: THREE.Group, vitima: THREE.Object3D, torre: THREE.Object3D) {
  maca.updateWorldMatrix(true, false)
  const bola = maca.localToWorld(new THREE.Vector3(0, COMPRIMENTO_CABO_MARRETA, 0))
  const rumo = maca.localToWorld(new THREE.Vector3(0, COMPRIMENTO_CABO_MARRETA + 1, 0)).sub(bola).normalize()
  // de frente pra quem bateu: é o peito que encontra o espinho, não o ombro
  vitima.rotation.y = Math.atan2(-rumo.x, -rumo.z)
  vitima.updateMatrixWorld(true)
  const peito = peitoDa(vitima)
  const ondeOPeitoFica = bola.addScaledVector(rumo, BOLA_ATE_O_CORPO * torre.scale.x + fundoDoPeito(vitima, peito, rumo))
  vitima.position.add(ondeOPeitoFica.sub(peito))
  vitima.updateWorldMatrix(false, true)
  maca.attach(vitima)
  pecasPresas.set(maca, { peca: vitima, ossos: salvarOssos(vitima, OSSOS_PENDURADOS), desde: performance.now() })
}

/** A peça que soltou dos espinhos cai no tabuleiro, rolando, e some. */
export function cairDaMaca(cena: THREE.Object3D, peca: THREE.Object3D, aoTerminar: () => void) {
  cena.attach(peca)
  const definirOpacidade = prepararParaSumir(peca)
  const velocidade = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6)
  const giro = new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)
  const chao = 0.05
  let anterior = performance.now()
  let noChaoDesde = 0
  function passo(agora: number) {
    const dt = Math.min(0.05, (agora - anterior) / 1000)
    anterior = agora
    if (!noChaoDesde) {
      velocidade.y -= 6 * dt
      peca.position.addScaledVector(velocidade, dt)
      peca.rotation.x += giro.x * dt
      peca.rotation.z += giro.z * dt
      if (peca.position.y <= chao) {
        peca.position.y = chao
        noChaoDesde = agora
        tocarSom(`queda:${peca.userData.tipo as string}`)
      }
    } else {
      const t = (agora - noChaoDesde) / 600
      definirOpacidade(Math.max(0, 1 - t))
      if (t >= 1) {
        aoTerminar()
        return
      }
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

export function poeiraDaPancada(cena: THREE.Object3D, x: number, z: number) {
  const agora = performance.now()
  const particulas: Particula[] = []
  const soltar = (cor: number, tamanho: number, vida: number, sobe: number, espalha: number) => {
    const material = new THREE.SpriteMaterial({ map: texturaBrilho, color: cor, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(tamanho)
    sprite.position.set(x, 0.1, z)
    cena.add(sprite)
    const angulo = Math.random() * Math.PI * 2
    const velocidade = new THREE.Vector3(Math.cos(angulo) * espalha, sobe, Math.sin(angulo) * espalha)
    particulas.push({ objeto: sprite, nasceu: agora, vida, velocidade, tamanho })
  }
  // poeira baixa, que corre pelo chão, e lascas de madeira que saltam
  for (let i = 0; i < 20; i++) soltar(0xc9b79c, 0.34 + Math.random() * 0.3, 650 + Math.random() * 450, 0.25 + Math.random() * 0.5, 0.9 + Math.random() * 1.3)
  for (let i = 0; i < 14; i++) soltar(0x6b4423, 0.05 + Math.random() * 0.05, 550 + Math.random() * 300, 1.6 + Math.random() * 1.8, 0.5 + Math.random() * 1.2)
  animarParticulas(cena, particulas)
}

const ONDA_MARRETA_MS = 480

/** A onda da pancada corre pelo chão na cor do exército de quem bateu. */
export function ondaDaMarretada(cena: THREE.Object3D, x: number, z: number, cor: THREE.ColorRepresentation) {
  const material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  const onda = new THREE.Mesh(geoOndaPoder, material)
  onda.rotation.x = -Math.PI / 2
  onda.position.set(x, 0.03, z)
  cena.add(onda)
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / ONDA_MARRETA_MS)
    onda.scale.setScalar(1 + (1 - (1 - t) * (1 - t)) * 9)
    material.opacity = 0.85 * (1 - t)
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    cena.remove(onda)
    material.dispose()
  }
  requestAnimationFrame(passo)
}

const ACHATAR_MS = 90
const ACHATADA_MS = 380
const ACHATADA_SOME_MS = 380

/** A vítima da marreta: achata de uma vez, como num desenho animado, fica assim um instante e some. */
export function esmagarPeca(mesh: THREE.Object3D, aoTerminar: () => void) {
  const definirOpacidade = prepararParaSumir(mesh)
  novaSequenciaRPG(mesh)
  mostrarEspadaRPG(mesh, false)
  const base = mesh.scale.clone()
  const inicio = performance.now()
  function passo(agora: number) {
    const decorrido = agora - inicio
    const t = Math.min(1, decorrido / ACHATAR_MS)
    mesh.scale.set(base.x * (1 + 0.5 * t), base.y * (1 - 0.88 * t), base.z * (1 + 0.5 * t))
    const sumir = (decorrido - ACHATAR_MS - ACHATADA_MS) / ACHATADA_SOME_MS
    if (sumir > 0) definirOpacidade(1 - Math.min(1, sumir))
    if (sumir >= 1) {
      aoTerminar()
      return
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}
