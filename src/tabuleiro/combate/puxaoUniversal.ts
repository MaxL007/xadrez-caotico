import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, type PoseLargada } from '../sensacao/realismo'
import { agoraDoJogo, congelar } from '../sensacao/relogioDoJogo'
import { acaso, criarLeque, emDois, linhasDeVelocidade, QUADRO_EM_DOIS, type Leque } from './efeitosDeAnime'
import { spriteDeBrilho } from './poderes'

// O Puxão Universal, habilidade especial da rainha (desenho e descrição do usuário): ela estende a mão aberta e a peça a
// ser capturada vem até a mão como puxada por uma gravidade forte, e a rainha a esmaga no chão. A execução segue a
// mecânica de movimento do anime (pedido do usuário): o corpo inteiro das duas peças, de pose em pose, com as poses
// paradas tremendo "em dois", os movimentos rápidos entre elas e um golpe fora do comum no meio.
//
//  1. Base de luta: a rainha firma os pés (o esquerdo à frente), desce o corpo, recolhe a mão perto do quadril e torce o
//     tronco pra trás, carregando; a palma acende e brilha (o "tiin").
//  2. Impulso: a mão aberta sai de uma vez e fica (a pose do golpe, tremendo). A outra mão segura o antebraço, firmando
//     (com arma na mão, fica aberta pro lado).
//  3. A peça vem pelo ar acelerando, como quem levou uma pancada enorme: o peito na frente, os braços e as pernas pra
//     trás, com linhas de velocidade. A rainha é arrastada um pouco pra trás, firmando.
//  4. A cabeça trava na mão: faísca, um tranco e o tempo para um instante.
//  5. A hélice: o corpo segue no embalo e gira uma volta e meia presa pela cabeça, na frente da rainha, com o borrão
//     atrás, e para de pernas pro ar, lá no alto.
//  6. O "ma": um instante parado no alto, a rainha arqueada na ponta dos pés.
//  7. A pancada: em três, quatro desenhos a peça bate no chão de costas, deitada de peito pra cima (a cabeça na mão, os
//     pés pra longe). O quadro de impacto, as linhas de foco, a cratera.
//  8. A rainha fica agachada na pose do golpe e só depois se levanta, devagar.
//
// As poses da rainha são chaves (`posesDaRainha`) com a curva de chegada de cada uma, como o desenho de um animador; a
// mão é a esquerda, porque a arma (cajado, lua) fica na direita. O realismo dos membros da vítima fica em
// sensacao/realismo.ts e os borrões, faíscas e linhas em efeitosDeAnime.ts.

/** Os instantes do puxão, em ms desde o começo. */
const BASE_ATE = 170
const CARREGA_ATE = 300
const IMPULSO_ATE = 360
/** A peça começa a vir. */
const PUXA_DE = 420
/** A cabeça trava na mão. */
const PUXA_ATE = 1150
/** A hélice: uma volta e meia, terminando de pernas pro ar. */
const HELICE_ATE = 1600
const VOLTAS_DA_HELICE = 1.5
/** O "ma": parada no alto, antes da pancada. */
const APICE_ATE = 1760
/** A pancada: a peça está no chão. */
const PANCADA_ATE = 1850
/** A rainha fica na pose do golpe (o zanshin) e depois volta devagar. */
const FICA_ATE = 2250
const VOLTA_ATE = 2700
/** O tranco na pegada: o tempo para um instante. */
const TRANCO_MS = 70

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']

const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
/** A cabeça da vítima para na frente da palma, não dentro dela (no tamanho da vítima). */
const CABECA_NA_FRENTE_DA_MAO = 0.13
/** As peças ficam em pé nesta altura do tabuleiro. */
const CHAO = 0.05
/** Deitada, a metade da grossura do corpo (no tamanho da vítima): é o quanto o meio dela fica acima do chão. */
const MEIA_GROSSURA = 0.08
/** Voando, o quanto a peça deita pra frente (a cabeça na frente). */
const INCLINACAO_NO_VOO = 0.55
/** A base de luta: o pé esquerdo à frente e o direito atrás (no espaço e no tamanho da rainha). */
const PE_ESQUERDO = new THREE.Vector3(0.05, 0, 0.13)
const PE_DIREITO = new THREE.Vector3(-0.03, 0, -0.14)

