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

// --- o Puxão Universal, do desenho do usuário (a segunda versão, de 21/11): dois traços curvos que se cruzam em X no
// meio (o de cima à esquerda desce até o gancho embaixo à direita; o de cima à direita desce até a ponta embaixo à
// esquerda) e, em volta, quatro pares de arcos (em cima, embaixo, à esquerda e à direita), como ondas sendo puxadas
// pro centro. Os pontos são do desenho (1254 px de lado), tirados dos traços pretos dele, cada traço de pincel com as
// pontas redondas.

/** Onde fica o meio de cada desenho (em px) e quanto um px vale no símbolo. */
interface Quadro {
  centro: THREE.Vector2
  escala: number
}
const QUADRO_DO_PUXAO: Quadro = { centro: new THREE.Vector2(627, 587), escala: 1 / 900 }
const doDesenho = (quadro: Quadro) => ([x, y]: [number, number]) => new THREE.Vector2((x - quadro.centro.x) * quadro.escala, -(y - quadro.centro.y) * quadro.escala)

/** Um traço de pincel: a linha suave pelos pontos do desenho, com a grossura (em px do desenho, uma só ou uma por
 * ponto) e as duas pontas redondas. */
function traco(pontos: [number, number][], grossura: number | number[], quadro: Quadro = QUADRO_DO_PUXAO): THREE.Shape {
  const curva = new THREE.SplineCurve(pontos.map(doDesenho(quadro)))
  const larguraEm = (u: number) => {
    if (typeof grossura === 'number') return grossura * quadro.escala
    const onde = u * (grossura.length - 1)
    const i = Math.min(grossura.length - 2, Math.floor(onde))
    const resto = onde - i
    return (grossura[i] * (1 - resto) + grossura[i + 1] * resto) * quadro.escala
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

function puxao(): THREE.Group {
  const emblema = new THREE.Group()
  const malha = (forma: THREE.Shape, z = 0) => {
    const parte = new THREE.Mesh(extrudar(forma, 24), acoEscuro)
    parte.castShadow = true
    parte.position.z = z
    emblema.add(parte)
  }
  // o X: o segundo traço fica um fio à frente, pros dois não brigarem onde se cruzam
  malha(traco([[350, 392], [400, 383], [450, 382], [500, 394], [540, 416], [575, 452], [605, 500], [632, 548], [662, 600], [698, 655], [745, 704], [800, 730], [850, 727], [893, 712]], [64,74,80,86,92,98,102,104,102,98,92,86,80,70]))
  malha(traco([[902, 362], [850, 370], [800, 388], [750, 411], [705, 445], [668, 495], [632, 555], [596, 620], [558, 688], [510, 742], [455, 778], [400, 802], [355, 814]], [40,62,76,86,94,100,104,104,100,94,86,78,68]), 0.004)
  // os pares de arcos em volta: o de fora mais comprido, o de dentro mais curto
  const arcos: [[number, number][], number][] = [
    [[[350, 170], [420, 142], [500, 122], [580, 109], [660, 101], [740, 96], [792, 92]], 78],
    [[[470, 245], [530, 233], [590, 227], [650, 223], [692, 224]], 70],
    [[[773, 897], [724, 910], [664, 920], [604, 924], [544, 923], [505, 919]], 70],
    [[[925, 996], [860, 1024], [790, 1044], [710, 1058], [630, 1066], [550, 1067], [470, 1060], [405, 1048]], 84],
    [[[160, 312], [123, 375], [95, 450], [83, 530], [85, 610], [103, 695], [136, 778], [175, 848]], 84],
    [[[240, 425], [220, 470], [207, 520], [201, 570], [204, 620], [214, 670]], 80],
    [[[1085, 312], [1125, 385], [1155, 465], [1170, 548], [1166, 630], [1145, 713], [1110, 790], [1078, 846]], 84],
    [[[996, 422], [1018, 464], [1033, 510], [1041, 560], [1039, 610], [1030, 655], [1022, 680]], 80],
  ]
  for (const [arco, grossura] of arcos) malha(traco(arco, grossura))
  return emblema
}

// --- a Dempsey Roll, do desenho do usuário: a luva de boxe de lado, com o X no dorso, o polegar à direita e o punho em
// faixas, e embaixo o traço em espiral do movimento (o oito da roda). Os pontos são do desenho (1920 px de lado).

const QUADRO_DA_LUVA: Quadro = { centro: new THREE.Vector2(960, 985), escala: 1 / 900 }
const GROSSURA_DA_LUVA = 72

function dempsey(): THREE.Group {
  const emblema = new THREE.Group()
  const tracos: [number, number][][] = [
    // o corpo da luva: do punho, subindo pela esquerda, por cima e descendo pela direita até a dobra do polegar
    [[715, 1025], [680, 960], [645, 862], [625, 780], [645, 715], [705, 660], [795, 598], [885, 550], [978, 528], [1062, 543], [1130, 590], [1175, 665], [1192, 745], [1185, 822], [1150, 900], [1062, 964]],
    // o polegar
    [[1165, 735], [1218, 745], [1245, 800], [1285, 862], [1290, 925], [1258, 990], [1208, 1030], [1165, 1036]],
    // o X no dorso
    [[835, 775], [882, 806], [932, 828], [990, 808]],
    [[958, 742], [905, 798], [868, 880]],
    // o punho: as faixas de cima e de baixo e os lados
    [[775, 1032], [880, 1030], [980, 1032], [1062, 1028], [1100, 1018]],
    [[725, 1085], [728, 1150]],
    [[785, 1167], [900, 1173], [1010, 1176], [1120, 1148]],
    [[1130, 1062], [1112, 1125]],
    // o oito do movimento, embaixo
    [[855, 1255], [770, 1268], [690, 1300], [640, 1345], [632, 1390], [690, 1428], [840, 1445], [990, 1430], [1120, 1400], [1185, 1365], [1140, 1340], [1000, 1330], [870, 1335], [748, 1345]],
  ]
  for (const pontos of tracos) {
    const parte = new THREE.Mesh(extrudar(traco(pontos, GROSSURA_DA_LUVA, QUADRO_DA_LUVA), 24), acoEscuro)
    parte.castShadow = true
    emblema.add(parte)
  }
  return emblema
}

const EMBLEMAS: Record<string, () => THREE.Group> = { retalhamento, puxao, dempsey }

/** O bloco de habilidade na Loja: `numero` placas lado a lado, a última dourada (a que o bloco libera). */
export function emblemaDoBloco(numero: number): THREE.Group {
  const emblema = new THREE.Group()
  const ouro = new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 0.9, roughness: 0.3 })
  const largura = 0.26
  const vao = 0.06
  for (let i = 0; i < numero; i++) {
    const forma = new THREE.Shape()
    const r = 0.04
    const [l, a] = [largura / 2, 0.36]
    forma.moveTo(-l + r, -a)
    forma.lineTo(l - r, -a)
    forma.quadraticCurveTo(l, -a, l, -a + r)
    forma.lineTo(l, a - r)
    forma.quadraticCurveTo(l, a, l - r, a)
    forma.lineTo(-l + r, a)
    forma.quadraticCurveTo(-l, a, -l, a - r)
    forma.lineTo(-l, -a + r)
    forma.quadraticCurveTo(-l, -a, -l + r, -a)
    const placa = new THREE.Mesh(extrudar(forma, 12), i === numero - 1 ? ouro : acoEscuro)
    placa.castShadow = true
    placa.position.x = (i - (numero - 1) / 2) * (largura + vao)
    emblema.add(placa)
  }
  return emblema
}

/** O símbolo da habilidade, ou null pra opção sem símbolo. */
export function emblemaDaHabilidade(opcao: string): THREE.Group | null {
  return EMBLEMAS[opcao]?.() ?? null
}
