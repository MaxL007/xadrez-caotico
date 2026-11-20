import * as THREE from 'three'

// O símbolo de cada habilidade especial, pro expositor da Personalização e da Loja (no lugar da arma, que não é o que
// se compra). Os dois vêm de desenhos do usuário. O do Puxão Universal, mais embaixo, é um X de traços curvos cercado de
// arcos. O do retalhamento: um átomo de três órbitas cruzadas com dois cortes em
// crescente por cima, como garras. Cada órbita é uma faixa achatada, inclinada: de frente ela aparece grossa nas pontas e
// fina no meio, como o traço de pincel do desenho.

const PROFUNDIDADE = 0.024
const BISEL = { bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }

/** Aço escuro e polido: o preto do desenho, com o brilho do metal pra aparecer no fundo escuro do expositor. */
const acoEscuro = new THREE.MeshStandardMaterial({ color: 0x4a4c55, metalness: 1, roughness: 0.26 })

function extrudar(forma: THREE.Shape, segmentos = 64): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(forma, { depth: PROFUNDIDADE, curveSegments: segmentos, ...BISEL })
  geo.translate(0, 0, -PROFUNDIDADE / 2)
  return geo
}

/** Um anel achatado (ou só um pedaço dele, de `de` a `ate`, em radianos). */
function faixa(raio: number, largura: number, de = 0, ate = Math.PI * 2): THREE.Shape {
  const forma = new THREE.Shape()
  const fora = raio + largura / 2
  const dentro = raio - largura / 2
  if (ate - de >= Math.PI * 2 - 1e-6) {
    forma.absarc(0, 0, fora, 0, Math.PI * 2, false)
    const furo = new THREE.Path()
    furo.absarc(0, 0, dentro, 0, Math.PI * 2, true)
    forma.holes.push(furo)
    return forma
  }
  forma.absarc(0, 0, fora, de, ate, false)
  forma.absarc(0, 0, dentro, ate, de, true)
  forma.closePath()
  return forma
}

/** Um corte em crescente entre duas pontas: a borda de fora se afasta `curvaFora` da reta entre elas, a de dentro
 * `curvaDentro`; o meio fica grosso e as pontas, finas. `lado` diz pra que lado ele se curva (1 ou -1). */
function crescente(ponta1: THREE.Vector2, ponta2: THREE.Vector2, curvaFora: number, curvaDentro: number, lado: number): THREE.Shape {
  const reta = ponta2.clone().sub(ponta1)
  const normal = new THREE.Vector2(-reta.y, reta.x).normalize().multiplyScalar(lado)
  const pontos: THREE.Vector2[] = []
  const passos = 28
  for (let i = 0; i <= passos; i++) {
    const u = i / passos
    pontos.push(ponta1.clone().lerp(ponta2, u).addScaledVector(normal, curvaFora * 4 * u * (1 - u)))
  }
  for (let i = passos - 1; i >= 1; i--) {
    const u = i / passos
    pontos.push(ponta1.clone().lerp(ponta2, u).addScaledVector(normal, curvaDentro * 4 * u * (1 - u)))
  }
  return new THREE.Shape(pontos)
}

function retalhamento(): THREE.Group {
  const emblema = new THREE.Group()
  const malha = (geo: THREE.BufferGeometry) => {
    const parte = new THREE.Mesh(geo, acoEscuro)
    parte.castShadow = true
    emblema.add(parte)
    return parte
  }

  // as duas órbitas em X: círculos inclinados 74° (de frente, elipses finas), um pra cada lado, cruzando no meio
  for (const lado of [1, -1]) {
    const orbita = malha(extrudar(faixa(0.5, 0.045)))
    orbita.rotation.set(lado * THREE.MathUtils.degToRad(74), 0, -lado * THREE.MathUtils.degToRad(23.5), 'ZXY')
  }
  // a terceira órbita, em pé: só os dois lados dela, os traços quase retos de dentro do desenho
  const meio = THREE.MathUtils.degToRad(27)
  for (const centro of [0, Math.PI]) {
    const lado = malha(extrudar(faixa(0.42, 0.036, centro - meio, centro + meio), 24))
    lado.rotation.y = THREE.MathUtils.degToRad(60)
  }
  // os cortes em crescente por cima, um de cada lado (curvados pra fora), cada um com um traço fino por dentro
  for (const lado of [1, -1]) {
    const v = (x: number, y: number) => new THREE.Vector2(x * lado, y)
    malha(extrudar(crescente(v(-0.19, 0.5), v(-0.65, -0.05), 0.125, 0.075, -lado), 12))
    malha(extrudar(crescente(v(-0.255, 0.365), v(-0.585, 0.095), 0.05, 0.03, -lado), 12))
  }
  return emblema
}

// --- o Puxão Universal, do desenho do usuário: dois traços curvos que se cruzam em X no meio (grossos no centro,
// finos nas pontas) e, em volta, quatro pares de arcos (em cima, embaixo, à esquerda e à direita), como ondas sendo
// puxadas pro centro. Os pontos são do desenho (1920 px de lado), cada traço de pincel com as pontas redondas.