type Curva = 'saida' | 'entrada' | 'suave' | 'linear'
const CURVAS: Record<Curva, (u: number) => number> = {
  // sai de uma vez e assenta (o estalo do anime)
  saida: (u) => 1 - (1 - u) ** 3,
  // começa devagar e chega com tudo (a pancada)
  entrada: (u) => u * u * u,
  suave: (u) => u * u * (3 - 2 * u),
  linear: (u) => u,
}

/** Uma pose-chave da rainha. As mãos ficam no espaço dela (olha pra +z, o lado esquerdo em +x), no tamanho dela. */
interface Pose {
  t: number
  /** Como chega nesta pose, vindo da anterior. */
  curva: Curva
  /** Parada até a próxima, tremendo em dois (o tamanho do tremor da mão). */
  treme?: number
  maoEsquerda: THREE.Vector3
  maoDireita: THREE.Vector3
  /** A mão direita segurando o antebraço esquerdo (0 a 1). */
  segura: number
  inclinacao: number
  giro: number
  /** O quanto o corpo desce (negativo: na ponta dos pés). */
  agacha: number
  /** O corpo pra frente (negativo: arrastada pra trás pelo puxão). */
  avanco: number
  /** Os pés na base de luta (0 a 1). */
  passo: number
  /** O quanto a pose manda no corpo (0: o clipe). */
  peso: number
}

type Desenho = Omit<Pose, 't' | 'curva' | 'treme'>

/** As poses-chave, ajustadas à vítima (a altura da hélice) e ao chão (onde a mão para na pancada). */
function posesDaRainha(altaY: number, chaoY: number, armada: boolean): Pose[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  // a mão direita: em guarda na frente do peito, ou aberta pro lado com a arma
  const guarda = armada ? v(-0.42, 0.68, -0.08) : v(-0.2, 0.6, 0.16)
  const segura = armada ? 0 : 1
  const estendida = v(0.07, 0.66, 0.5)
  const carga: Desenho = { maoEsquerda: v(0.17, 0.5, 0.04), maoDireita: guarda, segura: 0, inclinacao: -0.08, giro: 0.3, agacha: 0.05, avanco: -0.02, passo: 1, peso: 1 }
  const impulso: Desenho = { ...carga, maoEsquerda: estendida, inclinacao: 0.12, giro: -0.3, agacha: 0.03, avanco: 0.05 }
  const helice: Desenho = { ...carga, maoEsquerda: v(0.05, altaY, 0.46), maoDireita: v(-0.46, 0.8, 0.02), inclinacao: -0.1, giro: -0.1, agacha: 0.04, avanco: -0.06 }
  const apice: Desenho = { ...helice, maoEsquerda: v(0.04, altaY + 0.06, 0.38), maoDireita: v(-0.34, 0.52, -0.3), inclinacao: -0.3, giro: 0, agacha: -0.04 }
  const pancada: Desenho = { ...apice, maoEsquerda: v(0.05, chaoY, 0.52), maoDireita: v(-0.3, 0.98, -0.34), inclinacao: 0.75, giro: -0.15, agacha: 0.14, avanco: 0.04 }
  return [
    { t: 0, curva: 'linear', ...carga, maoEsquerda: estendida, inclinacao: 0, giro: 0, agacha: 0, avanco: 0, passo: 0, peso: 0 },
    { t: BASE_ATE, curva: 'saida', ...carga },
    { t: CARREGA_ATE, curva: 'linear', treme: 0.012, ...carga },
    { t: IMPULSO_ATE, curva: 'saida', ...impulso },
    { t: PUXA_DE + 20, curva: 'linear', treme: 0.008, ...impulso },
    // a peça vindo: a rainha firma, a outra mão segura o braço, e o puxão a arrasta um pouco pra trás
    { t: PUXA_ATE, curva: 'suave', ...impulso, maoEsquerda: v(0.07, 0.7, 0.44), segura, inclinacao: -0.18, giro: -0.25, agacha: 0.07, avanco: -0.06 },
    // o tranco da pegada
    { t: PUXA_ATE + 60, curva: 'saida', ...impulso, maoEsquerda: v(0.08, 0.76, 0.36), segura, inclinacao: -0.26, giro: -0.22, agacha: 0.08, avanco: -0.08 },
    { t: PUXA_ATE + 180, curva: 'suave', ...helice },
    { t: HELICE_ATE, curva: 'linear', ...helice },
    { t: HELICE_ATE + 60, curva: 'saida', ...apice },
    { t: APICE_ATE, curva: 'linear', treme: 0.006, ...apice },
    { t: PANCADA_ATE, curva: 'entrada', ...pancada },
    { t: FICA_ATE, curva: 'linear', treme: 0.004, ...pancada },
    { t: VOLTA_ATE, curva: 'suave', ...pancada, maoDireita: guarda, inclinacao: 0, giro: 0, agacha: 0, avanco: 0, passo: 0, peso: 0 },
  ]
}

