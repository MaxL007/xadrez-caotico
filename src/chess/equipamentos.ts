import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Armaduras e armas da personalização. Todas as peças têm o mesmo corpo e o mesmo esqueleto do Mixamo, em
// pose de braços abertos: as medidas abaixo são as desse corpo, no espaço do modelo (frente em +Z, braço
// esquerdo em +X). Cada parte nova vira malha com esqueleto, presa ao osso da parte do corpo que cobre: assim
// acompanha os clipes (andar, golpes, mortais) sem conta nenhuma por quadro. As partes de mesmo material
// viram uma malha só, pra 16 peças vestidas não pesarem no celular.

export interface MateriaisDaPeca {
  armadura: THREE.Material
  detalhe: THREE.Material
  brilho: THREE.Material
  coroa: THREE.Material
  lamina: THREE.Material
}
type Papel = keyof MateriaisDaPeca

/** Um osso só, ou dois misturados pela altura do vértice (o tronco dobra entre o quadril e o peito). */
type Osso = string | { baixo: string; alto: string; y0: number; y1: number }

/** `naMao`/`naBainha`: a espada do peão, que aparece e some conforme ele saca e guarda. */
type Camada = 'fixa' | 'naMao' | 'naBainha'

interface Parte {
  geo: THREE.BufferGeometry
  papel: Papel
  osso: Osso
  pos: [number, number, number]
  rot?: [number, number, number]
  esc?: [number, number, number]
  camada?: Camada
  /** Matriz pronta, quando a parte segue uma linha qualquer (a bainha). Substitui pos/rot/esc. */
  matriz?: THREE.Matrix4
}

type Lado = 'Left' | 'Right'
/** O braço e a perna esquerdos ficam em +X. */
const LADOS: [1 | -1, Lado][] = [
  [1, 'Left'],
  [-1, 'Right'],
]
const porLado = (montar: (s: 1 | -1, lado: Lado) => Parte[]) => LADOS.flatMap(([s, lado]) => montar(s, lado))

const caixa = (x: number, y: number, z: number, raio = 0.006) => new RoundedBoxGeometry(x, y, z, 2, Math.min(raio, x / 2, y / 2, z / 2) * 0.99)
const cilindro = (cima: number, baixo: number, altura: number, lados = 12) => new THREE.CylinderGeometry(cima, baixo, altura, lados)
const esfera = (raio: number, largura = 10, altura = 8) => new THREE.SphereGeometry(raio, largura, altura)
const cone = (raio: number, altura: number, lados = 8) => new THREE.ConeGeometry(raio, altura, lados)
const TRONCO: Osso = { baixo: 'Hips', alto: 'Spine2', y0: 0.31, y1: 0.61 }

// --- cabeça: o elmo fica por baixo do chapéu, da coroa ou da mitra, que dizem qual peça é ----------
function elmo(): Parte[] {
  return [
    { geo: cilindro(0.074, 0.079, 0.155), papel: 'armadura', osso: 'Head', pos: [0, 0.696, 0] },
    { geo: caixa(0.108, 0.018, 0.022), papel: 'detalhe', osso: 'Head', pos: [0, 0.712, 0.073] },
    { geo: caixa(0.016, 0.062, 0.016, 0.004), papel: 'coroa', osso: 'Head', pos: [0, 0.688, 0.081] },
    { geo: esfera(0.011), papel: 'brilho', osso: 'Head', pos: [0.078, 0.7, 0] },
    { geo: esfera(0.011), papel: 'brilho', osso: 'Head', pos: [-0.078, 0.7, 0] },
  ]
}

const CABECA: Record<string, () => Parte[]> = {
  elmo,
}

