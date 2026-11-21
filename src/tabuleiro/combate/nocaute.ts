import * as THREE from 'three'
import { voltarAoDescanso } from '../animacoes/gestos'
import { prepararParaSumir } from '../animacoes/queda'
import { girarOssoNoMundo, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { mostrarEspadaRPG, novaSequenciaRPG } from '../pecas/modelosRPG'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, realismo, type PoseLargada } from '../sensacao/realismo'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'
import { linhasDeVelocidade } from './efeitosDeAnime'

// O nocaute (pedido do usuário: golpes intensos, de um jeito que a queda faça sentido). A vítima dos golpes simples (os
// socos, o chute, a espada, os poderes de longe) não cai mais no lugar: a força do golpe joga o corpo, como um corpo de
// verdade. A distância sai da força do golpe e da massa das duas peças (a rainha arremessa o peão longe; o peão mal
// tira a rainha do lugar, mas derruba), e o golpe acima do meio do corpo faz ele girar pra trás no ar: cai deitado,
// quica, desliza um pouco e fica estirado antes de sumir. Apanhando de costas, cai de cara; uma peça no caminho segura o
// voo antes dela; perto da beira, cai do tabuleiro na mesa. No jab (o golpe que não derruba), só a sacudida: a cabeça vai
// pra trás e a peça recua meio passo, tonta.
// Tudo anda no relógio do jogo: no congelamento do impacto, a vítima fica parada na pose da pancada.

const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
const FRENTE = new THREE.Vector3(0, 0, 1)
/** As peças pisam nesta altura; fora do tabuleiro (moldura incluída) fica a mesa. */
const CHAO = 0.05
const CHAO_DA_MESA = -0.36
const BEIRA_DO_TABULEIRO = 4.7
/** Deitada, a metade da grossura do corpo (no tamanho da peça). */
const MEIA_GROSSURA = 0.08
/** Quanto a peça fica estirada no chão antes de sumir, e quanto leva sumindo. */
const ESTIRADA_MS = 380
const SUMIR_MS = 650
const QUIQUE_MS = 200
const DESLIZE_MS = 260
const SACUDIDA_MS = 340

export interface ForcaDoGolpe {
  /** De quem bate pra vítima, no chão. */
  direcao: { x: number; z: number }
  /** 1 é um direto forte; o chute e a derrubada passam disso, o corte de lado fica abaixo. */
  forca: number
  massaDeQuemBate: number
  massaDaVitima: number
  /** Onde o golpe pega, de 0 (os pés) a 1 (o alto da cabeça): no queixo 0,6, na barriga 0,42. */
  altura: number
}

interface AvisosDoNocaute {
  /** A peça bateu no chão (o baque, a poeira): `onde` é o meio do corpo, no chão. */
  aoPousar: (onde: THREE.Vector3, massa: number) => void
  /** A peça sumiu: tira do tabuleiro e segue o lance. */
  aoTerminar: () => void
}

interface Sacudida {
  vitima: THREE.Object3D
  inicio: number
  rumo: THREE.Vector3
  forca: number
  base: THREE.Vector3
  giroInicial: number
  giroFinal: number
  ossos: OssoSalvo[]
}

interface Nocaute {
  vitima: THREE.Object3D
  cena: THREE.Object3D
  inicio: number
  rumo: THREE.Vector3
  /** Em volta de que eixo a peça gira no ar (o alto dela vai pro lado do golpe), e quanto. */
  eixo: THREE.Vector3
  giroTotal: number
  giroBase: THREE.Quaternion
  /** O meio do corpo: de onde sai, onde pousa, a que altura fica do pé (e a altura do corpo todo). */
  de: THREE.Vector3
  ate: THREE.Vector3
  meio: number
  altura: number
  chao: number
  distancia: number
  vooMs: number
  arco: number
  /** Os membros no voo: pra que lado ficam atrasados, e o corpo dobrado em volta do golpe. */
  pose: PoseLargada
  /** A massa da vítima (o baque no chão). */
  massa: number
  pousou: boolean
  sumir: ((opacidade: number) => void) | null
  ossos: OssoSalvo[]
  ultimo: { ponto: THREE.Vector3; t: number } | null
  continua: () => boolean
  avisos: AvisosDoNocaute
}