/** A pose da rainha no instante `t`, entre duas chaves, com o tremor das poses paradas. */
function poseNoInstante(poses: Pose[], t: number): Pose {
  const ultima = poses[poses.length - 1]
  if (t >= ultima.t) return ultima
  let i = 0
  while (poses[i + 1].t <= t) i++
  const a = poses[i]
  const b = poses[i + 1]
  const u = CURVAS[b.curva]((t - a.t) / (b.t - a.t))
  const misturar = (x: number, y: number) => x + (y - x) * u
  const pose: Pose = {
    t,
    curva: b.curva,
    maoEsquerda: a.maoEsquerda.clone().lerp(b.maoEsquerda, u),
    maoDireita: a.maoDireita.clone().lerp(b.maoDireita, u),
    segura: misturar(a.segura, b.segura),
    inclinacao: misturar(a.inclinacao, b.inclinacao),
    giro: misturar(a.giro, b.giro),
    agacha: misturar(a.agacha, b.agacha),
    avanco: misturar(a.avanco, b.avanco),
    passo: misturar(a.passo, b.passo),
    peso: misturar(a.peso, b.peso),
  }
  if (a.treme) {
    // parada, mas viva: a mão treme de desenho em desenho (em dois), como quem segura uma força enorme
    const desenho = Math.floor((t - a.t) / QUADRO_EM_DOIS) + i * 31
    pose.maoEsquerda.add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 7) - 0.5, acaso(desenho + 13) - 0.5).multiplyScalar(2 * a.treme))
    pose.inclinacao += (acaso(desenho + 3) - 0.5) * a.treme * 2
  }
  return pose
}

/** A peça no chão, pro que vem depois (as rachaduras, a cratera, o esmagamento). */
export interface PancadaDoPuxao {
  /** O meio do corpo, na altura do chão. */
  meio: THREE.Vector3
  /** Pra onde a cabeça aponta, no chão (dos pés pra cabeça). */
  rumo: THREE.Vector3
  /** Dos pés ao alto da cabeça. */
  comprimento: number
  /** A metade da grossura do corpo, deitado. */
  meiaGrossura: number
}

interface AvisosDoPuxao {
  /** A palma acendeu, na base de luta (o brilho de anime). */
  aoBrilhar: (mao: THREE.Vector3) => void
  /** A mão saiu de uma vez pra frente. */
  aoEmpurrar: (mao: THREE.Vector3) => void
  /** A peça começou a vir. */
  aoPuxar: () => void
  /** A cabeça dela travou na mão. */
  aoAgarrar: (mao: THREE.Vector3) => void
  /** Cada meia volta da hélice. */
  aoGirar: () => void
  /** A pancada começou a descer. */
  aoBaixar: () => void
  /** A peça bateu no chão, deitada de peito pra cima: daqui em diante quem cuida da altura e do tamanho dela é quem
   * chamou (a cratera, o esmagamento); o puxão só mantém os braços e as pernas esparramados até ela sumir. */
  aoEsmagar: (pancada: PancadaDoPuxao) => void
}