// --- ombros: trocam as ombreiras redondas do modelo -----------------------------------------------
const OMBROS: Record<string, () => Parte[]> = {
  placas: () =>
    porLado((s, lado) => [
      { geo: caixa(0.118, 0.028, 0.112), papel: 'armadura', osso: `${lado}Arm`, pos: [s * 0.115, 0.607, 0], rot: [0, 0, -s * 0.32] },
      { geo: caixa(0.104, 0.024, 0.102), papel: 'detalhe', osso: `${lado}Arm`, pos: [s * 0.138, 0.584, 0], rot: [0, 0, -s * 0.58] },
      { geo: esfera(0.011), papel: 'coroa', osso: `${lado}Arm`, pos: [s * 0.105, 0.626, 0] },
    ]),
  espinhos: () =>
    porLado((s, lado) => [
      { geo: new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), papel: 'armadura', osso: `${lado}Arm`, pos: [s * 0.112, 0.572, 0] },
      { geo: cone(0.014, 0.06), papel: 'detalhe', osso: `${lado}Arm`, pos: [s * 0.108, 0.648, 0], rot: [0, 0, -s * 0.15] },
      { geo: cone(0.012, 0.05), papel: 'detalhe', osso: `${lado}Arm`, pos: [s * 0.142, 0.628, 0.03], rot: [0.35, 0, -s * 0.55] },
      { geo: cone(0.012, 0.05), papel: 'detalhe', osso: `${lado}Arm`, pos: [s * 0.142, 0.628, -0.03], rot: [-0.35, 0, -s * 0.55] },
    ]),
}

// --- mãos: o modelo não tem mão, o antebraço termina no punho ---------------------------------------
function manoplas(): Parte[] {
  return porLado((s, lado) => [
    { geo: caixa(0.075, 0.064, 0.064, 0.01), papel: 'armadura', osso: `${lado}Hand`, pos: [s * 0.362, 0.565, 0] },
    { geo: cilindro(0.041, 0.047, 0.03, 10), papel: 'detalhe', osso: `${lado}ForeArm`, pos: [s * 0.312, 0.565, 0], rot: [0, 0, Math.PI / 2] },
    { geo: caixa(0.02, 0.07, 0.068, 0.005), papel: 'coroa', osso: `${lado}Hand`, pos: [s * 0.398, 0.565, 0] },
  ])
}

const MAOS: Record<string, () => Parte[]> = {
  manoplas,
  garras: () => [
    ...manoplas(),
    ...porLado((s, lado) =>
      [-0.02, 0, 0.02].map(
        (dy): Parte => ({ geo: cone(0.009, 0.058, 6), papel: 'detalhe', osso: `${lado}Hand`, pos: [s * 0.435, 0.565 + dy, 0.012], rot: [0, 0, -s * (Math.PI / 2)] }),
      ),
    ),
  ],
}

// --- peito ----------------------------------------------------------------------------------------
function couraca(): Parte[] {
  return [
    { geo: cilindro(0.112, 0.09, 0.2, 14), papel: 'armadura', osso: TRONCO, pos: [0, 0.495, 0] },
    { geo: cilindro(0.095, 0.095, 0.028, 14), papel: 'detalhe', osso: TRONCO, pos: [0, 0.392, 0] },
    { geo: caixa(0.036, 0.028, 0.012, 0.004), papel: 'coroa', osso: TRONCO, pos: [0, 0.392, 0.097] },
    { geo: caixa(0.018, 0.17, 0.02, 0.005), papel: 'coroa', osso: TRONCO, pos: [0, 0.5, 0.103], rot: [0.11, 0, 0] },
  ]
}

const PEITO: Record<string, () => Parte[]> = {
  brasao: () => [
    ...couraca(),
    { geo: caixa(0.088, 0.092, 0.016, 0.008), papel: 'detalhe', osso: TRONCO, pos: [0, 0.522, 0.11], rot: [0.11, 0, 0] },
    { geo: esfera(0.02), papel: 'brilho', osso: TRONCO, pos: [0, 0.527, 0.12] },
  ],
}

// --- calça ----------------------------------------------------------------------------------------
const CALCA: Record<string, () => Parte[]> = {
  grevas: () =>
    porLado((s, lado) => [
      { geo: caixa(0.076, 0.13, 0.035, 0.01), papel: 'armadura', osso: `${lado}Leg`, pos: [s * 0.09, 0.092, 0.045] },
      { geo: esfera(0.032), papel: 'coroa', osso: `${lado}Leg`, pos: [s * 0.09, 0.178, 0.04] },
      { geo: caixa(0.07, 0.12, 0.03, 0.01), papel: 'detalhe', osso: `${lado}UpLeg`, pos: [s * 0.056, 0.265, 0.04] },
    ]),
}

