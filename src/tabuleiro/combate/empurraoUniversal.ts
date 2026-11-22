import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, realismo } from '../sensacao/realismo'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'
import { acaso, emDois, QUADRO_EM_DOIS } from './efeitosDeAnime'

// O Empurrão Universal, habilidade da rainha (bilhete e símbolo do usuário): ela vai até a casa da outra peça e, as duas
// no mesmo lugar, carrega a habilidade como uma bolha de vento e repele a peça pra fora do tabuleiro. A bolha é uma
// barreira (pedido do usuário): grande o bastante pra cobrir a rainha inteira, do chão ao alto da cabeça, e nada a
// atravessa, de nenhum lado. Na mecânica do anime, de pose em pose:
//  1. Ela recolhe as mãos na frente do peito, as palmas uma de frente pra outra, e desce o corpo.
//  2. A bolha nasce entre as palmas e cresce até envolver o corpo todo, o ar sendo sugado pra ela. A parede da bolha
//     chega na vítima e a empurra pra trás conforme cresce: ela resiste inclinada, os braços na frente do rosto, os pés
//     escorregando.
//  3. A barreira cheia: correntes de vento correm pela superfície em todas as direções, os anéis giram, a borda brilha;
//     a rainha treme em dois.
//  4. O empurrão: as palmas saem de uma vez pra frente e a bolha se expande de uma vez, como uma onda, e some; a parede
//     passa pela vítima e quem chamou a joga pra fora do tabuleiro (nocaute.ts, \`foraDoTabuleiro\`).
//  5. A rainha fica com as palmas pra frente um instante e volta.
// A pose vai por cima do clipe, osso por osso, desfeita antes dele e refeita depois, como o Puxão.

/** Os instantes, em ms desde o começo (a rainha já parada junto da vítima). */
const RECOLHE_ATE = 220
const FORMA_ATE = 820
const CARGA_ATE = 1250
const EMPURRA_ATE = 1330
const ESTOURA_EM = CARGA_ATE + 30
const EXPANDE_MS = 340
const FICA_ATE = 1850
const VOLTA_ATE = 2250
/** A barreira cheia, pela altura da rainha: o centro no meio do corpo e o raio que passa do alto da cabeça (embaixo, o
 * tabuleiro corta a esfera, e ela fica pousada nele como uma cúpula). */
const CENTRO_DA_BARREIRA = 0.5
const RAIO_DA_BARREIRA = 0.7
/** Quanto a onda do empurrão abre (vezes o raio da barreira) antes de sumir. */
const ONDA = 2.8

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']
const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
/** As mãos, no espaço da rainha (ela olha pra +z, a esquerda em +x): segurando a bolha na frente do peito, e
 * empurrando, os braços esticados. */
const SEGURA_ESQ = new THREE.Vector3(0.085, 0.6, 0.16)
const SEGURA_DIR = new THREE.Vector3(-0.085, 0.6, 0.16)
const EMPURRA_ESQ = new THREE.Vector3(0.07, 0.63, 0.5)
const EMPURRA_DIR = new THREE.Vector3(-0.07, 0.63, 0.5)

interface AvisosDoEmpurrao {
  /** As mãos recolhidas: o brilho de anime entre elas. */
  aoBrilhar: (ponto: THREE.Vector3) => void
  /** A bolha começou a crescer. */
  aoCarregar: () => void
  /** As palmas saíram pra frente e a bolha começou a se expandir. `centro` é o meio da rainha. */
  aoEmpurrar: (ponto: THREE.Vector3, centro: THREE.Vector3) => void
  /** A parede da bolha passou pela vítima: daqui em diante ela é do nocaute. `ponto` é onde a parede bate no peito. */
  aoEstourar: (ponto: THREE.Vector3) => void
}

/** Uma corrente de vento na superfície da barreira: corre num círculo máximo (o plano de `u` e `v`) a `velocidade`. */
interface Corrente {
  risco: THREE.Mesh
  u: THREE.Vector3
  v: THREE.Vector3
  fase: number
  velocidade: number
}