interface Puxao {
  rainha: THREE.Object3D
  vitima: THREE.Object3D
  cena: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  ossosDaVitima: OssoSalvo[]
  poses: Pose[]
  /** A rainha antes do puxão: onde estava, o tamanho e os eixos dela no mundo (a esquerda e a frente). */
  baseDaRainha: THREE.Vector3
  escala: number
  xq: THREE.Vector3
  zq: THREE.Vector3
  /** Onde estavam os pés da rainha (o tornozelo), pra ficarem presos no chão quando o corpo desce. */
  pes: { lado: 'Left' | 'Right'; base: THREE.Vector3; desvio: THREE.Vector3 }[]
  /** Onde a vítima estava. */
  de: THREE.Vector3
  /** A vítima em pé, de frente pra rainha. */
  deFrente: THREE.Quaternion
  /** A cabeça da vítima, no espaço dela (tamanho incluído), e o corpo dos pés ao alto da cabeça. */
  cabeca: THREE.Vector3
  comprimento: number
  /** O eixo (no mundo) em volta do qual a vítima se inclina pra rainha. */
  eixoDaInclinacao: THREE.Vector3
  /** Da vítima pra rainha, no chão. */
  rumo: THREE.Vector3
  /** Da mão até onde fica a cabeça da vítima: um pouco à frente da palma, pro lado de onde ela veio. */
  naFrenteDaMao: THREE.Vector3
  brilho: THREE.Sprite
  aneis: { malha: THREE.Mesh; nasce: number }[]
  leques: { helice: Leque; pancada: Leque }
  cor: THREE.Color
  /** Pra as linhas de velocidade: onde estava a vítima no quadro anterior, e quando. */
  ultimo: { ponto: THREE.Vector3; t: number } | null
  meiasVoltas: number
  marcos: Set<string>
  esmagou: boolean
  /** O corpo da rainha já voltou ao clipe (o puxão só segue cuidando da vítima). */
  rainhaSolta: boolean
  continua: () => boolean
  avisos: AvisosDoPuxao
}

const puxoes = new Set<Puxao>()

const suave = (t: number) => t * t * (3 - 2 * t)
/** 0 antes de `de`, 1 depois de `ate`, suave no meio. */
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const fracao = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))

/** Começa o puxão, com a rainha já virada pra vítima. `continua` falso (outro lance entrou no meio) larga tudo. */
export function puxaoUniversal(rainha: THREE.Object3D, vitima: THREE.Object3D, cena: THREE.Object3D, cor: THREE.ColorRepresentation, continua: () => boolean, avisos: AvisosDoPuxao) {
  rainha.updateWorldMatrix(true, true)
  vitima.updateWorldMatrix(true, true)
  // a cabeça da vítima (no modelo RPG, o osso; na peça simples, perto do alto dela)
  const ossoDaCabeca = ossoRPG(vitima, 'Head')
  const cabecaNoMundo = ossoDaCabeca ? ossoDaCabeca.getWorldPosition(new THREE.Vector3()) : vitima.localToWorld(new THREE.Vector3(0, 0.85, 0))
  const cabeca = cabecaNoMundo.sub(vitima.getWorldPosition(new THREE.Vector3()))
  const rumo = new THREE.Vector3(rainha.position.x - vitima.position.x, 0, rainha.position.z - vitima.position.z).normalize()
  const escala = rainha.scale.x
  const base = rainha.position.clone()
  const xq = LADO.clone().transformDirection(rainha.matrixWorld)
  const zq = new THREE.Vector3(0, 0, 1).transformDirection(rainha.matrixWorld)
  // a hélice no alto o bastante pra peça girar sem bater no chão, e a mão da pancada rente ao chão
  const altaY = THREE.MathUtils.clamp((CHAO + cabeca.y + 0.08 - base.y) / escala, 0.95, 1.25)
  const chaoY = (CHAO + MEIA_GROSSURA * vitima.scale.y - base.y) / escala
  const armada = typeof rainha.userData.arma === 'string' && rainha.userData.arma !== 'nenhuma'
  const pes = (['Left', 'Right'] as const).flatMap((lado) => {
    const pe = ossoRPG(rainha, `${lado}Foot`)
    return pe ? [{ lado, base: pe.getWorldPosition(new THREE.Vector3()), desvio: lado === 'Left' ? PE_ESQUERDO : PE_DIREITO }] : []
  })
  const brilho = spriteDeBrilho(cor, 0.28 * escala, 0)
  cena.add(brilho)
  // a inércia de quem anda não mexe nas duas: quem cuida dos corpos agora é o puxão
  rainha.userData.poseDeHabilidade = true
  vitima.userData.poseDeHabilidade = true
  puxoes.add({
    rainha,
    vitima,
    cena,
    inicio: agoraDoJogo(),
    ossos: [],
    ossosDaVitima: [],
    poses: posesDaRainha(altaY, chaoY, armada),
    baseDaRainha: base,
    escala,
    xq,
    zq,
    pes,
    de: vitima.position.clone(),
    deFrente: new THREE.Quaternion().setFromAxisAngle(CIMA, Math.atan2(rumo.x, rumo.z)),
    // em pé e de frente pra rainha, a cabeça fica em cima do centro da peça
    cabeca: new THREE.Vector3(0, cabeca.y, 0),
    comprimento: cabeca.y * 1.15,
    eixoDaInclinacao: new THREE.Vector3().crossVectors(CIMA, rumo).normalize(),
    rumo,
    naFrenteDaMao: rumo.clone().multiplyScalar(-CABECA_NA_FRENTE_DA_MAO * vitima.scale.x),
    brilho,
    aneis: [],
    leques: { helice: criarLeque(cena, cor, 2.2), pancada: criarLeque(cena, cor, 1.6) },
    cor: new THREE.Color(cor),
    ultimo: null,
    meiasVoltas: 0,
    marcos: new Set(),
    esmagou: false,
    rainhaSolta: false,
    continua,
    avisos,
  })
}