// --- botas: o pé do modelo é o fim da perna, que segue o osso da perna -------------------------------
function ferro(): Parte[] {
  return porLado((s, lado) => [
    { geo: caixa(0.086, 0.07, 0.14, 0.012), papel: 'armadura', osso: `${lado}Leg`, pos: [s * 0.09, 0.025, 0.025] },
    { geo: cilindro(0.05, 0.055, 0.035, 10), papel: 'detalhe', osso: `${lado}Leg`, pos: [s * 0.09, 0.076, 0] },
    { geo: caixa(0.082, 0.04, 0.03, 0.008), papel: 'coroa', osso: `${lado}Leg`, pos: [s * 0.09, 0.021, 0.094] },
  ])
}

const BOTAS: Record<string, () => Parte[]> = { ferro }

// --- cajados do bispo, da rainha e do rei -----------------------------------------------------------
// Ficam na mão como os do modelo: ao longo do braço aberto, com o enfeite do lado do corpo, que fica em
// cima quando o braço desce.
const Y_MAO = 0.565
const Z_CAJADO = 0.04

function haste(s: number, lado: Lado, papel: Papel, de = 0.1, ate = 0.6): Parte[] {
  const osso = `${lado}ForeArm`
  return [
    { geo: cilindro(0.011, 0.013, ate - de, 8), papel, osso, pos: [s * ((de + ate) / 2), Y_MAO, Z_CAJADO], rot: [0, 0, Math.PI / 2] },
    { geo: cilindro(0.016, 0.012, 0.026, 8), papel: 'coroa', osso, pos: [s * ate, Y_MAO, Z_CAJADO], rot: [0, 0, Math.PI / 2] },
  ]
}