interface Empurrao {
  rainha: THREE.Object3D
  vitima: THREE.Object3D
  cena: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  ossosDaVitima: OssoSalvo[]
  base: THREE.Vector3
  vitimaBase: THREE.Vector3
  frente: THREE.Vector3
  escala: number
  /** O meio do corpo da rainha (o centro da barreira cheia) e o raio dela. */
  corpo: THREE.Vector3
  raioCheio: number
  /** A altura do peito da vítima, no mundo: é onde a parede da bolha encosta nela. */
  peitoDaVitima: number
  /** A distância do centro da rainha ao da vítima no começo (no chão). */
  distanciaInicial: number
  bolha: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  nucleo: THREE.Mesh
  aneis: THREE.Mesh[]
  correntes: Corrente[]
  /** O ar sendo sugado pra bolha: riscos que nascem em volta e correm pra ela. */
  vento: { risco: THREE.Mesh; nasce: number; rumo: THREE.Vector3 }[]
  /** Onde a bolha está agora (o centro e o raio): a vítima é empurrada pela parede dela. */
  centroAgora: THREE.Vector3
  raioAgora: number
  marcos: Set<string>
  vitimaSolta: boolean
  continua: () => boolean
  avisos: AvisosDoEmpurrao
}

const empurroes = new Set<Empurrao>()

const suave = (t: number) => t * t * (3 - 2 * t)
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const fracao = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))
const geometriaDoRisco = new THREE.BoxGeometry(1, 1, 1)

// A superfície da bolha: quase transparente no meio (a rainha fica à vista dentro dela), clara na borda, como uma bolha
// de verdade, e com faixas de vento girando por ela.
const SOMBREADOR_DE_VERTICE = `
varying vec3 vNormalNaVista;
varying vec3 vParaACamera;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 naVista = modelViewMatrix * vec4(position, 1.0);
  vNormalNaVista = normalize(normalMatrix * normal);
  vParaACamera = normalize(-naVista.xyz);
  gl_Position = projectionMatrix * naVista;
}`
const SOMBREADOR_DE_COR = `
uniform vec3 cor;
uniform float opacidade;
uniform float tempo;
varying vec3 vNormalNaVista;
varying vec3 vParaACamera;
varying vec3 vLocal;
void main() {
  float borda = pow(1.0 - abs(dot(normalize(vNormalNaVista), normalize(vParaACamera))), 2.0);
  float giro = sin(atan(vLocal.z, vLocal.x) * 5.0 + vLocal.y * 9.0 - tempo * 7.0);
  float vento = smoothstep(0.6, 1.0, giro) * 0.3;
  gl_FragColor = vec4(cor, opacidade * (0.06 + 0.85 * borda + vento));
}`

/** A altura da peça (dos pés ao alto da cabeça), pelo osso da cabeça no modelo RPG. */
function alturaDe(peca: THREE.Object3D): number {
  peca.updateWorldMatrix(true, true)
  const cabeca = ossoRPG(peca, 'Head')
  if (!cabeca) return 0.85 * peca.scale.y
  return (cabeca.getWorldPosition(new THREE.Vector3()).y - peca.getWorldPosition(new THREE.Vector3()).y) * 1.15
}

/** Começa o empurrão, com a rainha já parada junto da vítima e virada pra ela. */
export function empurraoUniversal(rainha: THREE.Object3D, vitima: THREE.Object3D, cena: THREE.Object3D, cor: THREE.ColorRepresentation, continua: () => boolean, avisos: AvisosDoEmpurrao) {
  rainha.updateWorldMatrix(true, true)
  const frente = new THREE.Vector3(vitima.position.x - rainha.position.x, 0, vitima.position.z - rainha.position.z).normalize()
  const claro = new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.55)
  const material = (opacidade: number) => new THREE.MeshBasicMaterial({ color: claro, transparent: true, opacity: opacidade, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const bolha = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { cor: { value: claro.clone() }, opacidade: { value: 0 }, tempo: { value: 0 } },
      vertexShader: SOMBREADOR_DE_VERTICE,
      fragmentShader: SOMBREADOR_DE_COR,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material(0))
  const aneis = [0, 1, 2].map(() => new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 6, 64), material(0)))
  // as correntes de vento: cada uma num círculo máximo sorteado, umas pra cada lado, pra cobrir a bolha toda
  const correntes = Array.from({ length: 14 }, (_, i): Corrente => {
    const eixo = new THREE.Vector3().randomDirection()
    const u = new THREE.Vector3().crossVectors(eixo, Math.abs(eixo.y) < 0.9 ? CIMA : LADO).normalize()
    const v = new THREE.Vector3().crossVectors(eixo, u)
    return { risco: new THREE.Mesh(geometriaDoRisco, material(0)), u, v, fase: Math.random() * Math.PI * 2, velocidade: (i % 2 === 0 ? 1 : -1) * (5 + Math.random() * 3) }
  })
  for (const peca of [bolha, nucleo, ...aneis, ...correntes.map((c) => c.risco)]) {
    peca.scale.setScalar(0.001)
    cena.add(peca)
  }
  const altura = alturaDe(rainha)
  const corpo = rainha.position.clone().addScaledVector(CIMA, CENTRO_DA_BARREIRA * altura)
  rainha.userData.poseDeHabilidade = true
  vitima.userData.poseDeHabilidade = true
  empurroes.add({
    rainha,
    vitima,
    cena,
    inicio: agoraDoJogo(),
    ossos: [],
    ossosDaVitima: [],
    base: rainha.position.clone(),
    vitimaBase: vitima.position.clone(),
    frente,
    escala: rainha.scale.x,
    corpo,
    raioCheio: RAIO_DA_BARREIRA * altura,
    peitoDaVitima: vitima.position.y + 0.5 * alturaDe(vitima),
    distanciaInicial: new THREE.Vector3(vitima.position.x - rainha.position.x, 0, vitima.position.z - rainha.position.z).length(),
    bolha,
    nucleo,
    aneis,
    correntes,
    vento: [],
    centroAgora: corpo.clone(),
    raioAgora: 0,
    marcos: new Set(),
    vitimaSolta: false,
    continua,
    avisos,
  })
}