const sacudidas = new Set<Sacudida>()
const nocautes = new Set<Nocaute>()

const suave = (t: number) => t * t * (3 - 2 * t)
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))

function rumoNoChao(direcao: { x: number; z: number }): THREE.Vector3 {
  const rumo = new THREE.Vector3(direcao.x, 0, direcao.z)
  return rumo.lengthSq() < 1e-8 ? new THREE.Vector3(0, 0, 1) : rumo.normalize()
}

/** A altura da peça (dos pés ao alto da cabeça), pelo osso da cabeça no modelo RPG. */
function alturaDaPeca(peca: THREE.Object3D): number {
  peca.updateWorldMatrix(true, true)
  const cabeca = ossoRPG(peca, 'Head')
  if (!cabeca) return 0.85 * peca.scale.y
  return (cabeca.getWorldPosition(new THREE.Vector3()).y - peca.getWorldPosition(new THREE.Vector3()).y) * 1.15
}

/** O jab: a cabeça vai pra trás, a peça vira pra quem bate e recua meio passo, tonta, sem cair. */
export function sacudir(vitima: THREE.Object3D, direcao: { x: number; z: number }, forca: number) {
  const rumo = rumoNoChao(direcao)
  for (const s of sacudidas) if (s.vitima === vitima) sacudidas.delete(s)
  voltarAoDescanso(vitima)
  // vira pra quem bate pelo caminho mais curto
  const giroInicial = vitima.rotation.y
  let giroFinal = Math.atan2(-rumo.x, -rumo.z)
  while (giroFinal - giroInicial > Math.PI) giroFinal -= Math.PI * 2
  while (giroFinal - giroInicial < -Math.PI) giroFinal += Math.PI * 2
  vitima.userData.poseDeHabilidade = true
  sacudidas.add({ vitima, inicio: agoraDoJogo(), rumo, forca, base: vitima.position.clone(), giroInicial, giroFinal, ossos: [] })
}

/**
 * O golpe que derruba: a peça sai voando pela força do golpe e cai (ver o começo do arquivo). `outras` são as peças no
 * tabuleiro, pra o voo parar antes de bater numa delas.
 */
export function nocautear(cena: THREE.Object3D, vitima: THREE.Object3D, golpe: ForcaDoGolpe, outras: THREE.Object3D[], continua: () => boolean, avisos: AvisosDoNocaute) {
  for (const s of sacudidas) if (s.vitima === vitima) sacudidas.delete(s)
  voltarAoDescanso(vitima)
  novaSequenciaRPG(vitima)
  mostrarEspadaRPG(vitima, false)
  vitima.userData.poseDeHabilidade = true
  const rumo = rumoNoChao(golpe.direcao)
  const altura = alturaDaPeca(vitima)
  const meio = altura * 0.45
  // a força passa pra vítima conforme as massas: quem pesa mais arremessa mais longe, mas todo golpe derruba
  const razao = golpe.massaDeQuemBate / Math.max(0.5, golpe.massaDaVitima)
  let distancia = THREE.MathUtils.clamp(0.62 * golpe.forca * Math.pow(razao, 0.35), 0.35, 1.3)
  // uma peça no caminho segura o voo antes dela
  const de = vitima.position.clone()
  for (const outra of outras) {
    if (outra === vitima || !outra.visible) continue
    const ate = new THREE.Vector3(outra.position.x - de.x, 0, outra.position.z - de.z)
    const adiante = ate.dot(rumo)
    const deLado = ate.clone().addScaledVector(rumo, -adiante).length()
    if (adiante > 0.2 && deLado < 0.38) distancia = Math.min(distancia, Math.max(0.15, adiante - altura - 0.12))
  }
  const pouso = de.clone().addScaledVector(rumo, distancia)
  const foraDoTabuleiro = Math.abs(pouso.x) > BEIRA_DO_TABULEIRO || Math.abs(pouso.z) > BEIRA_DO_TABULEIRO
  const chao = foraDoTabuleiro ? CHAO_DA_MESA : CHAO
  const meiaGrossura = MEIA_GROSSURA * vitima.scale.y
  // o golpe acima do meio do corpo faz girar pra trás; os mais fortes dão uma cambalhota inteira antes de cair
  const giroTotal = Math.PI / 2 + (distancia > 1.1 ? Math.PI * 2 : 0)
  // de que lado a vítima levou: de frente, cai de costas com os membros jogados pra frente; de costas, cai de cara
  vitima.updateWorldMatrix(true, false)
  const frente = FRENTE.clone().transformDirection(vitima.matrixWorld)
  const esquerda = LADO.clone().transformDirection(vitima.matrixWorld)
  const deFrente = -frente.dot(rumo)
  nocautes.add({
    vitima,
    cena,
    inicio: agoraDoJogo(),
    rumo,
    eixo: new THREE.Vector3().crossVectors(CIMA, rumo).normalize(),
    giroTotal,
    giroBase: vitima.quaternion.clone(),
    de: de.clone().add(new THREE.Vector3(0, meio, 0)),
    ate: pouso.clone().setY(chao + meiaGrossura),
    meio,
    altura,
    chao,
    distancia,
    vooMs: (0.24 + 0.2 * distancia) * 1000 + (foraDoTabuleiro ? 180 : 0),
    arco: 0.06 + 0.18 * Math.min(1, distancia) * Math.min(1.3, golpe.forca),
    pose: {
      pratras: 0.9 * frente.dot(rumo),
      deLado: 0.9 * esquerda.dot(rumo.clone().negate()),
      abertura: 0.25,
      arco: -0.6 * deFrente * (golpe.altura < 0.5 ? 1.4 : 1),
    },
    massa: golpe.massaDaVitima,
    pousou: false,
    sumir: null,
    ossos: [],
    ultimo: null,
    continua,
    avisos,
  })
}