const CAJADOS: Record<string, (s: 1 | -1, lado: Lado) => Parte[]> = {
  cristal: (s, lado) => {
    const osso = `${lado}ForeArm`
    return [
      ...haste(s, lado, 'detalhe'),
      { geo: cilindro(0.021, 0.021, 0.02, 10), papel: 'coroa', osso, pos: [s * 0.103, Y_MAO, Z_CAJADO], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.OctahedronGeometry(0.042), papel: 'brilho', osso, pos: [s * 0.056, Y_MAO, Z_CAJADO], esc: [1.45, 1, 1] },
      ...[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map(
        (a): Parte => ({
          geo: cone(0.006, 0.05, 5),
          papel: 'coroa',
          osso,
          pos: [s * 0.083, Y_MAO + Math.cos(a) * 0.024, Z_CAJADO + Math.sin(a) * 0.024],
          rot: [0, 0, s * (Math.PI / 2)],
        }),
      ),
    ]
  },
  cetro: (s, lado) => {
    const osso = `${lado}ForeArm`
    return [
      ...haste(s, lado, 'coroa', 0.135, 0.52),
      { geo: esfera(0.035, 12, 10), papel: 'brilho', osso, pos: [s * 0.102, Y_MAO, Z_CAJADO] },
      { geo: cilindro(0.037, 0.037, 0.009, 14), papel: 'coroa', osso, pos: [s * 0.102, Y_MAO, Z_CAJADO], rot: [0, 0, Math.PI / 2] },
      { geo: caixa(0.05, 0.013, 0.013, 0.003), papel: 'coroa', osso, pos: [s * 0.048, Y_MAO, Z_CAJADO] },
      { geo: caixa(0.013, 0.013, 0.038, 0.003), papel: 'coroa', osso, pos: [s * 0.058, Y_MAO, Z_CAJADO] },
    ]
  },
  lua: (s, lado) => {
    const osso = `${lado}ForeArm`
    // a lua crescente aberta pro lado do corpo: o vão do arco fica na direção -s
    const arco = Math.PI * 1.25
    const vao = s === 1 ? Math.PI : 0
    return [
      ...haste(s, lado, 'detalhe'),
      { geo: new THREE.TorusGeometry(0.045, 0.011, 6, 18, arco), papel: 'coroa', osso, pos: [s * 0.055, Y_MAO, Z_CAJADO], rot: [0, 0, vao - arco - (Math.PI * 2 - arco) / 2] },
      { geo: esfera(0.017), papel: 'brilho', osso, pos: [s * 0.05, Y_MAO, Z_CAJADO] },
    ]
  },
}

/** Mão que segura o cajado em cada peça. */
const MAO_DO_CAJADO: Record<string, [1 | -1, Lado]> = { b: [1, 'Left'], q: [-1, 'Right'], k: [-1, 'Right'] }

// --- espada do peão: na mão, e guardada na bainha da katana -----------------------------------------
function espadaNaMao(): Parte[] {
  const osso = 'RightHand'
  const z = 0.006
  return [
    { geo: cilindro(0.0105, 0.0105, 0.085, 8), papel: 'detalhe', osso, pos: [-0.3425, Y_MAO, z], rot: [0, 0, Math.PI / 2], camada: 'naMao' },
    { geo: esfera(0.017, 8, 6), papel: 'coroa', osso, pos: [-0.296, Y_MAO, z], camada: 'naMao' },
    { geo: caixa(0.014, 0.02, 0.096, 0.004), papel: 'coroa', osso, pos: [-0.39, Y_MAO, z], camada: 'naMao' },
    { geo: caixa(0.27, 0.008, 0.036, 0.003), papel: 'lamina', osso, pos: [-0.53, Y_MAO, z], camada: 'naMao' },
    { geo: new THREE.BoxGeometry(0.025, 0.008, 0.025), papel: 'lamina', osso, pos: [-0.664, Y_MAO, z], rot: [0, Math.PI / 4, 0], camada: 'naMao' },
  ]
}

/** A bainha segue a linha da bainha da katana: do cabo que sai dela até a ponta. */
function espadaNaBainha(cabo: THREE.Vector3, ponta: THREE.Vector3): Parte[] {
  const direcao = ponta.clone().sub(cabo).normalize()
  const guarda = cabo.clone().addScaledVector(direcao, 0.045)
  const comprimento = ponta.distanceTo(guarda)
  const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direcao)
  const naLinha = (x: number, rotacao?: THREE.Euler) =>
    new THREE.Matrix4().compose(guarda.clone().addScaledVector(direcao, x), rotacao ? giro.clone().multiply(new THREE.Quaternion().setFromEuler(rotacao)) : giro, new THREE.Vector3(1, 1, 1))
  const deitado = new THREE.Euler(0, 0, Math.PI / 2)
  return [
    { geo: cilindro(0.0105, 0.0105, 0.085, 8), papel: 'detalhe', osso: 'Hips', pos: [0, 0, 0], matriz: naLinha(-0.0425, deitado), camada: 'naBainha' },
    { geo: esfera(0.017, 8, 6), papel: 'coroa', osso: 'Hips', pos: [0, 0, 0], matriz: naLinha(-0.09), camada: 'naBainha' },
    { geo: caixa(0.014, 0.02, 0.096, 0.004), papel: 'coroa', osso: 'Hips', pos: [0, 0, 0], matriz: naLinha(0) },
    { geo: caixa(comprimento, 0.022, 0.042, 0.008), papel: 'detalhe', osso: 'Hips', pos: [0, 0, 0], matriz: naLinha(comprimento / 2 + 0.006) },
    { geo: caixa(0.03, 0.026, 0.046, 0.006), papel: 'coroa', osso: 'Hips', pos: [0, 0, 0], matriz: naLinha(comprimento - 0.01) },
  ]
}

