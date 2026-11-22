import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, realismo } from '../sensacao/realismo'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'
import { acaso, emDois, QUADRO_EM_DOIS } from './efeitosDeAnime'

// O Empurrão Universal, habilidade da rainha (bilhete e símbolo do usuário): ela vai até a casa da outra peça e, as duas
// no mesmo lugar, carrega a habilidade como uma bolha de vento e repele a peça pra fora do tabuleiro. Na mecânica do
// anime, de pose em pose:
//  1. Ela recolhe as mãos na frente do peito, as palmas uma de frente pra outra, e desce o corpo.
//  2. A carga: a bolha de vento nasce entre as palmas e cresce, com anéis de vento girando em volta e o ar sendo
//     sugado pra ela; a rainha treme em dois. A vítima sente o vento: se inclina pra trás, os braços na frente do rosto,
//     escorrega pra trás.
//  3. O empurrão: as duas palmas saem de uma vez pra frente, a bolha voa até o peito da vítima e estoura. Quem chamou
//     joga a vítima pra fora do tabuleiro (nocaute.ts, \`foraDoTabuleiro\`).
//  4. A rainha fica com as palmas pra frente um instante e volta.
// A pose vai por cima do clipe, osso por osso, desfeita antes dele e refeita depois, como o Puxão.

/** Os instantes, em ms desde o começo (a rainha já parada na frente da vítima). */
const RECOLHE_ATE = 220
const CARGA_ATE = 1150
const EMPURRA_ATE = 1230
const ESTOURA_EM = 1270
const FICA_ATE = 1750
const VOLTA_ATE = 2150

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
  /** As palmas saíram pra frente. */
  aoEmpurrar: (ponto: THREE.Vector3) => void
  /** A bolha estourou no peito da vítima: daqui em diante ela é do nocaute. */
  aoEstourar: (ponto: THREE.Vector3) => void
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
  bolha: THREE.Mesh
  nucleo: THREE.Mesh
  aneis: THREE.Mesh[]
  /** O ar sendo sugado pra bolha: riscos que nascem em volta e correm pra ela. */
  vento: { risco: THREE.Mesh; nasce: number; rumo: THREE.Vector3 }[]
  /** A bolha voando das mãos até o peito da vítima, e o estouro dela. */
  saida: THREE.Vector3 | null
  estouro: { inicio: number; bolha: THREE.Mesh } | null
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

