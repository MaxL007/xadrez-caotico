import * as THREE from 'three'
import { apontarOsso, girarOssoNoMundo, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO } from '../sensacao/realismo'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'
import { acaso, QUADRO_EM_DOIS } from './efeitosDeAnime'

// O golpe do cavalo com a lança (pedido do usuário): ele vem a galope até a lança alcançar a vítima (o galope é o
// deslocarRPG; este arquivo faz o resto). O cavaleiro mira o antebraço da lança no peito dela, o cavalo investe e a
// ponta entra no peito; a vítima se curva sobre a lança, presa, tremendo; o cavalo recua e puxa a lança, e ela cai pra
// frente (nocaute.ts) e some. As poses vão por cima do clipe, desfeitas antes dele e refeitas depois, como a luta.

/** Os instantes, em ms desde o começo (o cavalo já parado no alcance da lança). */
const MIRA_ATE = 200
const INVESTE_ATE = 320
const SEGURA_ATE = 760
const PUXA_ATE = 960
const VOLTA_ATE = 1250
/** O quanto a ponta entra no peito. */
const PENETRA = 0.09

const OSSOS = ['RightArm', 'RightForeArm', 'RightHand', 'Spine', 'Spine1']
const LADO = new THREE.Vector3(1, 0, 0)

interface AvisosDaLanca {
  /** A ponta entrou no peito: \`ponto\` é a ponta da lança, \`rumo\` pra onde ela vai. */
  aoPerfurar: (ponto: THREE.Vector3, rumo: THREE.Vector3) => void
  /** O cavalo puxou a lança: daqui em diante a vítima é do nocaute. */
  aoPuxar: (ponto: THREE.Vector3) => void
}

interface Lancada {
  cavalo: THREE.Object3D
  vitima: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  ossosDaVitima: OssoSalvo[]
  base: THREE.Vector3
  frente: THREE.Vector3
  /** O peito da vítima, no mundo: é pra onde o antebraço mira. */
  peito: THREE.Vector3
  vitimaBase: THREE.Vector3
  /** Quanto o cavalo avança na investida (medido no começo dela: até a ponta passar \`PENETRA\` do peito). */
  avanco: number | null
  perfurou: boolean
  puxou: boolean
  continua: () => boolean
  avisos: AvisosDaLanca
}

const lancadas = new Set<Lancada>()

const suave = (t: number) => t * t * (3 - 2 * t)
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const fracao = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))

/** A ponta da arma da peça (as malhas da parte 'arma'): o ponto dela mais à frente no \`rumo\`, no mundo. Funciona com a
 * malha presa ao esqueleto (a lança vai no antebraço) e com a malha comum. */
export function pontaDaArma(peca: THREE.Object3D, rumo: THREE.Vector3): THREE.Vector3 | null {
  peca.updateWorldMatrix(true, true)
  let melhor: THREE.Vector3 | null = null
  let maior = -Infinity
  const ponto = new THREE.Vector3()
  peca.traverse((objeto) => {
    const malha = objeto as THREE.Mesh
    if (!malha.isMesh || malha.userData.parte !== 'arma' || !malha.visible) return
    const posicoes = malha.geometry.attributes.position
    for (let i = 0; i < posicoes.count; i++) {
      malha.getVertexPosition(i, ponto)
      ponto.applyMatrix4(malha.matrixWorld)
      const quanto = ponto.dot(rumo)
      if (quanto > maior) {
        maior = quanto
        melhor = ponto.clone()
      }
    }
  })
  return melhor
}

/** O peito da vítima, no mundo (o osso do peito, ou o meio do corpo). */
function peitoDe(vitima: THREE.Object3D): THREE.Vector3 {
  vitima.updateWorldMatrix(true, true)
  const osso = ossoRPG(vitima, 'Spine2')
  return osso ? osso.getWorldPosition(new THREE.Vector3()) : vitima.position.clone().add(new THREE.Vector3(0, 0.5 * vitima.scale.y, 0))
}

/**
 * A que distância do centro da vítima o cavalo para do galope. A lança vai ao longo do antebraço, e na estocada o
 * antebraço mira o peito: a ponta corre na linha do cotovelo ao peito, a um comprimento de lança do cotovelo. O cavalo
 * para com a ponta mirada um palmo antes do peito, e a investida cobre o resto (e entra).
 */
export function paradaDaLanca(cavalo: THREE.Object3D, vitima: THREE.Object3D): number {
  cavalo.updateWorldMatrix(true, true)
  const frente = new THREE.Vector3(0, 0, 1).transformDirection(cavalo.matrixWorld).setY(0).normalize()
  const lado = new THREE.Vector3(1, 0, 0).transformDirection(cavalo.matrixWorld).setY(0).normalize()
  const ponta = pontaDaArma(cavalo, frente)
  const cotoveloOsso = ossoRPG(cavalo, 'RightForeArm')
  if (!ponta || !cotoveloOsso) return 0.9 * cavalo.scale.x
  const cotovelo = cotoveloOsso.getWorldPosition(new THREE.Vector3())
  const comprimento = ponta.distanceTo(cotovelo)
  const doCentro = cotovelo.clone().sub(cavalo.position)
  const altura = cotovelo.y - peitoDe(vitima).y
  const deLado = doCentro.dot(lado)
  const alcance = doCentro.dot(frente) + Math.sqrt(Math.max(0.01, comprimento ** 2 - altura ** 2 - deLado ** 2))
  return alcance - 0.05 * vitima.scale.x + 0.12 * cavalo.scale.x
}

