import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, type PoseLargada } from '../sensacao/realismo'
import { spriteDeBrilho } from './poderes'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'

// O Puxão Universal, habilidade especial da rainha (desenho e descrição do usuário): ela estende a mão aberta à frente do
// corpo e a peça a ser capturada vem até ela como puxada por uma gravidade forte, acelerando. A peça voa como quem levou
// uma pancada enorme: o peito na frente, os braços e as pernas jogados pra trás (o realismo, em sensacao/realismo.ts).
// Só a cabeça trava na mão; o corpo continua vindo no embalo, passa por baixo dela e gira de costas pra rainha, e no
// mesmo instante a rainha começa a pancada: o braço sobe levado pelo embalo e desce de uma vez, e a peça bate no chão
// deitada de peito pra cima, a cabeça na mão da rainha e os pés pra longe. O chão cede debaixo dela (cratera.ts), e ela
// é esmagada assim, deitada. A pose do braço vai por cima do clipe, osso por osso, como na luta sem arma; a mão é a
// esquerda, porque a arma (cajado, lua) fica na direita.

/** Os instantes do puxão, em ms desde o começo. */
const ESTENDE_ATE = 420
const PUXA_DE = 380
/** A cabeça chega na mão e trava. */
const PUXA_ATE = 1250
/** O embalo: o corpo passa por baixo da cabeça girando de costas pra rainha, e o braço dela sobe levado por ele. */
const EMBALO_ATE = 1460
/** O braço desce de uma vez: a peça bate no chão. */
const ESMAGA_ATE = 1720
const VOLTA_ATE = 2200

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'LeftHand']

