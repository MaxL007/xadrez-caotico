import * as THREE from 'three'
import desenhoDaDempsey from './desenhos/dempsey.json'
import desenhoDoEspiral from './desenhos/espiral.json'

// O símbolo de cada habilidade especial, pro expositor da Personalização e da Loja (no lugar da arma, que não é o que
// se compra). Todos vêm de desenhos do usuário: o do Puxão Universal (dois elos cercados de arcos), o do Espiral Absoluto
// (o redemoinho) e o da Dempsey Roll
// (duas luvas com o ∞), mais embaixo, saem dos traços da imagem dele. O do retalhamento: um átomo de três órbitas cruzadas com dois cortes em
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

// --- o Puxão Universal, do desenho do usuário (a terceira versão, de 21/11): no meio, dois elos abertos, um de frente
// pro outro (cada um um "C" com as pontas em seta, apontando pro centro), e em volta quatro pares de arcos (em cima,
// embaixo, à esquerda e à direita), como ondas sendo puxadas pro centro. Os pontos são do desenho (1254 px de lado),
// tirados dos traços pretos dele: os arcos são traços de pincel de grossura igual (`traco`, pontas redondas) e os elos,
// o contorno de cada um, seguido pixel a pixel e simplificado.

/** Onde fica o meio de cada desenho (em px) e quanto um px vale no símbolo. */
interface Quadro {
  centro: THREE.Vector2
  escala: number
}
const QUADRO_DO_PUXAO: Quadro = { centro: new THREE.Vector2(626.5, 595.5), escala: 1 / 875 }
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

/** Uma forma pelo contorno, em pontos do desenho. */
function contorno(pontos: [number, number][], quadro: Quadro = QUADRO_DO_PUXAO): THREE.Shape {
  return new THREE.Shape(pontos.map(doDesenho(quadro)))
}

function puxao(): THREE.Group {
  const emblema = new THREE.Group()
  const malha = (forma: THREE.Shape) => {
    const parte = new THREE.Mesh(extrudar(forma, 24), acoEscuro)
    parte.castShadow = true
    emblema.add(parte)
  }
  // os dois elos do meio, pelo contorno
  const elos: [number, number][][] = [
    [[426, 461], [520, 461], [533, 465], [543, 471], [597, 523], [607, 535], [607, 549], [601, 556], [597, 558], [527, 559], [523, 558], [522, 514], [423, 515], [404, 519], [381, 530], [358, 551], [351, 561], [343, 578], [340, 589], [340, 619], [345, 635], [352, 648], [370, 668], [381, 676], [395, 683], [417, 689], [506, 689], [523, 688], [524, 638], [593, 637], [601, 640], [607, 647], [608, 657], [605, 664], [529, 738], [512, 743], [420, 743], [404, 741], [370, 731], [354, 723], [334, 709], [323, 699], [309, 682], [301, 669], [292, 649], [285, 616], [286, 586], [294, 556], [302, 539], [312, 523], [335, 498], [363, 479], [393, 467], [417, 462]],
    [[733, 461], [836, 462], [872, 471], [906, 489], [920, 500], [938, 519], [950, 537], [957, 551], [967, 586], [968, 614], [966, 629], [959, 654], [949, 674], [936, 692], [920, 708], [902, 721], [885, 730], [859, 739], [833, 743], [741, 743], [734, 742], [722, 737], [649, 666], [645, 658], [645, 650], [647, 645], [656, 638], [702, 638], [730, 638], [731, 689], [836, 689], [858, 683], [872, 676], [883, 668], [895, 656], [902, 646], [909, 632], [913, 618], [913, 590], [907, 571], [897, 554], [881, 537], [873, 531], [856, 522], [841, 517], [830, 515], [801, 514], [731, 514], [729, 558], [694, 559], [657, 558], [652, 556], [645, 546], [645, 538], [649, 530], [709, 472], [722, 464]],
  ]
  for (const elo of elos) malha(contorno(elo))
  // os pares de arcos em volta: em cima, à esquerda, à direita e embaixo, o de fora mais comprido
  const arcos: [[number, number][], number][] = [
    [[[375, 194], [438, 162], [506, 141], [575, 130], [646, 127], [716, 135], [784, 151], [849, 178], [874, 192]], 51],
    [[[457, 261], [499, 244], [542, 232], [586, 224], [631, 221], [675, 225], [719, 233], [762, 247], [793, 261]], 52],
    [[[166, 797], [125, 746], [95, 688], [81, 624], [85, 558], [105, 496], [138, 440], [168, 403]], 56],
    [[[1087, 406], [1117, 444], [1142, 486], [1161, 531], [1171, 579], [1171, 628], [1162, 676], [1142, 722], [1116, 763], [1094, 787]], 56],
    [[[244, 736], [220, 704], [201, 669], [190, 631], [189, 592], [197, 553], [212, 516], [234, 483], [247, 462]], 55],
    [[[1008, 465], [1031, 497], [1049, 532], [1060, 569], [1064, 609], [1059, 648], [1045, 685], [1022, 718], [1008, 739]], 56],
    [[[801, 922], [761, 941], [718, 954], [675, 962], [630, 965], [586, 963], [542, 956], [500, 944], [459, 926]], 52],
    [[[872, 996], [810, 1028], [743, 1049], [674, 1061], [604, 1063], [534, 1054], [466, 1036], [402, 1008], [377, 993]], 54],
  ]
  for (const [arco, grossura] of arcos) malha(traco(arco, grossura))
  return emblema
}