/** Inclina o tronco (metade em cada osso da coluna) em volta de um eixo da peça. */
function girarTronco(peca: THREE.Object3D, eixoNaPeca: THREE.Vector3, angulo: number) {
  if (Math.abs(angulo) < 1e-4) return
  const giro = new THREE.Quaternion().setFromAxisAngle(eixoNaPeca.clone().transformDirection(peca.matrixWorld), angulo / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(peca, nome)
    if (osso) girarOssoNoMundo(osso, giro)
  }
}

/** Um ponto no espaço da rainha de antes do puxão (no tamanho dela), no mundo: o corpo descendo não leva as mãos junto. */
function noMundo(p: Puxao, local: THREE.Vector3): THREE.Vector3 {
  return p.baseDaRainha.clone().addScaledVector(p.xq, local.x * p.escala).addScaledVector(CIMA, local.y * p.escala).addScaledVector(p.zq, local.z * p.escala)
}

/** Acontece uma vez só, no primeiro quadro em que `t` passa de `quando`. */
function primeiraVez(p: Puxao, marco: string, t: number, quando: number): boolean {
  if (t < quando || p.marcos.has(marco)) return false
  p.marcos.add(marco)
  return true
}

/** Um anel da gravidade: nasce em volta da vítima e corre pra mão, encolhendo. */
function novoAnel(p: Puxao, agora: number) {
  const material = new THREE.MeshBasicMaterial({ color: p.cor, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const malha = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 40), material)
  p.cena.add(malha)
  p.aneis.push({ malha, nasce: agora })
}

const ANEL_MS = 360

function moverAneis(p: Puxao, agora: number, mao: THREE.Vector3) {
  for (const anel of [...p.aneis]) {
    const u = (agora - anel.nasce) / ANEL_MS
    if (u >= 1) {
      anel.malha.removeFromParent()
      anel.malha.geometry.dispose()
      ;(anel.malha.material as THREE.Material).dispose()
      p.aneis.splice(p.aneis.indexOf(anel), 1)
      continue
    }
    // do meio da vítima até a mão, de frente pro caminho
    const meio = p.vitima.position.clone().add(new THREE.Vector3(0, p.cabeca.y * 0.55, 0))
    anel.malha.position.copy(meio.lerp(mao, u))
    anel.malha.lookAt(mao)
    anel.malha.scale.setScalar((1.25 - u) * p.vitima.scale.x * 1.6)
    ;(anel.malha.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u)
  }
}

function soltarRainha(p: Puxao) {
  if (p.rainhaSolta) return
  p.rainhaSolta = true
  p.rainha.position.copy(p.baseDaRainha)
  delete p.rainha.userData.poseDeHabilidade
}

function encerrar(p: Puxao) {
  puxoes.delete(p)
  soltarRainha(p)
  delete p.vitima.userData.poseDeHabilidade
  p.brilho.removeFromParent()
  p.brilho.material.dispose()
  p.leques.helice.apagar(1)
  p.leques.pancada.apagar(1)
  for (const anel of p.aneis) {
    anel.malha.removeFromParent()
    anel.malha.geometry.dispose()
    ;(anel.malha.material as THREE.Material).dispose()
  }
  p.aneis = []
}

/** Põe a vítima girada `giro` com a cabeça em `mao`, sem passar de `alturaMinima` pra baixo. */
function pendurarPelaCabeca(p: Puxao, mao: THREE.Vector3, giro: THREE.Quaternion, alturaMinima = CHAO) {
  p.vitima.quaternion.copy(giro)
  const cabeca = p.cabeca.clone().applyQuaternion(giro)
  p.vitima.position.copy(mao).add(p.naFrenteDaMao).sub(cabeca)
  p.vitima.position.y = Math.max(alturaMinima, p.vitima.position.y)
}