// --- montaria do cavalo -----------------------------------------------------------------------------
const MONTARIA: Record<string, Record<string, () => Parte[]>> = {
  cavalo: {
    armadura: () => [
      { geo: caixa(0.184, 0.11, 0.42, 0.02), papel: 'armadura', osso: 'Cavalo', pos: [0, 0.395, 0] },
      { geo: caixa(0.188, 0.014, 0.424, 0.004), papel: 'coroa', osso: 'Cavalo', pos: [0, 0.345, 0] },
      { geo: caixa(0.188, 0.014, 0.424, 0.004), papel: 'coroa', osso: 'Cavalo', pos: [0, 0.446, 0] },
      { geo: caixa(0.17, 0.12, 0.026, 0.01), papel: 'detalhe', osso: 'Cavalo', pos: [0, 0.4, 0.236] },
      { geo: esfera(0.02), papel: 'brilho', osso: 'Cavalo', pos: [0, 0.405, 0.252] },
    ],
  },
  sela: {
    guerra: () => [
      { geo: caixa(0.21, 0.012, 0.19, 0.004), papel: 'detalhe', osso: 'Cavalo', pos: [0, 0.487, -0.015] },
      ...[1, -1].map((s): Parte => ({ geo: caixa(0.012, 0.075, 0.17, 0.004), papel: 'detalhe', osso: 'Cavalo', pos: [s * 0.104, 0.452, -0.015] })),
      { geo: caixa(0.12, 0.028, 0.13, 0.01), papel: 'armadura', osso: 'Cavalo', pos: [0, 0.505, -0.015] },
      { geo: caixa(0.13, 0.062, 0.022, 0.008), papel: 'coroa', osso: 'Cavalo', pos: [0, 0.53, -0.086] },
      { geo: caixa(0.09, 0.05, 0.022, 0.008), papel: 'coroa', osso: 'Cavalo', pos: [0, 0.524, 0.056] },
      ...[1, -1].map((s): Parte => ({ geo: caixa(0.012, 0.034, 0.038, 0.004), papel: 'coroa', osso: 'Cavalo', pos: [s * 0.118, 0.395, -0.01] })),
    ],
  },
  cabresto: {
    // a cabeça do cavalo desce do alto do pescoço até o focinho, inclinada uns 30 graus
    guerra: () => [
      { geo: cilindro(0.05, 0.05, 0.022, 10), papel: 'detalhe', osso: 'Pescoco', pos: [0, 0.618, 0.44], rot: [2.07, 0, 0] },
      { geo: cilindro(0.052, 0.052, 0.02, 10), papel: 'detalhe', osso: 'Pescoco', pos: [0, 0.682, 0.35], rot: [2.07, 0, 0] },
      { geo: caixa(0.062, 0.012, 0.13, 0.005), papel: 'armadura', osso: 'Pescoco', pos: [0, 0.69, 0.405], rot: [0.5, 0, 0] },
      { geo: esfera(0.014), papel: 'brilho', osso: 'Pescoco', pos: [0, 0.703, 0.39] },
    ],
  },
}

// --- o que some do modelo quando uma parte nova entra no lugar --------------------------------------
interface Vertice {
  material: string
  osso: string
  x: number
  y: number
  z: number
}
type Esconder = (v: Vertice) => boolean

const ESCONDER: Record<string, Esconder> = {
  // as ombreiras redondas do modelo
  ombros: (v) => v.material === 'Detalhe' && /^(Left|Right)Arm$/.test(v.osso) && Math.abs(v.x) < 0.16,
  // o cajado do modelo: tudo que segue o antebraço e não é o próprio antebraço
  cajado: (v) => {
    if (!/ForeArm|Hand/.test(v.osso)) return false
    const x = Math.abs(v.x)
    const noAntebraco = x >= 0.22 && x <= 0.36 && Math.abs(v.z) <= 0.036 && v.y >= 0.53 && v.y <= 0.6
    return !noAntebraco
  },
  sela: (v) => v.material === 'Detalhe' && v.osso === 'Cavalo',
}

// --- montagem ------------------------------------------------------------------------------------
const nomeDoOsso = (osso: THREE.Bone) => osso.name.replace(/^mixamorig:?/, '')