// --- a Dempsey Roll, do desenho do usuário (a segunda versão, de 21/11): duas luvas de boxe de frente uma pra outra,
// cada uma com o ∞ do oito da roda no dorso. É desenho de contorno (linhas pretas com o miolo branco), então cada parte
// preta sai da imagem como ela é: o contorno, seguido pixel a pixel e simplificado, e os buracos brancos de dentro (o
// miolo da luva, os laços do ∞, os vãos do punho). Os pontos (2000 px de lado) ficam em desenhos/dempsey.json.

const QUADRO_DA_LUVA: Quadro = { centro: new THREE.Vector2(desenhoDaDempsey.centro[0], desenhoDaDempsey.centro[1]), escala: 1 / 1060 }

/** As linhas do desenho são finas: o bisel de sempre engrossaria cada uma e fecharia os vãos estreitos do punho. */
function extrudarFino(forma: THREE.Shape): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(forma, { depth: PROFUNDIDADE, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0012, bevelSegments: 1 })
  geo.translate(0, 0, -PROFUNDIDADE / 2)
  return geo
}

function dempsey(): THREE.Group {
  const emblema = new THREE.Group()
  const ponto = doDesenho(QUADRO_DA_LUVA)
  for (const { contorno, buracos } of desenhoDaDempsey.formas as { contorno: [number, number][]; buracos: [number, number][][] }[]) {
    const forma = new THREE.Shape(contorno.map(ponto))
    for (const buraco of buracos) forma.holes.push(new THREE.Path(buraco.map(ponto)))
    const parte = new THREE.Mesh(extrudarFino(forma), acoEscuro)
    parte.castShadow = true
    emblema.add(parte)
  }
  return emblema
}

// --- o Empurrão Universal, da imagem do usuário (21/11), no padrão da Loja: a imagem é de mangá (retícula, gradiente,
// brilho), então as formas foram redesenhadas em traço cheio de aço, com a mesma composição e as proporções medidas
// nela: a bolha de vento, uma meia cúpula no chão, com o núcleo de luz e os raios saindo dele; cinco setas empurrando
// pra fora (165°, 128°, 90°, 52° e 15°, as pontas a quase duas vezes o raio da cúpula); os riscos de velocidade entre
// elas, as faíscas e a linha do chão. O raio da cúpula é 0,36.

const RAIO_DA_CUPULA = 0.36
const polar = (angulo: number, raio: number) => new THREE.Vector2(Math.cos(angulo) * raio, Math.sin(angulo) * raio)
const graus = (g: number) => (g * Math.PI) / 180

/** Uma seta grossa saindo do centro no `angulo`: a haste de `base` até a cabeça e a cabeça em triângulo até `ponta`. */
function setaParaFora(angulo: number, base: number, ponta: number): THREE.Shape {
  const meiaHaste = 0.042
  const meiaCabeca = 0.13
  const comprimentoDaCabeca = 0.16
  const frente = polar(angulo, 1)
  const lado = new THREE.Vector2(-frente.y, frente.x)
  const em = (r: number, l: number) => frente.clone().multiplyScalar(r).addScaledVector(lado, l)
  const pescoco = ponta - comprimentoDaCabeca
  return new THREE.Shape([
    em(base, -meiaHaste),
    em(pescoco, -meiaHaste),
    em(pescoco - 0.012, -meiaCabeca),
    em(ponta, 0),
    em(pescoco - 0.012, meiaCabeca),
    em(pescoco, meiaHaste),
    em(base, meiaHaste),
  ])
}

/** Um risco de velocidade: fino nas pontas e mais largo perto do começo, de `de` a `ate` no `angulo`. */
function risco(angulo: number, de: number, ate: number, largura: number): THREE.Shape {
  const frente = polar(angulo, 1)
  const lado = new THREE.Vector2(-frente.y, frente.x)
  const em = (r: number, l: number) => frente.clone().multiplyScalar(r).addScaledVector(lado, l)
  const largo = de + (ate - de) * 0.35
  const forma = new THREE.Shape()
  const inicio = em(de, 0)
  forma.moveTo(inicio.x, inicio.y)
  const a = em(largo, largura)
  const fim = em(ate, 0)
  forma.quadraticCurveTo(a.x, a.y, fim.x, fim.y)
  const b = em(largo, -largura)
  forma.quadraticCurveTo(b.x, b.y, inicio.x, inicio.y)
  return forma
}