function primeiraVez(e: Empurrao, marco: string, t: number, quando: number): boolean {
  if (t < quando || e.marcos.has(marco)) return false
  e.marcos.add(marco)
  return true
}

function girarTronco(peca: THREE.Object3D, eixoNaPeca: THREE.Vector3, angulo: number) {
  if (Math.abs(angulo) < 1e-4) return
  const giro = new THREE.Quaternion().setFromAxisAngle(eixoNaPeca.clone().transformDirection(peca.matrixWorld), angulo / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(peca, nome)
    if (osso) girarOssoNoMundo(osso, giro)
  }
}

/** O corpo da rainha na pose do instante; devolve o meio entre as palmas. */
function posarRainha(e: Empurrao, t: number, agora: number): THREE.Vector3 {
  const { rainha } = e
  const peso = sobe(t, 0, RECOLHE_ATE) * (1 - sobe(t, FICA_ATE, VOLTA_ATE))
  const empurra = 1 - (1 - fracao(t, CARGA_ATE, EMPURRA_ATE)) ** 3
  // carregando, o corpo desce e vai um pouco pra trás; empurrando, vai todo pra frente
  const agacha = (0.05 * sobe(t, 0, RECOLHE_ATE) - 0.01 * empurra) * peso
  rainha.position.copy(e.base).addScaledVector(CIMA, -agacha * e.escala).addScaledVector(e.frente, (0.06 * empurra - 0.02 * sobe(t, RECOLHE_ATE, CARGA_ATE)) * e.escala * peso)
  rainha.updateWorldMatrix(true, true)
  let inclina = -0.12 * sobe(t, RECOLHE_ATE, CARGA_ATE) + 0.32 * empurra
  if (t >= FORMA_ATE && t < CARGA_ATE) {
    // segurando a barreira cheia: treme em dois, como quem segura uma força enorme
    const desenho = Math.floor(agora / QUADRO_EM_DOIS)
    inclina += (acaso(desenho) - 0.5) * 0.05
  }
  girarTronco(rainha, LADO, inclina * peso)
  const esquerda = SEGURA_ESQ.clone().lerp(EMPURRA_ESQ, empurra)
  const direita = SEGURA_DIR.clone().lerp(EMPURRA_DIR, empurra)
  levarBracoAte(rainha, 'Left', rainha.localToWorld(esquerda), peso)
  levarBracoAte(rainha, 'Right', rainha.localToWorld(direita), peso)
  const maoEsq = ossoRPG(rainha, 'LeftHand')
  const maoDir = ossoRPG(rainha, 'RightHand')
  if (maoEsq && maoDir) return maoEsq.getWorldPosition(new THREE.Vector3()).lerp(maoDir.getWorldPosition(new THREE.Vector3()), 0.5).addScaledVector(e.frente, 0.05 * e.escala)
  return rainha.localToWorld(esquerda.clone().lerp(direita, 0.5))
}