function matrizDaParte(parte: Parte): THREE.Matrix4 {
  if (parte.matriz) return parte.matriz
  const [rx, ry, rz] = parte.rot ?? [0, 0, 0]
  const [ex, ey, ez] = parte.esc ?? [1, 1, 1]
  return new THREE.Matrix4().compose(new THREE.Vector3(...parte.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(ex, ey, ez))
}

/** Geometria da parte no espaço do modelo, com os ossos que cada vértice segue. */
function geometriaComOssos(parte: Parte, indiceDoOsso: (nome: string) => number): THREE.BufferGeometry | null {
  const geo = parte.geo.clone()
  geo.applyMatrix4(matrizDaParte(parte))
  geo.deleteAttribute('uv')
  const posicoes = geo.attributes.position
  const indices = new Uint16Array(posicoes.count * 4)
  const pesos = new Float32Array(posicoes.count * 4)
  for (let i = 0; i < posicoes.count; i++) {
    if (typeof parte.osso === 'string') {
      const osso = indiceDoOsso(parte.osso)
      if (osso < 0) return null
      indices[i * 4] = osso
      pesos[i * 4] = 1
    } else {
      const { baixo, alto, y0, y1 } = parte.osso
      const a = indiceDoOsso(baixo)
      const b = indiceDoOsso(alto)
      if (a < 0 || b < 0) return null
      const t = THREE.MathUtils.clamp((posicoes.getY(i) - y0) / (y1 - y0), 0, 1)
      indices[i * 4] = a
      indices[i * 4 + 1] = b
      pesos[i * 4] = 1 - t
      pesos[i * 4 + 1] = t
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4))
  return geo
}

/** Os triângulos da malha cujos três vértices seguem alguma das regras (`dentro`) e os outros (`fora`). */
function separarTriangulos(malha: THREE.SkinnedMesh, regras: Esconder[]): { dentro: number[]; fora: number[] } {
  const geo = malha.geometry
  const posicoes = geo.attributes.position
  const ossos = geo.attributes.skinIndex
  const pesos = geo.attributes.skinWeight
  const material = malha.userData.material as string
  const nomes = malha.skeleton.bones.map(nomeDoOsso)
  const segue = new Uint8Array(posicoes.count)
  for (let i = 0; i < posicoes.count; i++) {
    let melhor = 0
    for (let k = 1; k < 4; k++) if (pesos.getComponent(i, k) > pesos.getComponent(i, melhor)) melhor = k
    const vertice = { material, osso: nomes[ossos.getComponent(i, melhor)], x: posicoes.getX(i), y: posicoes.getY(i), z: posicoes.getZ(i) }
    if (regras.some((regra) => regra(vertice))) segue[i] = 1
  }
  const original = geo.index ? Array.from(geo.index.array) : Array.from({ length: posicoes.count }, (_, i) => i)
  const dentro: number[] = []
  const fora: number[] = []
  for (let t = 0; t < original.length; t += 3) {
    const [a, b, c] = [original[t], original[t + 1], original[t + 2]]
    ;(segue[a] && segue[b] && segue[c] ? dentro : fora).push(a, b, c)
  }
  return { dentro, fora }
}

/** Tira do modelo os triângulos que a regra manda esconder. A geometria é clonada: as outras peças do mesmo tipo
 * dividem a original. */
function esconderNaMalha(malha: THREE.SkinnedMesh, regras: Esconder[]) {
  const { dentro, fora } = separarTriangulos(malha, regras)
  if (dentro.length === 0) return
  const nova = malha.geometry.clone()
  nova.setIndex(fora)
  malha.geometry = nova
}

/** O que do modelo segue a regra, como malha comum e parada: é o que vai pro expositor quando o equipamento é o que já
 * vem no modelo, como a katana e os cajados. */
function pedacoDoModelo(grupo: THREE.Object3D, regra: Esconder): THREE.Group {
  const pedaco = new THREE.Group()
  grupo.traverse((filho) => {
    if (!(filho instanceof THREE.SkinnedMesh) || typeof filho.userData.material !== 'string') return
    const { dentro } = separarTriangulos(filho, [regra])
    if (dentro.length === 0) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', filho.geometry.attributes.position)
    geo.setAttribute('normal', filho.geometry.attributes.normal)
    geo.setIndex(dentro)
    // só os pontos do pedaço: com a malha inteira, a medida do expositor seria a do corpo todo
    pedaco.add(new THREE.Mesh(geo.toNonIndexed(), filho.material))
  })
  return pedaco
}

/** Pontos da bainha e do cabo da katana no espaço do modelo, pra espada nova seguir a mesma linha. */
function linhaDaBainha(malhas: THREE.SkinnedMesh[]): { cabo: THREE.Vector3; ponta: THREE.Vector3 } | null {
  const pontos = (material: string) => {
    const malha = malhas.find((m) => m.userData.material === material)
    if (!malha) return []
    const p = malha.geometry.attributes.position
    return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)))
  }
  const doCabo = pontos('CaboBainha')
  const daBainha = pontos('BainhaKatana')
  if (!doCabo.length || !daBainha.length) return null
  const cabo = doCabo.reduce((soma, p) => soma.add(p), new THREE.Vector3()).divideScalar(doCabo.length)
  const ponta = daBainha.reduce((longe, p) => (p.distanceTo(cabo) > longe.distanceTo(cabo) ? p : longe))
  return { cabo, ponta }
}

