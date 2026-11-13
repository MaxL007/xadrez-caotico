import * as THREE from 'three'

// O símbolo de cada habilidade especial, pro expositor da Personalização e da Loja (no lugar da arma, que não é o que
// se compra). O do retalhamento vem do desenho do usuário: um átomo de três órbitas cruzadas com dois cortes em
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

const EMBLEMAS: Record<string, () => THREE.Group> = { retalhamento }

/** O símbolo da habilidade, ou null pra opção sem símbolo. */
export function emblemaDaHabilidade(opcao: string): THREE.Group | null {
  return EMBLEMAS[opcao]?.() ?? null
}