// as poses da mão, no espaço da rainha (ela olha pra +z, e o lado esquerdo fica em +x)
/** A mão aberta estendida à frente do peito. */
const ESTENDIDA = new THREE.Vector3(0.07, 0.62, 0.46)
/** Erguida pelo embalo, no alto da pancada. */
const ERGUIDA = new THREE.Vector3(0.08, 0.98, 0.4)
/** Lá embaixo, na frente dos pés: onde a peça é esmagada. */
const NO_CHAO = new THREE.Vector3(0.05, 0.12, 0.5)
const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
/** A cabeça da vítima para na frente da palma, não dentro dela (no tamanho da vítima). */
const CABECA_NA_FRENTE_DA_MAO = 0.13
/** As peças ficam em pé nesta altura do tabuleiro. */
const CHAO = 0.05
/** Deitada, a metade da grossura do corpo (no tamanho da vítima): é o quanto o meio dela fica acima do chão. */
const MEIA_GROSSURA = 0.08
/** Voando, o quanto a peça deita pra frente (a cabeça na frente), e o quanto o embalo leva o corpo pro outro lado. */
const INCLINACAO_NO_VOO = 0.55
const INCLINACAO_NO_EMBALO = -0.2

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
  /** A peça começou a vir (o arrasto). */
  aoPuxar: () => void
  /** A cabeça dela chegou na mão. */
  aoAgarrar: () => void
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
  /** Onde a vítima estava. */
  de: THREE.Vector3
  /** Pra onde a vítima olha quando está de frente pra rainha (o giro em volta do eixo vertical). */
  rumoDaVitima: number
  /** A cabeça da vítima, no espaço dela (tamanho incluído). */
  cabeca: THREE.Vector3
  /** O eixo (no mundo) em volta do qual a vítima se inclina pra rainha. */
  eixoDaInclinacao: THREE.Vector3
  /** Da vítima pra rainha, no chão. */
  rumo: THREE.Vector3
  /** Da mão até onde fica a cabeça da vítima: um pouco à frente da palma, pro lado de onde ela veio. */
  naFrenteDaMao: THREE.Vector3
  brilho: THREE.Sprite
  aneis: { malha: THREE.Mesh; nasce: number }[]
  cor: THREE.Color
  puxou: boolean
  agarrou: boolean
  esmagou: boolean
  /** O braço da rainha já voltou ao clipe (o puxão só segue cuidando da vítima). */
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
  const brilho = spriteDeBrilho(cor, 0.28 * rainha.scale.x, 0)
  cena.add(brilho)
  // a inércia de quem anda não mexe nela: quem cuida do corpo agora é o puxão
  vitima.userData.corpoLargado = true
  puxoes.add({
    rainha,
    vitima,
    cena,
    inicio: agoraDoJogo(),
    ossos: salvarOssos(rainha, OSSOS),
    ossosDaVitima: [],
    de: vitima.position.clone(),
    rumoDaVitima: Math.atan2(rumo.x, rumo.z),
    // em pé e de frente pra rainha, a cabeça fica em cima do centro da peça
    cabeca: new THREE.Vector3(0, cabeca.y, 0),
    eixoDaInclinacao: new THREE.Vector3().crossVectors(CIMA, rumo).normalize(),
    rumo,
    naFrenteDaMao: rumo.clone().multiplyScalar(-CABECA_NA_FRENTE_DA_MAO * vitima.scale.x),
    brilho,
    aneis: [],
    cor: new THREE.Color(cor),
    puxou: false,
    agarrou: false,
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

/** A mão, no espaço da rainha, em cada instante. */
function maoNoInstante(t: number): THREE.Vector3 {
  if (t < PUXA_ATE) return ESTENDIDA.clone()
  // o embalo leva o braço pra cima, perdendo força
  if (t < EMBALO_ATE) return ESTENDIDA.clone().lerp(ERGUIDA, 1 - (1 - fracao(t, PUXA_ATE, EMBALO_ATE)) ** 2)
  // a descida acelera, como quem bate com força
  const u = fracao(t, EMBALO_ATE, ESMAGA_ATE)
  return ERGUIDA.clone().lerp(NO_CHAO, u * u)
}

/** A vítima inclinada `inclinacao` pra rainha (positivo: a cabeça vai na frente) e girada `volta` em torno de si (0 de
 * frente pra rainha, π de costas). Com π/2 e π, deitada de peito pra cima, a cabeça pro lado da rainha. */
function giroDaVitima(p: Puxao, inclinacao: number, volta: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(p.eixoDaInclinacao, inclinacao).multiply(new THREE.Quaternion().setFromAxisAngle(CIMA, p.rumoDaVitima + volta))
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
  delete p.vitima.userData.corpoLargado
  p.brilho.removeFromParent()
  p.brilho.material.dispose()
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

/** O braço da rainha (por cima do clipe) e o brilho na palma; devolve onde está a mão. */
function posarRainha(p: Puxao, t: number, agora: number): THREE.Vector3 {
  const { rainha } = p
  rainha.updateWorldMatrix(true, true)
  // o braço sobe estendido, segura, sobe com o embalo, desce de uma vez e volta ao clipe depois da pancada
  const peso = sobe(t, 0, ESTENDE_ATE) * (1 - sobe(t, ESMAGA_ATE + 80, VOLTA_ATE))
  // o corpo acompanha: um pouco à frente estendendo, pra trás segurando o tranco do embalo, todo à frente na pancada
  const inclinacao = 0.1 * sobe(t, 0, ESTENDE_ATE) - 0.25 * sobe(t, PUXA_ATE, PUXA_ATE + 120) + 0.75 * sobe(t, EMBALO_ATE, ESMAGA_ATE)
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
  return ondeEstaAMao
}

/** Os braços e as pernas da vítima em cada instante (ver realismo.ts). */
function poseDaVitima(t: number): PoseLargada {
  if (t < PUXA_ATE) {
    // o tranco do começo joga tudo pra trás de uma vez, e a velocidade mantém
    const u = fracao(t, PUXA_DE, PUXA_ATE)
    return { pratras: sobe(t, PUXA_DE, PUXA_DE + 130) * (0.8 + 0.2 * u), abertura: 0.15, arco: sobe(t, PUXA_DE, PUXA_DE + 160) }
  }
  if (t < EMBALO_ATE) {
    // a cabeça parou: braços e pernas seguem e passam pra frente
    const s = sobe(t, PUXA_ATE, PUXA_ATE + (EMBALO_ATE - PUXA_ATE) * 0.7)
    return { pratras: 1 - 1.4 * s, abertura: 0.15 + 0.2 * s, arco: 1 - 0.7 * s }
  }
  if (t < ESMAGA_ATE) {
    // descendo de costas, os membros ficam pra cima, atrasados
    const v = fracao(t, EMBALO_ATE, ESMAGA_ATE)
    return { pratras: -0.4 - 0.25 * v, abertura: 0.35 + 0.25 * v, arco: 0.3 }
  }
  // no chão: esparramada
  return { pratras: 0, abertura: 1, arco: 0 }
}

function posar(p: Puxao, t: number, agora: number) {
  const ondeEstaAMao = t < VOLTA_ATE ? posarRainha(p, t, agora) : null
  if (!p.esmagou && ondeEstaAMao && t >= PUXA_DE) moverVitima(p, t, agora, ondeEstaAMao)
  // os braços e as pernas por último, sobre o corpo já no lugar deste quadro
  if (t >= PUXA_DE) corpoLargado(p.vitima, poseDaVitima(t), agora)
}

/** Onde está e como está virada a vítima: voando, presa pela cabeça no embalo, na pancada. */
function moverVitima(p: Puxao, t: number, agora: number, ondeEstaAMao: THREE.Vector3) {
  if (!p.puxou) {
    p.puxou = true
    p.avisos.aoPuxar()
  }
  if (t < PUXA_ATE) {
    // a gravidade: parte devagar e acelera (o caminho cresce com o quadrado do tempo); quanto mais rápido, mais a peça
    // deita pra frente, a cabeça na frente
    const u = fracao(t, PUXA_DE, PUXA_ATE)
    const caminho = u * u
    const giro = giroDaVitima(p, INCLINACAO_NO_VOO * suave(Math.min(1, u * 1.4)), 0)
    p.vitima.quaternion.copy(giro)
    const alvo = ondeEstaAMao.clone().add(p.naFrenteDaMao).sub(p.cabeca.clone().applyQuaternion(giro))
    p.vitima.position.copy(p.de).lerp(alvo, caminho)
    // sobe logo no arranque e vem pelo ar, com o peito na frente
    p.vitima.position.y = Math.max(CHAO, p.de.y + (alvo.y - p.de.y) * (1 - (1 - caminho) ** 3))
    if (p.aneis.length === 0 || agora - p.aneis[p.aneis.length - 1].nasce > 110) novoAnel(p, agora)
    moverAneis(p, agora, ondeEstaAMao)
    return
  }
  if (!p.agarrou) {
    p.agarrou = true
    p.avisos.aoAgarrar()
  }
  moverAneis(p, agora, ondeEstaAMao)
  if (t < EMBALO_ATE) {
    // só a cabeça trava: o corpo continua vindo, passa por baixo dela pro lado da rainha, perdendo força, e gira de
    // costas pra ela
    const s = fracao(t, PUXA_ATE, EMBALO_ATE)
    const embalo = 1 - (1 - s) ** 2
    pendurarPelaCabeca(p, ondeEstaAMao, giroDaVitima(p, INCLINACAO_NO_VOO + (INCLINACAO_NO_EMBALO - INCLINACAO_NO_VOO) * embalo, Math.PI * suave(s)))
    return
  }
  // a pancada: a mão desce de uma vez e a peça tomba pra trás em volta da cabeça, até bater no chão deitada de peito pra
  // cima (a cabeça na mão da rainha, os pés pra longe)
  const queda = fracao(t, EMBALO_ATE, ESMAGA_ATE) ** 2
  const meiaGrossura = MEIA_GROSSURA * p.vitima.scale.y
  const deitadaNoChao = CHAO + meiaGrossura
  const giro = giroDaVitima(p, INCLINACAO_NO_EMBALO + (Math.PI / 2 - INCLINACAO_NO_EMBALO) * queda, Math.PI)
  pendurarPelaCabeca(p, ondeEstaAMao, giro, CHAO + (deitadaNoChao - CHAO) * queda)
  if (t < ESMAGA_ATE) return
  p.esmagou = true
  const deitada = giroDaVitima(p, Math.PI / 2, Math.PI)
  pendurarPelaCabeca(p, ondeEstaAMao, deitada, deitadaNoChao)
  p.vitima.position.y = deitadaNoChao
  // o meio do corpo, no chão
  const meio = p.vitima.position.clone().add(p.cabeca.clone().multiplyScalar(0.5).applyQuaternion(deitada))
  meio.y = 0
  p.avisos.aoEsmagar({ meio, rumo: p.rumo.clone(), comprimento: p.cabeca.y * 1.15, meiaGrossura })
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
    p.rainhaSolta = t >= VOLTA_ATE
    p.ossos = p.rainhaSolta ? [] : salvarOssos(p.rainha, OSSOS)
    p.ossosDaVitima = salvarOssos(p.vitima, OSSOS_DO_CORPO_LARGADO)
    posar(p, t, agora)
  }
}