/** A peça sozinha pra vitrine da Personalização: `atualizar` roda a cada quadro, com o tempo desde o anterior. */
export interface VitrineDaPeca {
  grupo: THREE.Group
  atualizar: (delta: number) => void
}

export interface EspadaDoPeao {
  naMao: THREE.Object3D[]
  naBainha: THREE.Object3D[]
  fora: boolean
}

/**
 * Veste a peça montada do modelo (o grupo de buildPecaRPG) com o que a pessoa escolheu pra ela. As malhas do
 * modelo trazem o nome do material original em `userData.material`. Devolve as escolhas que valeram.
 */
export function vestirPeca(grupo: THREE.Object3D, tipo: string, escolhas: Record<string, string>, materiais: MateriaisDaPeca) {
  const malhas: THREE.SkinnedMesh[] = []
  grupo.traverse((filho) => {
    if (filho instanceof THREE.SkinnedMesh && typeof filho.userData.material === 'string') malhas.push(filho)
  })
  const corpo = malhas.find((m) => m.userData.material === 'Corpo')
  if (!corpo) return

  const partes: Parte[] = []
  const regras: Esconder[] = []
  const escolha = (parte: string) => escolhas[parte]

  const doCorpo: [string, Record<string, () => Parte[]>][] = [
    ['cabeca', CABECA],
    ['ombros', OMBROS],
    ['maos', MAOS],
    ['peito', PEITO],
    ['calca', CALCA],
    ['botas', BOTAS],
  ]
  for (const [parte, catalogo] of doCorpo) {
    const montar = catalogo[escolha(parte) ?? '']
    if (!montar) continue
    partes.push(...montar())
    if (parte === 'ombros') regras.push(ESCONDER.ombros)
  }

  // sem escolha, a peça fica sem arma: as armas saem pelas conquistas. A katana e o cajado de sempre vêm no modelo
  const arma = escolha('arma') ?? 'nenhuma'
  const maoDoCajado = MAO_DO_CAJADO[tipo]
  if (maoDoCajado && arma !== 'cajado') {
    regras.push(ESCONDER.cajado)
    if (CAJADOS[arma]) partes.push(...CAJADOS[arma](...maoDoCajado))
  }
  if (tipo === 'r') grupo.userData.arma = arma

  const semKatana = tipo === 'p' && arma !== 'katana'
  if (tipo === 'p' && arma === 'espada') {
    const linha = linhaDaBainha(malhas)
    if (linha) partes.push(...espadaNaMao(), ...espadaNaBainha(linha.cabo, linha.ponta))
  }

  if (tipo === 'n') {
    for (const [parte, catalogo] of Object.entries(MONTARIA)) {
      const montar = catalogo[escolha(parte) ?? '']
      if (!montar) continue
      partes.push(...montar())
      if (parte === 'sela') regras.push(ESCONDER.sela)
    }
  }

  if (regras.length) for (const malha of malhas) esconderNaMalha(malha, regras)

  // as partes novas, juntas por material e por camada
  const indiceDoOsso = (nome: string) => corpo.skeleton.bones.findIndex((osso) => nomeDoOsso(osso) === nome)
  const porGrupo = new Map<string, { papel: Papel; camada: Camada; geos: THREE.BufferGeometry[] }>()
  for (const parte of partes) {
    const geo = geometriaComOssos(parte, indiceDoOsso)
    if (!geo) continue
    const camada = parte.camada ?? 'fixa'
    const chave = `${camada}:${parte.papel}`
    const grupoDaChave = porGrupo.get(chave) ?? { papel: parte.papel, camada, geos: [] }
    grupoDaChave.geos.push(geo)
    porGrupo.set(chave, grupoDaChave)
  }
  const naMao: THREE.Object3D[] = []
  const naBainha: THREE.Object3D[] = []
  for (const { papel, camada, geos } of porGrupo.values()) {
    const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))
    if (!geo) continue
    const malha = new THREE.SkinnedMesh(geo, materiais[papel])
    malha.name = `vestimenta:${camada}:${papel}`
    malha.castShadow = true
    malha.receiveShadow = true
    malha.frustumCulled = false
    malha.position.copy(corpo.position)
    malha.quaternion.copy(corpo.quaternion)
    malha.scale.copy(corpo.scale)
    malha.bind(corpo.skeleton, corpo.bindMatrix)
    corpo.parent?.add(malha)
    if (camada === 'naMao') naMao.push(malha)
    if (camada === 'naBainha') naBainha.push(malha)
  }

  // a katana some de vez: a espada nova, se houver, toma o lugar dela no sacar e guardar
  const espada = grupo.userData.espadaRPG as EspadaDoPeao | undefined
  if (semKatana && espada) {
    for (const malha of malhas) {
      if (['EspadaLamina', 'EspadaCabo', 'CaboBainha', 'BainhaKatana'].includes(malha.userData.material as string)) malha.visible = false
    }
    espada.naMao = naMao
    espada.naBainha = naBainha
    for (const parte of naMao) parte.visible = espada.fora
    for (const parte of naBainha) parte.visible = !espada.fora
  }
}

