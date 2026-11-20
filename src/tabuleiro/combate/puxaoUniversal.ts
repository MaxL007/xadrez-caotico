import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { spriteDeBrilho } from './poderes'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'

// O Puxão Universal, habilidade especial da rainha (desenho e descrição do usuário): ela estende a mão aberta à frente do
// corpo e a peça a ser capturada vem até ela como puxada por uma gravidade forte — acelerando, a cabeça na frente — até
// a cabeça parar na mão. A rainha ergue a peça pendurada pela cabeça e, com o braço descendo de uma vez, esmaga ela no
// chão. A pose do braço vai por cima do clipe, osso por osso, como na luta sem arma; a mão é a esquerda, porque a arma
// (cajado, lua) fica na direita.

/** Os instantes do puxão, em ms desde o começo. */
const ESTENDE_ATE = 420
const PUXA_DE = 380
const PUXA_ATE = 1250
const ERGUE_ATE = 1550
const ESMAGA_DE = 1650
const ESMAGA_ATE = 1900
const VOLTA_ATE = 2350

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'LeftHand']

// as poses da mão, no espaço da rainha (ela olha pra +z, e o lado esquerdo fica em +x)
/** A mão aberta estendida à frente do peito. */
const ESTENDIDA = new THREE.Vector3(0.07, 0.62, 0.46)
/** Erguida, segurando a peça pendurada pela cabeça. */
const ERGUIDA = new THREE.Vector3(0.08, 0.98, 0.4)
/** Lá embaixo, na frente dos pés: onde a peça é esmagada. */
const NO_CHAO = new THREE.Vector3(0.05, 0.12, 0.5)
const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
/** A cabeça da vítima para na frente da palma, não dentro dela (no tamanho da vítima). */
const CABECA_NA_FRENTE_DA_MAO = 0.13
/** As peças ficam em pé nesta altura do tabuleiro. */
const CHAO = 0.05

interface AvisosDoPuxao {
  /** A peça começou a vir (o arrasto). */
  aoPuxar: () => void
  /** A cabeça dela chegou na mão. */
  aoAgarrar: () => void
  /** A peça bateu no chão: daqui em diante quem cuida dela é quem chamou (esmagar, sumir). */
  aoEsmagar: (ponto: THREE.Vector3) => void
}