/** A bolha: nasce entre as palmas e cresce até envolver a rainha; cheia, com as correntes de vento e os anéis; no
 * empurrão, a onda que abre e some. */
function animarBolha(e: Empurrao, t: number, agora: number, palmas: THREE.Vector3) {
  const material = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial
  const forma = 1 - (1 - fracao(t, RECOLHE_ATE, FORMA_ATE)) ** 2
  const onda = fracao(t, CARGA_ATE, CARGA_ATE + EXPANDE_MS)
  const pulso = 1 + 0.025 * Math.sin(emDois(agora) / 45)
  // o centro sai das palmas e vai pro meio do corpo enquanto a bolha cresce
  const centro = palmas.clone().lerp(e.corpo, forma)
  let raio = THREE.MathUtils.lerp(0.04 * e.escala, e.raioCheio, forma) * (t >= FORMA_ATE ? pulso : 1)
  let visibilidade = Math.min(1, fracao(t, RECOLHE_ATE, RECOLHE_ATE + 200))
  if (t >= CARGA_ATE) {
    // a onda do empurrão: abre de uma vez e some
    raio = e.raioCheio * (1 + (ONDA - 1) * (1 - (1 - onda) ** 2))
    visibilidade = 1 - onda
  }
  const aVista = t >= RECOLHE_ATE && onda < 1
  e.centroAgora.copy(centro)
  e.raioAgora = aVista ? raio : 0
  e.bolha.visible = aVista
  e.bolha.position.copy(centro)
  e.bolha.scale.setScalar(raio)
  e.bolha.material.uniforms.opacidade.value = 0.85 * visibilidade * (t >= CARGA_ATE ? 1.3 : 1)
  e.bolha.material.uniforms.tempo.value = agora / 1000
  // o núcleo: a luz entre as palmas, que some quando a onda sai
  e.nucleo.visible = aVista && t < CARGA_ATE + 60
  e.nucleo.position.copy(palmas)
  e.nucleo.scale.setScalar((0.035 + 0.015 * Math.sin(agora / 50)) * e.escala)
  material(e.nucleo).opacity = 0.8 * visibilidade
  e.aneis.forEach((anel, i) => {
    anel.visible = aVista
    anel.position.copy(centro)
    anel.scale.setScalar(raio * (1.01 + 0.03 * i))
    anel.rotation.set(agora / (300 - i * 60) + i * 1.1, agora / (360 + i * 50) + i * 0.7, i * 0.9)
    material(anel).opacity = 0.55 * visibilidade
  })
  // as correntes de vento correndo pela superfície, pra todo lado: é a barreira que nada atravessa
  const direcao = new THREE.Vector3()
  for (const c of e.correntes) {
    c.risco.visible = aVista && forma > 0.3
    const angulo = c.fase + (c.velocidade * agora) / 1000
    c.risco.position.copy(centro).addScaledVector(c.u, Math.cos(angulo) * raio * 1.02).addScaledVector(c.v, Math.sin(angulo) * raio * 1.02)
    direcao.copy(c.u).multiplyScalar(-Math.sin(angulo)).addScaledVector(c.v, Math.cos(angulo)).multiplyScalar(Math.sign(c.velocidade))
    c.risco.lookAt(c.risco.position.clone().add(direcao))
    c.risco.scale.set(0.007 * e.escala, 0.007 * e.escala, 0.32 * raio)
    material(c.risco).opacity = 0.7 * visibilidade * Math.min(1, (forma - 0.3) / 0.4)
  }
  // o ar sugado: riscos nascem em volta e correm pra bolha, enquanto ela se forma e segura
  if (t >= RECOLHE_ATE && t < CARGA_ATE && (e.vento.length === 0 || agora - e.vento[e.vento.length - 1].nasce > 40)) {
    const risco = new THREE.Mesh(geometriaDoRisco, material(e.nucleo).clone())
    risco.scale.setScalar(0.001)
    e.cena.add(risco)
    e.vento.push({ risco, nasce: agora, rumo: new THREE.Vector3().randomDirection() })
  }
  for (const v of [...e.vento]) {
    const u = (agora - v.nasce) / 260
    if (u >= 1 || t >= CARGA_ATE) {
      v.risco.removeFromParent()
      ;(v.risco.material as THREE.Material).dispose()
      e.vento.splice(e.vento.indexOf(v), 1)
      continue
    }
    const longe = raio + (0.55 - 0.5 * u) * e.escala
    v.risco.position.copy(centro).addScaledVector(v.rumo, longe)
    v.risco.lookAt(centro)
    v.risco.scale.set(0.006 * e.escala, 0.006 * e.escala, 0.14 * e.escala * (1 - u * 0.5))
    ;(v.risco.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.sin(Math.PI * u)
  }
}

/** A vítima empurrada pela parede da bolha: vai pra trás conforme ela cresce, inclinada contra o vento, os braços na
 * frente do rosto, os pés escorregando, tremendo. */
function posarVitima(e: Empurrao, t: number, agora: number) {
  const { vitima } = e
  // onde a parede da bolha está na altura do peito dela (a esfera cortada nessa altura), mais a metade do corpo dela
  const alturaNaBolha = e.peitoDaVitima - e.centroAgora.y
  const paredeNoPeito = e.raioAgora > Math.abs(alturaNaBolha) ? Math.sqrt(e.raioAgora ** 2 - alturaNaBolha ** 2) : 0
  const longe = Math.max(e.distanciaInicial, paredeNoPeito + 0.1 * vitima.scale.x)
  const vento = sobe(t, RECOLHE_ATE + 100, FORMA_ATE) * realismo()
  const desenho = Math.floor(agora / QUADRO_EM_DOIS)
  const treme = (acaso(desenho) - 0.5) * 0.012 * vento
  vitima.position.copy(e.base).setY(e.vitimaBase.y).addScaledVector(e.frente, longe + treme * vitima.scale.x)
  vitima.updateWorldMatrix(true, true)
  const lado = LADO.clone().transformDirection(vitima.matrixWorld)
  const tronco = ossoRPG(vitima, 'Spine')
  if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(lado, -0.3 * vento))
  corpoLargado(vitima, { pratras: -0.6 * vento, abertura: 0.15 * vento, arco: -0.3 * vento, deLado: 0.2 * Math.sin(agora / 70) * vento }, agora)
}