/** O corpo inteiro da rainha (por cima do clipe) na pose do instante, e o brilho na palma; devolve onde está a mão. */
function posarRainha(p: Puxao, t: number, agora: number): THREE.Vector3 {
  const { rainha } = p
  const pose = poseNoInstante(p.poses, t)
  // o corpo desce (os joelhos dobram) e vai pra frente ou pra trás, a partir de onde estava
  rainha.position.copy(p.baseDaRainha).addScaledVector(CIMA, -pose.agacha * p.escala).addScaledVector(p.zq, pose.avanco * p.escala)
  rainha.updateWorldMatrix(true, true)
  // os pés na base de luta, presos no chão (na ponta dos pés, sobem um pouco)
  for (const pe of p.pes) {
    const alvo = pe.base.clone().addScaledVector(p.xq, pe.desvio.x * p.escala * pose.passo).addScaledVector(p.zq, pe.desvio.z * p.escala * pose.passo)
    if (pose.agacha < 0) alvo.y -= pose.agacha * p.escala
    levarPernaAte(rainha, pe.lado, alvo, pose.peso)
  }
  girarTronco(rainha, LADO, pose.inclinacao * pose.peso)
  girarTronco(rainha, CIMA, pose.giro * pose.peso)
  levarBracoAte(rainha, 'Left', noMundo(p, pose.maoEsquerda), pose.peso)
  // a mão direita: na pose dela, ou segurando o antebraço esquerdo pra firmar
  const alvoDireita = noMundo(p, pose.maoDireita)
  const antebraco = ossoRPG(rainha, 'LeftForeArm')
  const mao = ossoRPG(rainha, 'LeftHand')
  if (pose.segura > 0 && antebraco && mao) {
    const pegada = antebraco.getWorldPosition(new THREE.Vector3()).lerp(mao.getWorldPosition(new THREE.Vector3()), 0.6).addScaledVector(CIMA, -0.03 * p.escala)
    alvoDireita.lerp(pegada, pose.segura)
  }
  levarBracoAte(rainha, 'Right', alvoDireita, pose.peso)
  // a palma aberta virada pra vítima
  const ondeEstaAMao = mao ? mao.getWorldPosition(new THREE.Vector3()) : noMundo(p, pose.maoEsquerda)
  if (mao && pose.peso > 0) girarOssoNoMundo(mao, new THREE.Quaternion().setFromAxisAngle(LADO.clone().transformDirection(rainha.matrixWorld), -0.6 * pose.peso))

  // o brilho na palma: acende carregando (pulsando em dois), estoura no impulso e apaga depois da pegada
  const acende = sobe(t, 60, BASE_ATE) * (1 - sobe(t, PUXA_ATE, PUXA_ATE + 300))
  const estouro = t >= CARREGA_ATE && t < IMPULSO_ATE + 60 ? 1.8 : 1
  const pulso = Math.sin(emDois(agora) / 45)
  p.brilho.position.copy(ondeEstaAMao)
  p.brilho.material.opacity = acende * (0.75 + 0.25 * pulso)
  p.brilho.scale.setScalar(0.28 * p.escala * estouro * (1 + 0.25 * pulso))
  if (primeiraVez(p, 'brilho', t, CARREGA_ATE - 60)) p.avisos.aoBrilhar(ondeEstaAMao)
  if (primeiraVez(p, 'impulso', t, CARREGA_ATE)) p.avisos.aoEmpurrar(noMundo(p, p.poses[3].maoEsquerda))
  return ondeEstaAMao
}

/** Os braços e as pernas da vítima em cada instante (ver realismo.ts). */
function poseDaVitima(t: number): PoseLargada {
  if (t < PUXA_ATE) {
    // o tranco do começo joga tudo pra trás de uma vez, e a velocidade mantém
    const u = fracao(t, PUXA_DE, PUXA_ATE)
    return { pratras: sobe(t, PUXA_DE, PUXA_DE + 130) * (0.8 + 0.2 * u), abertura: 0.15, arco: sobe(t, PUXA_DE, PUXA_DE + 160) }
  }
  if (t < HELICE_ATE) {
    // girando: os membros esticados pra fora e atrasados, todos pro mesmo lado
    const s = fracao(t, PUXA_ATE, HELICE_ATE)
    const solta = 1 - sobe(t, PUXA_ATE, PUXA_ATE + 160)
    return { pratras: solta, abertura: 0.35, arco: solta, deLado: -0.9 * Math.sin(Math.PI * s) }
  }
  if (t < APICE_ATE) return { pratras: 0.2, abertura: 0.7, arco: 0 }
  // descendo, os membros ficam pra cima, atrasados; no chão, esparramada
  if (t < PANCADA_ATE) return { pratras: -0.7, abertura: 0.5, arco: 0.2 }
  return { pratras: 0, abertura: 1, arco: 0 }
}