/** Começa o empurrão, com a rainha já parada na frente da vítima e virada pra ela. */
export function empurraoUniversal(rainha: THREE.Object3D, vitima: THREE.Object3D, cena: THREE.Object3D, cor: THREE.ColorRepresentation, continua: () => boolean, avisos: AvisosDoEmpurrao) {
  rainha.updateWorldMatrix(true, true)
  const frente = new THREE.Vector3(vitima.position.x - rainha.position.x, 0, vitima.position.z - rainha.position.z).normalize()
  const claro = new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.55)
  const material = (opacidade: number) => new THREE.MeshBasicMaterial({ color: claro, transparent: true, opacity: opacidade, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), material(0))
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material(0))
  const aneis = [0, 1, 2].map(() => new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), material(0)))
  cena.add(bolha, nucleo, ...aneis)
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
    bolha,
    nucleo,
    aneis,
    vento: [],
    saida: null,
    estouro: null,
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
  if (t >= 650 && t < CARGA_ATE) {
    // segurando a bolha que cresce: treme em dois, como quem segura uma força enorme
    const desenho = Math.floor(agora / QUADRO_EM_DOIS)
    inclina += (acaso(desenho) - 0.5) * 0.05 * sobe(t, 650, CARGA_ATE)
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

/** A bolha entre as palmas, os anéis de vento e o ar sendo sugado; e, depois do empurrão, o voo dela e o estouro. */
function animarBolha(e: Empurrao, t: number, agora: number, palmas: THREE.Vector3) {
  const material = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial
  const cresce = sobe(t, RECOLHE_ATE, CARGA_ATE)
  const pulso = 1 + 0.06 * Math.sin(emDois(agora) / 40)
  let centro = palmas
  let raio = (0.05 + 0.18 * cresce) * e.escala * pulso
  if (t >= CARGA_ATE) {
    // empurrada: a bolha voa das palmas até o peito da vítima
    e.saida ??= palmas.clone()
    const peito = e.vitima.position.clone().add(new THREE.Vector3(0, 0.5 * e.vitima.scale.y, 0))
    centro = e.saida.clone().lerp(peito, 1 - (1 - fracao(t, CARGA_ATE, ESTOURA_EM)) ** 2)
    raio = 0.22 * e.escala
  }
  const visivel = t >= RECOLHE_ATE && t < ESTOURA_EM
  e.bolha.visible = e.nucleo.visible = visivel
  e.bolha.position.copy(centro)
  e.bolha.scale.setScalar(raio)
  material(e.bolha).opacity = 0.34 * Math.min(1, cresce * 3)
  e.nucleo.position.copy(centro)
  e.nucleo.scale.setScalar(raio * 0.45)
  material(e.nucleo).opacity = 0.75 * Math.min(1, cresce * 3)
  e.aneis.forEach((anel, i) => {
    anel.visible = visivel
    anel.position.copy(centro)
    anel.scale.setScalar(raio * (1.15 + 0.15 * i))
    anel.rotation.set(agora / (260 - i * 50) + i * 1.1, agora / (310 + i * 40) + i * 0.7, i * 0.9)
    material(anel).opacity = 0.65 * Math.min(1, cresce * 2.5)
  })
  // o ar sugado: riscos nascem em volta e correm pra bolha, mais rápido quanto mais ela cresce
  if (t >= RECOLHE_ATE && t < CARGA_ATE && (e.vento.length === 0 || agora - e.vento[e.vento.length - 1].nasce > 45)) {
    const risco = new THREE.Mesh(geometriaDoRisco, (material(e.bolha).clone() as THREE.MeshBasicMaterial))
    e.cena.add(risco)
    e.vento.push({ risco, nasce: agora, rumo: new THREE.Vector3().randomDirection() })
  }
  for (const v of [...e.vento]) {
    const u = (agora - v.nasce) / 260
    if (u >= 1 || t >= ESTOURA_EM) {
      v.risco.removeFromParent()
      ;(v.risco.material as THREE.Material).dispose()
      e.vento.splice(e.vento.indexOf(v), 1)
      continue
    }
    const longe = (0.55 - 0.45 * u) * e.escala
    v.risco.position.copy(centro).addScaledVector(v.rumo, longe)
    v.risco.lookAt(centro)
    v.risco.scale.set(0.006 * e.escala, 0.006 * e.escala, 0.14 * e.escala * (1 - u * 0.5))
    ;(v.risco.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.sin(Math.PI * u)
  }
  // o estouro: a bolha abre de uma vez em volta da vítima e some
  if (e.estouro) {
    const u = fracao(agora, e.estouro.inicio, e.estouro.inicio + 380)
    e.estouro.bolha.scale.setScalar((0.2 + 1.3 * (1 - (1 - u) ** 2)) * e.escala)
    material(e.estouro.bolha).opacity = 0.35 * (1 - u)
    if (u >= 1) {
      e.estouro.bolha.removeFromParent()
      e.estouro.bolha.geometry.dispose()
      material(e.estouro.bolha).dispose()
      e.estouro = null
    }
  }
}

/** A vítima sente o vento: se inclina pra trás, os braços na frente do rosto, escorrega e treme. */
function posarVitima(e: Empurrao, t: number, agora: number) {
  const { vitima } = e
  const vento = sobe(t, RECOLHE_ATE + 150, CARGA_ATE) * realismo()
  const desenho = Math.floor(agora / QUADRO_EM_DOIS)
  const treme = (acaso(desenho) - 0.5) * 0.01 * vento
  vitima.position.copy(e.vitimaBase).addScaledVector(e.frente, (0.06 * vento + treme) * vitima.scale.x)
  vitima.updateWorldMatrix(true, true)
  const lado = LADO.clone().transformDirection(vitima.matrixWorld)
  const tronco = ossoRPG(vitima, 'Spine')
  if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(lado, -0.28 * vento))
  corpoLargado(vitima, { pratras: -0.6 * vento, abertura: 0.15 * vento, arco: -0.3 * vento, deLado: 0.2 * Math.sin(agora / 70) * vento }, agora)
}

function encerrar(e: Empurrao) {
  empurroes.delete(e)
  e.rainha.position.copy(e.base)
  delete e.rainha.userData.poseDeHabilidade
  if (!e.vitimaSolta) delete e.vitima.userData.poseDeHabilidade
  for (const m of [e.bolha, e.nucleo, ...e.aneis, ...e.vento.map((v) => v.risco), ...(e.estouro ? [e.estouro.bolha] : [])]) {
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
    if (!e.continua() || !e.rainha.parent || (t >= VOLTA_ATE && !e.estouro)) {
      encerrar(e)
      continue
    }
    e.ossos = salvarOssos(e.rainha, OSSOS)
    e.ossosDaVitima = e.vitimaSolta || !e.vitima.parent ? [] : salvarOssos(e.vitima, OSSOS_DO_CORPO_LARGADO)
    const palmas = posarRainha(e, t, agora)
    if (primeiraVez(e, 'brilho', t, RECOLHE_ATE)) e.avisos.aoBrilhar(palmas)
    if (primeiraVez(e, 'carga', t, RECOLHE_ATE + 40)) e.avisos.aoCarregar()
    if (primeiraVez(e, 'empurra', t, CARGA_ATE)) e.avisos.aoEmpurrar(palmas)
    animarBolha(e, t, agora, palmas)
    if (!e.vitimaSolta && e.vitima.parent) posarVitima(e, t, agora)
    if (primeiraVez(e, 'estouro', t, ESTOURA_EM)) {
      e.vitimaSolta = true
      delete e.vitima.userData.poseDeHabilidade
      const ponto = e.bolha.position.clone()
      const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), (e.bolha.material as THREE.MeshBasicMaterial).clone())
      bolha.position.copy(ponto)
      bolha.scale.setScalar(0.2 * e.escala)
      e.cena.add(bolha)
      e.estouro = { inicio: agora, bolha }
      e.avisos.aoEstourar(ponto)
    }
  }
}