/** Uma faísca: um losango pequeno. */
function faiscaDoEmblema(centro: THREE.Vector2, tamanho: number, giro: number): THREE.Shape {
  const pontos = [0, 1, 2, 3].map((i) => {
    const raio = i % 2 === 0 ? tamanho : tamanho * 0.35
    return centro.clone().add(polar(giro + (i * Math.PI) / 2, raio))
  })
  return new THREE.Shape(pontos)
}

function empurrao(): THREE.Group {
  const emblema = new THREE.Group()
  const malha = (forma: THREE.Shape, z = 0) => {
    const parte = new THREE.Mesh(extrudar(forma, 48), acoEscuro)
    parte.castShadow = true
    parte.position.z = z
    emblema.add(parte)
  }
  const R = RAIO_DA_CUPULA
  // a bolha: a borda da cúpula, o reflexo de vidro por dentro e o núcleo de luz, uma meia lua no chão
  malha(faixa(R * 0.945, R * 0.11, 0, Math.PI))
  malha(faixa(R * 0.83, R * 0.035, graus(100), graus(158)))
  const nucleo = new THREE.Shape()
  nucleo.absarc(0, 0, R * 0.45, 0, Math.PI, false)
  nucleo.closePath()
  malha(nucleo)
  // os raios de luz saindo do núcleo, dentro da cúpula
  for (let g = 18; g <= 162; g += 24) malha(risco(graus(g), R * 0.5, R * 0.8, 0.012))
  // a linha do chão, fina nas pontas
  const chao = new THREE.Shape()
  chao.absellipse(0, -0.016, R * 1.32, 0.013, 0, Math.PI * 2, false, 0)
  malha(chao)
  // as cinco setas empurrando pra fora
  for (const [angulo, ponta] of [
    [165, 0.68],
    [128, 0.76],
    [90, 0.76],
    [52, 0.76],
    [15, 0.68],
  ]) {
    malha(setaParaFora(graus(angulo), R * 1.18, ponta), 0.002)
  }
  // os riscos de velocidade entre as setas, dois em cada vão, um mais longo que o outro (os de perto das setas dos lados,
  // mais curtos, pra não cruzar a cabeça delas)
  for (const [angulo, de, ate] of [
    [151, 1.12, 1.45],
    [140, 1.08, 1.45],
    [113, 1.12, 1.6],
    [102, 1.08, 1.42],
    [78, 1.08, 1.42],
    [67, 1.12, 1.6],
    [40, 1.08, 1.45],
    [29, 1.12, 1.45],
  ]) {
    malha(risco(graus(angulo), R * de, R * ate, 0.018))
  }
  // as faíscas soltas em volta
  for (const [angulo, raio, tamanho] of [
    [158, 1.95, 0.022],
    [120, 2.12, 0.018],
    [75, 2.05, 0.02],
    [44, 2.0, 0.018],
    [8, 1.9, 0.02],
  ]) {
    malha(faiscaDoEmblema(polar(graus(angulo), R * raio), tamanho, graus(angulo)))
  }
  return emblema
}

// --- o Espiral Absoluto, do desenho do usuário (25/11): o redemoinho de nove braços pretos, cada um afinando em ponta,
// girando em volta do miolo enrolado. São formas cheias, sem buracos: cada braço sai da imagem como ela é, o contorno
// seguido pixel a pixel e simplificado. Os pontos (a imagem tem 1254 px de lado) ficam em desenhos/espiral.json. As
// pontas são finas, então vai o bisel fino da Dempsey.

const QUADRO_DO_REDEMOINHO: Quadro = { centro: new THREE.Vector2(desenhoDoEspiral.centro[0], desenhoDoEspiral.centro[1]), escala: 1 / 740 }

function espiral(): THREE.Group {
  const emblema = new THREE.Group()
  const ponto = doDesenho(QUADRO_DO_REDEMOINHO)
  for (const { contorno } of desenhoDoEspiral.formas as unknown as { contorno: [number, number][] }[]) {
    const parte = new THREE.Mesh(extrudarFino(new THREE.Shape(contorno.map(ponto))), acoEscuro)
    parte.castShadow = true
    emblema.add(parte)
  }
  return emblema
}

const EMBLEMAS: Record<string, () => THREE.Group> = { retalhamento, puxao, dempsey, empurrao, espiral }

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