/** O giro da vítima: de frente pra rainha, inclinada `inclinacao` pra ela (a cabeça na frente), girada `helice` em
 * volta da frente da rainha (a hélice) e tombada `pancada` pra longe dela (a pancada). */
function giroDaVitima(p: Puxao, inclinacao: number, helice: number, pancada: number): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromAxisAngle(p.eixoDaInclinacao, -pancada)
    .multiply(new THREE.Quaternion().setFromAxisAngle(p.zq, helice))
    .multiply(new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacao))
    .multiply(p.deFrente)
}

function posar(p: Puxao, t: number, agora: number) {
  const ondeEstaAMao = p.rainhaSolta ? null : posarRainha(p, t, agora)
  if (!p.esmagou && ondeEstaAMao && t >= PUXA_DE) moverVitima(p, t, agora, ondeEstaAMao)
  // os braços e as pernas por último, sobre o corpo já no lugar deste quadro; parada no alto, tremem em dois
  if (t >= PUXA_DE) corpoLargado(p.vitima, poseDaVitima(t), t >= HELICE_ATE && t < APICE_ATE ? emDois(agora) : agora)
}

/** Onde está e como está virada a vítima: voando, na hélice, parada no alto, na pancada. */
function moverVitima(p: Puxao, t: number, agora: number, ondeEstaAMao: THREE.Vector3) {
  if (primeiraVez(p, 'puxa', t, PUXA_DE)) p.avisos.aoPuxar()
  const L = p.comprimento
  const cabeca = ondeEstaAMao.clone().add(p.naFrenteDaMao)
  if (t < PUXA_ATE) {
    // a gravidade: parte devagar e acelera (o caminho cresce com o quadrado do tempo); sobe logo no arranque e vem pelo
    // ar, um pouco deitada pra frente, a cabeça na frente
    const u = fracao(t, PUXA_DE, PUXA_ATE)
    const caminho = u * u
    const giro = giroDaVitima(p, INCLINACAO_NO_VOO * suave(Math.min(1, u * 1.4)), 0, 0)
    p.vitima.quaternion.copy(giro)
    const alvo = cabeca.clone().sub(p.cabeca.clone().applyQuaternion(giro))
    p.vitima.position.copy(p.de).lerp(alvo, caminho)
    p.vitima.position.y = Math.max(CHAO, p.de.y + (alvo.y - p.de.y) * (1 - (1 - caminho) ** 3))
    if (p.aneis.length === 0 || agora - p.aneis[p.aneis.length - 1].nasce > 110) novoAnel(p, agora)
    moverAneis(p, agora, ondeEstaAMao)
    linhasDoCorpo(p, t, 2)
    return
  }
  if (primeiraVez(p, 'pegada', t, PUXA_ATE)) {
    // a cabeça bate na mão: faísca e o tempo para um instante
    congelar(TRANCO_MS)
    p.avisos.aoAgarrar(cabeca)
  }
  moverAneis(p, agora, ondeEstaAMao)
  // o plano da hélice (o ângulo 0 é onde estão os pés no começo dela)
  const pesHelice = CIMA.clone().negate()
  const ladoHelice = new THREE.Vector3().crossVectors(p.zq, pesHelice)
  if (t < HELICE_ATE) {
    // só a cabeça trava: o corpo segue no embalo e gira uma volta e meia presa pela cabeça, acelerando e freando, e
    // termina de pernas pro ar
    const s = fracao(t, PUXA_ATE, HELICE_ATE)
    const angulo = VOLTAS_DA_HELICE * Math.PI * 2 * suave(s)
    const endireita = 1 - sobe(t, PUXA_ATE, PUXA_ATE + 160)
    pendurarPelaCabeca(p, ondeEstaAMao, giroDaVitima(p, INCLINACAO_NO_VOO * endireita, angulo, 0))
    p.leques.helice.mostrar(cabeca, pesHelice, ladoHelice, angulo, L, 0.55 * Math.sin(Math.PI * s))
    const meias = Math.floor(angulo / Math.PI)
    if (meias > p.meiasVoltas) {
      p.meiasVoltas = meias
      p.avisos.aoGirar()
    }
    return
  }
  const deCabecaPraBaixo = VOLTAS_DA_HELICE * Math.PI * 2
  if (t < APICE_ATE) {
    // o "ma": parada lá no alto, de pernas pro ar
    p.leques.helice.apagar(120)
    pendurarPelaCabeca(p, ondeEstaAMao, giroDaVitima(p, 0, deCabecaPraBaixo, 0))
    return
  }
  // a pancada: começa devagar e chega com tudo; o corpo tomba pra longe da rainha em volta da cabeça, de costas
  if (primeiraVez(p, 'baixa', t, APICE_ATE)) p.avisos.aoBaixar()
  const meiaGrossura = MEIA_GROSSURA * p.vitima.scale.y
  const deitadaNoChao = CHAO + meiaGrossura
  const v = fracao(t, APICE_ATE, PANCADA_ATE)
  const tomba = (Math.PI / 2) * v * v
  pendurarPelaCabeca(p, ondeEstaAMao, giroDaVitima(p, 0, deCabecaPraBaixo, tomba), CHAO + (deitadaNoChao - CHAO) * v * v)
  p.leques.pancada.mostrar(cabeca, CIMA, p.rumo.clone().negate(), tomba, L, 0.6 * Math.min(1, v * 3))
  linhasDoCorpo(p, t, 3)
  if (t < PANCADA_ATE) return
  p.esmagou = true
  p.leques.pancada.apagar(160)
  const deitada = giroDaVitima(p, 0, deCabecaPraBaixo, Math.PI / 2)
  pendurarPelaCabeca(p, ondeEstaAMao, deitada, deitadaNoChao)
  p.vitima.position.y = deitadaNoChao
  // o meio do corpo, no chão
  const meio = p.vitima.position.clone().add(p.cabeca.clone().multiplyScalar(0.5).applyQuaternion(deitada))
  meio.y = 0
  p.avisos.aoEsmagar({ meio, rumo: p.rumo.clone(), comprimento: L, meiaGrossura })
}