/** Começa a estocada, com o cavalo já parado no alcance da lança e virado pra vítima. */
export function estocarComLanca(cavalo: THREE.Object3D, vitima: THREE.Object3D, continua: () => boolean, avisos: AvisosDaLanca) {
  cavalo.updateWorldMatrix(true, true)
  vitima.updateWorldMatrix(true, true)
  const frente = new THREE.Vector3(vitima.position.x - cavalo.position.x, 0, vitima.position.z - cavalo.position.z).normalize()
  const peito = peitoDe(vitima)
  // a frente do peito, do lado do cavalo
  peito.addScaledVector(frente, -0.05 * vitima.scale.x)
  cavalo.userData.poseDeHabilidade = true
  vitima.userData.poseDeHabilidade = true
  lancadas.add({
    cavalo,
    vitima,
    inicio: agoraDoJogo(),
    ossos: [],
    ossosDaVitima: [],
    base: cavalo.position.clone(),
    frente,
    peito,
    vitimaBase: vitima.position.clone(),
    avanco: null,
    perfurou: false,
    puxou: false,
    continua,
    avisos,
  })
}

function posar(l: Lancada, t: number, agora: number) {
  const { cavalo, vitima, frente } = l
  const mira = sobe(t, 0, MIRA_ATE) * (1 - sobe(t, PUXA_ATE, VOLTA_ATE))
  // a investida: um palmo pra trás mirando (a carga) e, de uma vez, pra frente até a ponta entrar
  if (t >= MIRA_ATE && l.avanco === null) {
    const ponta = pontaDaArma(cavalo, frente)
    const falta = ponta ? l.peito.clone().sub(ponta).dot(frente) : 0.2
    l.avanco = THREE.MathUtils.clamp(falta + PENETRA, 0, 0.7)  }
  const avanco = l.avanco ?? 0
  const carga = -0.05 * cavalo.scale.x * sobe(t, 0, MIRA_ATE)
  const investe = (1 - (1 - fracao(t, MIRA_ATE, INVESTE_ATE)) ** 3) * (avanco + 0.05 * cavalo.scale.x)
  const recua = sobe(t, SEGURA_ATE, PUXA_ATE) * (avanco + 0.12 * cavalo.scale.x)
  cavalo.position.copy(l.base).addScaledVector(frente, t < MIRA_ATE ? carga : carga * (1 - fracao(t, MIRA_ATE, INVESTE_ATE)) + investe - recua)
  cavalo.updateWorldMatrix(true, true)
  // o cavaleiro inclina pra frente na investida e mira o antebraço (a lança vai ao longo dele) no peito
  const tronco = ossoRPG(cavalo, 'Spine1')
  if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(LADO.clone().transformDirection(cavalo.matrixWorld), 0.25 * mira))
  const antebraco = ossoRPG(cavalo, 'RightForeArm')
  const mao = ossoRPG(cavalo, 'RightHand')
  if (antebraco && mao && mira > 0) apontarOsso(antebraco, mao, l.peito, mira)

  if (!l.perfurou && t >= INVESTE_ATE) {
    l.perfurou = true
    l.avisos.aoPerfurar(pontaDaArma(cavalo, frente) ?? l.peito.clone(), frente.clone())
  }
  if (!l.puxou && t >= SEGURA_ATE + 90) {
    l.puxou = true
    delete vitima.userData.poseDeHabilidade
    l.avisos.aoPuxar(pontaDaArma(cavalo, frente) ?? l.peito.clone())
  }
  if (l.perfurou && !l.puxou && vitima.parent) {
    // presa na lança: empurrada pra trás pela ponta, curvada sobre ela, os braços pra frente, tremendo em dois
    const desenho = Math.floor(agora / QUADRO_EM_DOIS)
    const treme = (acaso(desenho) - 0.5) * 0.012
    const empurra = (0.05 + 0.03 * (1 - Math.exp(-(t - INVESTE_ATE) / 60))) * vitima.scale.x
    vitima.position.copy(l.vitimaBase).addScaledVector(frente, empurra + treme)
    vitima.updateWorldMatrix(true, true)
    corpoLargado(vitima, { pratras: -0.55, abertura: 0.25, arco: -0.7 }, agora)
    const pescoco = ossoRPG(vitima, 'Neck')
    if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(LADO.clone().transformDirection(vitima.matrixWorld), 0.35))
  }
}

/** Antes dos clipes, a cada quadro: tira as poses. */
export function desfazerPosesDasLancas() {
  for (const l of lancadas) {
    restaurarOssos(l.ossosDaVitima)
    restaurarOssos(l.ossos)
  }
}

/** Depois dos clipes, a cada quadro (no relógio do jogo). */
export function atualizarLancas(agora: number) {
  for (const l of [...lancadas]) {
    const t = agora - l.inicio
    if (!l.continua() || !l.cavalo.parent || t >= VOLTA_ATE) {
      l.cavalo.position.copy(l.base)
      delete l.cavalo.userData.poseDeHabilidade
      if (!l.puxou) delete l.vitima.userData.poseDeHabilidade
      lancadas.delete(l)
      continue
    }
    l.ossos = salvarOssos(l.cavalo, OSSOS)
    l.ossosDaVitima = l.puxou || !l.vitima.parent ? [] : salvarOssos(l.vitima, OSSOS_DO_CORPO_LARGADO)
    posar(l, t, agora)
  }
}