function encerrar(e: Empurrao) {
  empurroes.delete(e)
  e.rainha.position.copy(e.base)
  delete e.rainha.userData.poseDeHabilidade
  if (!e.vitimaSolta) delete e.vitima.userData.poseDeHabilidade
  for (const m of [e.bolha, e.nucleo, ...e.aneis, ...e.correntes.map((c) => c.risco), ...e.vento.map((v) => v.risco)]) {
    m.removeFromParent()
    if (m.geometry !== geometriaDoRisco) m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
  e.vento = []
}

/** Antes dos clipes, a cada quadro: tira as poses. */
export function desfazerPosesDosEmpurroes() {
  for (const e of empurroes) {
    restaurarOssos(e.ossosDaVitima)
    restaurarOssos(e.ossos)
  }
}

/** Depois dos clipes, a cada quadro (no relógio do jogo). */
export function atualizarEmpurroes(agora: number) {
  for (const e of [...empurroes]) {
    const t = agora - e.inicio
    if (!e.continua() || !e.rainha.parent || t >= VOLTA_ATE) {
      encerrar(e)
      continue
    }
    e.ossos = salvarOssos(e.rainha, OSSOS)
    e.ossosDaVitima = e.vitimaSolta || !e.vitima.parent ? [] : salvarOssos(e.vitima, OSSOS_DO_CORPO_LARGADO)
    const palmas = posarRainha(e, t, agora)
    if (primeiraVez(e, 'brilho', t, RECOLHE_ATE)) e.avisos.aoBrilhar(palmas)
    if (primeiraVez(e, 'carga', t, RECOLHE_ATE + 40)) e.avisos.aoCarregar()
    if (primeiraVez(e, 'empurra', t, CARGA_ATE)) e.avisos.aoEmpurrar(palmas, e.corpo.clone())
    animarBolha(e, t, agora, palmas)
    if (!e.vitimaSolta && e.vitima.parent) posarVitima(e, t, agora)
    if (primeiraVez(e, 'estouro', t, ESTOURA_EM)) {
      e.vitimaSolta = true
      delete e.vitima.userData.poseDeHabilidade
      // onde a parede bate: no peito da vítima, do lado da rainha
      const ponto = e.vitima.position.clone().setY(e.peitoDaVitima).addScaledVector(e.frente, -0.08 * e.vitima.scale.x)
      e.avisos.aoEstourar(ponto)
    }
  }
}