// --- expositor da Personalização --------------------------------------------------------------------
// No quadrado de cada parte, o equipamento aparece sozinho, fora da peça, como numa vitrine de loja.

const DO_CORPO: Record<string, Record<string, () => Parte[]>> = { cabeca: CABECA, ombros: OMBROS, maos: MAOS, peito: PEITO, calca: CALCA, botas: BOTAS }
/** As que vêm em par mostram só a do lado esquerdo. */
const EM_PAR = new Set(['ombros', 'maos', 'calca', 'botas'])

/** Armas e cajados ficam ao longo do braço aberto; no expositor ficam em pé, com a ponta ou o enfeite em cima. */
const EM_PE = -Math.PI / 2

/** O equipamento montado em código, sozinho. Null pra opção que não monta nada aqui (as que vêm do modelo). */
export function equipamentoSozinho(tipo: string, parte: string, opcao: string, materiais: MateriaisDaPeca): THREE.Object3D | null {
  let partes: Parte[] = []
  if (parte === 'arma') {
    if (tipo === 'p' && opcao === 'espada') partes = espadaNaMao()
    else if (MAO_DO_CAJADO[tipo] && CAJADOS[opcao]) partes = CAJADOS[opcao](1, 'Left')
  } else if (tipo === 'n' && MONTARIA[parte]) {
    partes = MONTARIA[parte][opcao]?.() ?? []
  } else {
    partes = DO_CORPO[parte]?.[opcao]?.() ?? []
  }
  if (EM_PAR.has(parte)) partes = partes.filter((p) => p.pos[0] >= 0)
  if (partes.length === 0) return null
  const grupo = new THREE.Group()
  for (const p of partes) {
    const malha = new THREE.Mesh(p.geo, materiais[p.papel])
    malha.applyMatrix4(matrizDaParte(p))
    grupo.add(malha)
  }
  if (parte === 'arma') grupo.rotation.z = EM_PE
  return grupo
}

/** A katana que vem no modelo do peão, sozinha e em pé. */
export function katanaDoModelo(peao: THREE.Object3D): THREE.Object3D | null {
  const katana = pedacoDoModelo(peao, (v) => v.material === 'EspadaLamina' || v.material === 'EspadaCabo')
  katana.rotation.z = EM_PE
  return katana.children.length ? katana : null
}

/** O cajado que vem no modelo do bispo, da rainha ou do rei, sozinho e com o enfeite em cima. */
export function cajadoDoModelo(peca: THREE.Object3D, tipo: string): THREE.Object3D | null {
  const lado = MAO_DO_CAJADO[tipo]
  if (!lado) return null
  const cajado = pedacoDoModelo(peca, ESCONDER.cajado)
  // o enfeite fica do lado do corpo: na mão direita (x negativo) é +x que precisa ir pra cima
  cajado.rotation.z = lado[0] === 1 ? EM_PE : -EM_PE
  return cajado.children.length ? cajado : null
}