/** Pra qual lado a peça gira no ar (e quanto): o alto dela vai pro lado do golpe. */
function giroNoAr(n: Nocaute, angulo: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(n.eixo, angulo).multiply(n.giroBase)
}

/** Põe a peça com o meio do corpo em `meio`, girada `angulo`, sem nenhuma ponta abaixo do chão. */
function colocar(n: Nocaute, meio: THREE.Vector3, angulo: number) {
  const giro = giroNoAr(n, angulo)
  n.vitima.quaternion.copy(giro)
  const doPeAoMeio = new THREE.Vector3(0, n.meio, 0).applyQuaternion(giro)
  const doMeioAoAlto = new THREE.Vector3(0, n.altura - n.meio, 0).applyQuaternion(giro)
  const pe = meio.clone().sub(doPeAoMeio)
  const alto = meio.clone().add(doMeioAoAlto)
  const maisBaixo = Math.min(pe.y, alto.y)
  if (maisBaixo < n.chao) pe.y += n.chao - maisBaixo
  n.vitima.position.copy(pe)
}

function atualizarNocaute(n: Nocaute, agora: number): boolean {
  const t = agora - n.inicio
  if (t < n.vooMs) {
    // no ar: o meio do corpo num arco (a força pra frente, a gravidade pra baixo), girando mais rápido no começo
    const u = t / n.vooMs
    const anda = 1 - Math.pow(1 - u, 1.3)
    const meio = n.de.clone().lerp(n.ate, anda).addScaledVector(CIMA, 4 * n.arco * u * (1 - u))
    colocar(n, meio, n.giroTotal * (1 - Math.pow(1 - u, 1.4)))
    if (n.ultimo && t > n.ultimo.t && n.distancia > 0.7) {
      const velocidade = meio.clone().sub(n.ultimo.ponto).multiplyScalar(1000 / (t - n.ultimo.t))
      linhasDeVelocidade(n.cena, meio, velocidade, n.altura * 0.3, 0xffffff, 1)
    }
    n.ultimo = { ponto: meio, t }
    corpoLargado(n.vitima, { ...n.pose, pratras: n.pose.pratras * Math.min(1, t / 60 + 0.4), abertura: n.pose.abertura + 0.2 * u }, agora)
    return true
  }
  const noChao = t - n.vooMs
  if (!n.pousou) {
    n.pousou = true
    n.avisos.aoPousar(n.ate.clone().setY(0), n.massa)
  }
  // o baque: um quique pequeno, o corpo balança e assenta, e ainda desliza um pouco com o tranco
  const quique = noChao < QUIQUE_MS ? Math.sin((Math.PI * noChao) / QUIQUE_MS) * 0.035 * Math.min(1, n.distancia) : 0
  const balanco = -0.14 * Math.sin(Math.PI * Math.min(1, noChao / (QUIQUE_MS + 60))) * Math.min(1, n.distancia)
  const desliza = 0.14 * n.distancia * (1 - Math.pow(1 - Math.min(1, noChao / DESLIZE_MS), 2))
  const meio = n.ate.clone().addScaledVector(n.rumo, desliza).addScaledVector(CIMA, quique)
  colocar(n, meio, n.giroTotal + balanco * realismo())
  // os membros batem no chão e se esparramam
  const esparrama = Math.min(1, noChao / 120)
  corpoLargado(n.vitima, { pratras: n.pose.pratras * (1 - esparrama), deLado: (n.pose.deLado ?? 0) * (1 - esparrama), abertura: 0.45 + 0.5 * esparrama, arco: n.pose.arco * (1 - esparrama) }, agora)
  const sumindo = (noChao - DESLIZE_MS - ESTIRADA_MS) / SUMIR_MS
  if (sumindo > 0) {
    n.sumir ??= prepararParaSumir(n.vitima)
    n.sumir(1 - Math.min(1, sumindo))
    n.vitima.position.y -= 0.12 * Math.min(1, sumindo)
    if (sumindo >= 1) {
      n.vitima.visible = false
      n.avisos.aoTerminar()
      return false
    }
  }
  return true
}