const ESCALA_DO_DESENHO = 1 / 1060
const CENTRO_DO_DESENHO = new THREE.Vector2(822, 857)
const doDesenho = ([x, y]: [number, number]) => new THREE.Vector2((x - CENTRO_DO_DESENHO.x) * ESCALA_DO_DESENHO, -(y - CENTRO_DO_DESENHO.y) * ESCALA_DO_DESENHO)

/** Um traço de pincel: a linha suave pelos pontos do desenho, com a grossura (em px do desenho, uma só ou uma por
 * ponto) e as duas pontas redondas. */
function traco(pontos: [number, number][], grossura: number | number[]): THREE.Shape {
  const curva = new THREE.SplineCurve(pontos.map(doDesenho))
  const larguraEm = (u: number) => {
    if (typeof grossura === 'number') return grossura * ESCALA_DO_DESENHO
    const onde = u * (grossura.length - 1)
    const i = Math.min(grossura.length - 2, Math.floor(onde))
    const resto = onde - i
    return (grossura[i] * (1 - resto) + grossura[i + 1] * resto) * ESCALA_DO_DESENHO
  }
  const passos = 48
  const esquerda: THREE.Vector2[] = []
  const direita: THREE.Vector2[] = []
  for (let k = 0; k <= passos; k++) {
    const u = k / passos
    const ponto = curva.getPointAt(u)
    const rumo = curva.getTangentAt(u)
    const lado = new THREE.Vector2(-rumo.y, rumo.x).multiplyScalar(larguraEm(u) / 2)
    esquerda.push(ponto.clone().add(lado))
    direita.push(ponto.clone().sub(lado))
  }
  const forma = new THREE.Shape(esquerda)
  // a ponta do fim: meia-volta da borda esquerda pra direita, passando pela frente
  const fim = curva.getPointAt(1)
  const rumoNoFim = curva.getTangentAt(1)
  const anguloNoFim = Math.atan2(rumoNoFim.y, rumoNoFim.x)
  forma.absarc(fim.x, fim.y, larguraEm(1) / 2, anguloNoFim + Math.PI / 2, anguloNoFim - Math.PI / 2, true)
  for (let k = direita.length - 1; k >= 0; k--) forma.lineTo(direita[k].x, direita[k].y)
  // e a do começo, pela parte de trás
  const comeco = curva.getPointAt(0)
  const rumoNoComeco = curva.getTangentAt(0)
  const anguloNoComeco = Math.atan2(rumoNoComeco.y, rumoNoComeco.x)
  forma.absarc(comeco.x, comeco.y, larguraEm(0) / 2, anguloNoComeco - Math.PI / 2, anguloNoComeco + Math.PI / 2, true)
  forma.closePath()
  return forma
}

/** A grossura dos arcos de fora, em px do desenho. */
const GROSSURA_DOS_ARCOS = 72
/** O X do meio é o traço mais pesado do desenho. */
const GROSSURA_DO_X = 1.25

function puxao(): THREE.Group {
  const emblema = new THREE.Group()
  const malha = (forma: THREE.Shape, z = 0) => {
    const parte = new THREE.Mesh(extrudar(forma, 24), acoEscuro)
    parte.castShadow = true
    parte.position.z = z
    emblema.add(parte)
    return parte
  }
  // o X do meio: do braço de cima à esquerda até o gancho embaixo à direita, e do braço de cima à direita até a ponta
  // embaixo à esquerda. O segundo fica um fio à frente, pros dois não brigarem onde se cruzam
  malha(
    traco(
      [[497, 625], [560, 605], [650, 598], [730, 620], [800, 680], [845, 760], [860, 830], [880, 900], [930, 975], [1000, 1030], [1080, 1045], [1150, 1025], [1210, 990]],
      [70, 85, 110, 115, 110, 100, 95, 90, 85, 80, 75, 72, 70].map((g) => g * GROSSURA_DO_X),
    ),
  )
  malha(
    traco(
      [[1148, 585], [1090, 600], [1000, 640], [930, 700], [870, 780], [840, 860], [825, 940], [790, 1010], [730, 1070], [650, 1115], [575, 1150]],
      [68, 80, 95, 105, 100, 95, 100, 105, 100, 85, 70].map((g) => g * GROSSURA_DO_X),
    ),
    0.004,
  )
  // os pares de arcos em volta: o de fora mais comprido, o de dentro mais curto
  const arcos: [number, number][][] = [
    [[535, 335], [700, 295], [900, 265], [1085, 258]],
    [[697, 415], [800, 415], [895, 408]],
    [[778, 1283], [900, 1290], [1040, 1260]],
    [[652, 1455], [850, 1468], [1100, 1440], [1305, 1387]],
    [[147, 487], [130, 650], [128, 800], [145, 1000], [200, 1210]],
    [[270, 695], [252, 820], [257, 940]],
    [[1262, 640], [1320, 720], [1343, 800], [1343, 895]],
    [[1362, 540], [1450, 640], [1505, 760], [1512, 900], [1490, 1065]],
  ]
  for (const arco of arcos) malha(traco(arco, GROSSURA_DOS_ARCOS))
  return emblema
}

const EMBLEMAS: Record<string, () => THREE.Group> = { retalhamento, puxao }

/** O símbolo da habilidade, ou null pra opção sem símbolo. */
export function emblemaDaHabilidade(opcao: string): THREE.Group | null {
  return EMBLEMAS[opcao]?.() ?? null
}