interface Puxao {
  rainha: THREE.Object3D
  vitima: THREE.Object3D
  cena: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  /** Onde a vítima estava e pra onde olhava. */
  de: THREE.Vector3
  giroDaVitima: THREE.Quaternion
  /** A cabeça da vítima, no espaço dela (tamanho incluído). */
  cabeca: THREE.Vector3
  /** O eixo (no mundo) em volta do qual a vítima se inclina pra rainha. */
  eixoDaInclinacao: THREE.Vector3
  /** Da mão até onde fica a cabeça da vítima: um pouco à frente da palma, pro lado de onde ela veio. */
  naFrenteDaMao: THREE.Vector3
  brilho: THREE.Sprite
  aneis: { malha: THREE.Mesh; nasce: number }[]
  cor: THREE.Color
  puxou: boolean
  agarrou: boolean
  esmagou: boolean
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
  // a vítima vira de frente pra rainha: a inclinação leva a cabeça na direção dela
  const rumo = new THREE.Vector3(rainha.position.x - vitima.position.x, 0, rainha.position.z - vitima.position.z).normalize()
  const giroDaVitima = new THREE.Quaternion().setFromAxisAngle(CIMA, Math.atan2(rumo.x, rumo.z))
  const eixoDaInclinacao = new THREE.Vector3().crossVectors(CIMA, rumo).normalize()
  const brilho = spriteDeBrilho(cor, 0.28 * rainha.scale.x, 0)
  cena.add(brilho)
  puxoes.add({
    rainha,
    vitima,
    cena,
    inicio: agoraDoJogo(),
    ossos: salvarOssos(rainha, OSSOS),
    de: vitima.position.clone(),
    giroDaVitima,
    // em pé e de frente pra rainha, a cabeça fica em cima do centro da peça
    cabeca: new THREE.Vector3(0, cabeca.y, 0),
    eixoDaInclinacao,
    naFrenteDaMao: rumo.clone().multiplyScalar(-CABECA_NA_FRENTE_DA_MAO * vitima.scale.x),
    brilho,
    aneis: [],
    cor: new THREE.Color(cor),
    puxou: false,
    agarrou: false,
    esmagou: false,
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

/** A mão, no espaço da rainha, em cada instante. */
function maoNoInstante(t: number): THREE.Vector3 {
  if (t < PUXA_ATE) return ESTENDIDA.clone()
  if (t < ESMAGA_DE) return ESTENDIDA.clone().lerp(ERGUIDA, sobe(t, PUXA_ATE, ERGUE_ATE))
  // a descida acelera, como quem bate com força
  const u = fracao(t, ESMAGA_DE, ESMAGA_ATE)
  return ERGUIDA.clone().lerp(NO_CHAO, u * u)
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

function encerrar(p: Puxao) {
  puxoes.delete(p)
  p.brilho.removeFromParent()
  p.brilho.material.dispose()
  for (const anel of p.aneis) {
    anel.malha.removeFromParent()
    anel.malha.geometry.dispose()
    ;(anel.malha.material as THREE.Material).dispose()
  }
  p.aneis = []
}

/** Põe a vítima com a cabeça em `mao`, inclinada `inclinacao` (radianos) pra rainha, sem passar pelo chão. */
function pendurarPelaCabeca(p: Puxao, mao: THREE.Vector3, inclinacao: number) {
  const giro = new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacao).multiply(p.giroDaVitima)
  p.vitima.quaternion.copy(giro)
  const cabeca = p.cabeca.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacao))
  p.vitima.position.copy(mao).add(p.naFrenteDaMao).sub(cabeca)
  p.vitima.position.y = Math.max(CHAO, p.vitima.position.y)
}

function posar(p: Puxao, t: number, agora: number) {
  const { rainha } = p
  rainha.updateWorldMatrix(true, true)
  // o braço sobe estendido, segura, ergue, desce de uma vez e volta ao clipe depois do esmagamento
  const peso = sobe(t, 0, ESTENDE_ATE) * (1 - sobe(t, ESMAGA_ATE + 80, VOLTA_ATE))
  // o corpo acompanha: um pouco à frente estendendo, pra trás erguendo a peça, todo à frente na pancada
  const inclinacao = 0.1 * sobe(t, 0, ESTENDE_ATE) - 0.22 * sobe(t, PUXA_ATE, ERGUE_ATE) + 0.5 * sobe(t, ESMAGA_DE, ESMAGA_ATE)
  girarTronco(rainha, LADO, inclinacao * peso)
  girarTronco(rainha, CIMA, -0.18 * peso)
  levarBracoAte(rainha, 'Left', rainha.localToWorld(maoNoInstante(t)), peso)
  // a palma aberta virada pra vítima: a mão sobe um pouco, como quem chama
  const mao = ossoRPG(rainha, 'LeftHand')
  const ondeEstaAMao = mao ? mao.getWorldPosition(new THREE.Vector3()) : rainha.localToWorld(maoNoInstante(t))
  if (mao && peso > 0) girarOssoNoMundo(mao, new THREE.Quaternion().setFromAxisAngle(LADO.clone().transformDirection(rainha.matrixWorld), -0.6 * peso))

  // o brilho na palma: acende estendendo, pulsa puxando e apaga depois de agarrar
  const acende = sobe(t, 120, ESTENDE_ATE) * (1 - sobe(t, PUXA_ATE, PUXA_ATE + 300))
  p.brilho.position.copy(ondeEstaAMao)
  p.brilho.material.opacity = acende * (0.75 + 0.25 * Math.sin(agora / 45))
  p.brilho.scale.setScalar(0.28 * rainha.scale.x * (1 + 0.25 * Math.sin(agora / 70)))

  if (p.esmagou) return
  if (t < PUXA_DE) return
  if (!p.puxou) {
    p.puxou = true
    p.avisos.aoPuxar()
  }
  if (t < PUXA_ATE) {
    // a gravidade: parte devagar e acelera (o caminho cresce com o quadrado do tempo), a cabeça indo na frente
    const u = fracao(t, PUXA_DE, PUXA_ATE)
    const caminho = u * u
    const inclinacaoDaVitima = 0.65 * Math.sin(Math.PI * Math.min(1, caminho * 1.05))
    const giro = new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacaoDaVitima).multiply(p.giroDaVitima)
    p.vitima.quaternion.copy(giro)
    const cabeca = p.cabeca.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacaoDaVitima))
    const alvo = ondeEstaAMao.clone().add(p.naFrenteDaMao).sub(cabeca)
    p.vitima.position.copy(p.de).lerp(alvo, caminho)
    // os pés saem do chão aos poucos
    p.vitima.position.y = Math.max(CHAO, p.de.y + (alvo.y - p.de.y) * caminho)
    if (p.aneis.length === 0 || agora - p.aneis[p.aneis.length - 1].nasce > 110) novoAnel(p, agora)
    moverAneis(p, agora, ondeEstaAMao)
    return
  }
  if (!p.agarrou) {
    p.agarrou = true
    p.avisos.aoAgarrar()
  }
  moverAneis(p, agora, ondeEstaAMao)
  if (t < ESMAGA_DE) {
    // pendurada pela cabeça, balançando cada vez menos
    const desde = t - PUXA_ATE
    pendurarPelaCabeca(p, ondeEstaAMao, 0.22 * Math.sin(desde / 75) * Math.exp(-desde / 380))
    return
  }
  // a descida: a peça vai junto com a mão, em pé, até bater no chão
  pendurarPelaCabeca(p, ondeEstaAMao, 0)
  if (p.vitima.position.y <= CHAO + 1e-3 || t >= ESMAGA_ATE) {
    p.esmagou = true
    p.vitima.position.y = CHAO
    p.avisos.aoEsmagar(p.vitima.position.clone())
  }
}

/** A peça está no meio de um puxão: nessa hora não começa um gesto. */
export function estaPuxando(peca: THREE.Object3D): boolean {
  for (const p of puxoes) if (p.rainha === peca) return true
  return false
}

/** Antes dos clipes, a cada quadro: tira a pose do puxão, pro clipe partir do que ele mesmo deixou. */
export function desfazerPosesDosPuxoes() {
  for (const p of puxoes) restaurarOssos(p.ossos)
}

/** Depois dos clipes, a cada quadro: a pose do puxão precisa ser a última a mexer nos ossos. */
export function atualizarPuxoes(agora: number) {
  for (const p of [...puxoes]) {
    if (!p.continua() || !p.rainha.parent) {
      encerrar(p)
      continue
    }
    const t = agora - p.inicio
    if (t >= VOLTA_ATE) {
      encerrar(p)
      continue
    }
    p.ossos = salvarOssos(p.rainha, OSSOS)
    posar(p, t, agora)
  }
}