/** As linhas de velocidade em volta do meio do corpo da vítima, no rumo em que ele anda. */
function linhasDoCorpo(p: Puxao, t: number, quantas: number) {
  const meio = p.vitima.position.clone().add(p.cabeca.clone().multiplyScalar(0.5).applyQuaternion(p.vitima.quaternion))
  if (p.ultimo && t > p.ultimo.t) {
    const velocidade = meio.clone().sub(p.ultimo.ponto).multiplyScalar(1000 / (t - p.ultimo.t))
    linhasDeVelocidade(p.cena, meio, velocidade, p.comprimento * 0.3, p.cor, quantas)
  }
  p.ultimo = { ponto: meio, t }
}

/** A peça está no meio de um puxão: nessa hora não começa um gesto. */
export function estaPuxando(peca: THREE.Object3D): boolean {
  for (const p of puxoes) if (p.rainha === peca && !p.rainhaSolta) return true
  return false
}

/** Antes dos clipes, a cada quadro: tira a pose do puxão, pro clipe partir do que ele mesmo deixou. */
export function desfazerPosesDosPuxoes() {
  for (const p of puxoes) {
    restaurarOssos(p.ossosDaVitima)
    restaurarOssos(p.ossos)
  }
}

/** Depois dos clipes, a cada quadro: a pose do puxão precisa ser a última a mexer nos ossos. */
export function atualizarPuxoes(agora: number) {
  for (const p of [...puxoes]) {
    if (!p.continua() || !p.rainha.parent) {
      encerrar(p)
      continue
    }
    const t = agora - p.inicio
    // depois da pancada, o puxão ainda mantém a vítima esparramada até ela sumir no chão
    const vitimaNoChao = p.esmagou && p.vitima.parent !== null && p.vitima.visible
    if (t >= VOLTA_ATE && !vitimaNoChao) {
      encerrar(p)
      continue
    }
    if (t >= VOLTA_ATE) soltarRainha(p)
    p.ossos = p.rainhaSolta ? [] : salvarOssos(p.rainha, OSSOS)
    p.ossosDaVitima = salvarOssos(p.vitima, OSSOS_DO_CORPO_LARGADO)
    posar(p, t, agora)
  }
}