function atualizarSacudida(s: Sacudida, agora: number): boolean {
  const t = agora - s.inicio
  if (t >= SACUDIDA_MS) {
    s.vitima.position.copy(s.base).addScaledVector(s.rumo, 0.05 * s.forca * s.vitima.scale.x * 0.55)
    s.vitima.rotation.y = s.giroFinal
    delete s.vitima.userData.poseDeHabilidade
    return false
  }
  const k = Math.exp(-t / 90)
  // recua com o tranco e assenta um pouco à frente de onde parou
  const recuo = 0.05 * s.forca * s.vitima.scale.x * (1 - Math.exp(-t / 45)) * (1 - 0.45 * sobe(t, 120, SACUDIDA_MS))
  s.vitima.position.copy(s.base).addScaledVector(s.rumo, recuo)
  s.vitima.rotation.y = s.giroInicial + (s.giroFinal - s.giroInicial) * sobe(t, 0, 100)
  s.vitima.updateWorldMatrix(true, true)
  // a cabeça e o peito vão pra trás de uma vez e voltam balançando; os braços se soltam
  const lado = LADO.clone().transformDirection(s.vitima.matrixWorld)
  const balanca = k * Math.cos(t / 70) * s.forca * realismo()
  const pescoco = ossoRPG(s.vitima, 'Neck')
  const peito = ossoRPG(s.vitima, 'Spine2')
  if (peito) girarOssoNoMundo(peito, new THREE.Quaternion().setFromAxisAngle(lado, -0.22 * balanca))
  if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(lado, -0.55 * balanca))
  corpoLargado(s.vitima, { pratras: -0.45 * k * s.forca, abertura: 0.2 * k, arco: 0 }, agora)
  return true
}

/** Antes dos clipes, a cada quadro: tira as poses das vítimas. */
export function desfazerPosesDosNocautes() {
  for (const n of nocautes) restaurarOssos(n.ossos)
  for (const s of sacudidas) restaurarOssos(s.ossos)
}

/** Depois dos clipes, a cada quadro (no relógio do jogo): a sacudida e o voo das vítimas. */
export function atualizarNocautes(agora: number) {
  for (const s of [...sacudidas]) {
    if (!s.vitima.parent) {
      sacudidas.delete(s)
      continue
    }
    s.ossos = salvarOssos(s.vitima, OSSOS_DO_CORPO_LARGADO)
    if (!atualizarSacudida(s, agora)) sacudidas.delete(s)
  }
  for (const n of [...nocautes]) {
    if (!n.continua() || !n.vitima.parent) {
      nocautes.delete(n)
      continue
    }
    n.ossos = salvarOssos(n.vitima, OSSOS_DO_CORPO_LARGADO)
    if (!atualizarNocaute(n, agora)) nocautes.delete(n)
  }
}

/** Só nos testes: as vítimas no ar e no chão agora. */
export const nocautesEmAndamento = () => nocautes.size
