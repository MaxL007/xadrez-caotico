import * as THREE from 'three'
import { voltarAoDescanso } from '../animacoes/gestos'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { mostrarEspadaRPG, novaSequenciaRPG } from '../pecas/modelosRPG'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, type PoseLargada } from '../sensacao/realismo'
import { agoraDoJogo, congelar } from '../sensacao/relogioDoJogo'
import { acaso, emDois, linhasDeVelocidade, QUADRO_EM_DOIS } from './efeitosDeAnime'

// O Espiral Absoluto, habilidade do peão (a ideia e a descrição são do usuário, 25/11). Vale com ou sem arma: luta com o
// corpo, como a Dempsey Roll.
//
//  1. A base: o peão firma o pé esquerdo, recolhe o joelho direito e o pé acende (o "tiin").
//  2. O chute pra cima no queixo: a vítima sobe bem alto, girando pra trás até ficar deitada no ar, de barriga pra cima.
//  3. O salto: o peão agacha e pula atrás dela, sobe junto e a agarra pelos ombros, ajoelhado em cima dela.
//  4. O "ma": os dois parados um instante lá no alto.
//  5. A espiral: os dois caem girando juntos, cada vez mais rápido, num caminho em espiral que fecha em cima da casa.
//  6. Bem perto do chão o peão se solta e cai meio agachado: os pés no chão, uma mão no chão e a outra no ar. A vítima
//     bate no chão de costas (a cratera, como no Puxão).
//
// Os ossos das duas peças vão por cima do clipe, como na Dempsey Roll: desfeitos antes dos clipes e refeitos depois. Os
// instantes andam no relógio do jogo: no congelamento do impacto, tudo fica parado.

/** Os instantes, em ms desde o começo. */
const BASE_ATE = 200
const CARREGA_ATE = 330
const CHUTE_ACERTA = 420
const CHUTE_SEGUE_ATE = 520
/** A vítima no ponto mais alto. */
const SOBE_ATE = 1150
/** O peão agacha depois do chute e pula. */
const AGACHA_ATE = 600
/** O peão alcança a vítima e a agarra. */
const AGARRA = 1050
/** O "ma" lá no alto, os dois parados. */
const APICE_ATE = 1350
/** A espiral: os dois caindo e girando. No fim dela o peão solta. */
const ESPIRAL_ATE = 2150
const VOLTAS = 3
/** A vítima bate no chão; o peão pousa logo depois. */
const COLIDE = 2220
const POUSO = 2290
/** O peão fica na pose da queda (o zanshin) e depois se levanta. */
const FICA_ATE = 2900
const FIM = 3300
/** O tranco da pegada: o tempo para um instante. */
const TRANCO_MS = 60

/** O centro do corpo da vítima no ponto mais alto, acima do chão (no tamanho dela): "bem alto". */
const ALTURA_DO_APICE = 3.1
/** Na hora de soltar, o centro do corpo da vítima a esta altura do chão (no tamanho dela). */
const ALTURA_DE_SOLTAR = 0.45
/** O raio da espiral no começo da queda (no tamanho da vítima): fecha até zero em cima da casa. */
const RAIO_DA_ESPIRAL = 0.55
/** As peças ficam em pé nesta altura do tabuleiro. */
const CHAO = 0.05
/** Deitada, a metade da grossura do corpo (no tamanho da vítima). */
const MEIA_GROSSURA = 0.08
/** Onde o peão pousa, da casa da vítima pro lado de onde ele veio (no tamanho dele). */
const POUSO_ANTES_DA_CASA = 0.5

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']

const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
const FRENTE = new THREE.Vector3(0, 0, 1)

/** No espaço do peão (ele olha pra +z, a esquerda em +x), no tamanho dele. */
const PE_ESQUERDO_NA_BASE = new THREE.Vector3(0.06, 0, 0.05)
const JOELHO_RECOLHIDO = new THREE.Vector3(-0.04, 0.24, 0.1)
const MAOS_DO_EQUILIBRIO = { esquerda: new THREE.Vector3(0.26, 0.55, -0.04), direita: new THREE.Vector3(-0.22, 0.62, 0.06) }
const MAOS_PRA_CIMA = { esquerda: new THREE.Vector3(0.08, 0.95, 0.14), direita: new THREE.Vector3(-0.08, 0.95, 0.14) }
/** A queda meio agachada: a mão direita no chão, à frente, a esquerda no ar, pra trás e pro alto. */
const MAO_NO_CHAO = new THREE.Vector3(-0.13, 0, 0.2)
const MAO_NO_AR = new THREE.Vector3(0.24, 0.82, -0.08)
const PES_DA_QUEDA = { Left: new THREE.Vector3(0.1, 0, -0.04), Right: new THREE.Vector3(-0.09, 0, 0.1) }

/** No espaço da vítima (deitada, a frente dela aponta pro alto), sem o tamanho: onde o peão segura e se ajoelha. */
const OMBROS_DA_VITIMA = { esquerdo: new THREE.Vector3(0.08, 0.56, 0.06), direito: new THREE.Vector3(-0.08, 0.56, 0.06) }
const CINTURA_DA_VITIMA = { esquerda: new THREE.Vector3(0.11, 0.32, 0.02), direita: new THREE.Vector3(-0.11, 0.32, 0.02) }

/** A peça no chão, pro que vem depois (as rachaduras e a cratera), como no Puxão. */
export interface ColisaoDoEspiral {
  /** O meio do corpo, na altura do chão. */
  meio: THREE.Vector3
  /** Pra onde a cabeça aponta, no chão (dos pés pra cabeça). */
  rumo: THREE.Vector3
  /** Dos pés ao alto da cabeça. */
  comprimento: number
  /** A metade da grossura do corpo, deitado. */
  meiaGrossura: number
}

interface AvisosDoEspiral {
  /** O joelho recolhido: o pé acende (o brilho de anime). */
  aoBrilhar: (pe: THREE.Vector3) => void
  /** O chute acertou o queixo: `direcao` é pra onde a vítima vai (pra cima e pra longe). */
  aoChutar: (queixo: THREE.Vector3, direcao: THREE.Vector3) => void
  /** O peão saiu do chão. */
  aoSaltar: (pes: THREE.Vector3) => void
  /** O peão agarrou a vítima no ar. */
  aoAgarrar: (ponto: THREE.Vector3) => void
  /** A espiral começou a descer. */
  aoComecarAEspiral: (ponto: THREE.Vector3) => void
  /** Cada meia volta da espiral. */
  aoGirar: (volta: number) => void
  /** A cada quadro da espiral: por onde passam os pés da vítima (o rastro de luz da espiral). */
  aoRastro: (ponto: THREE.Vector3) => void
  /** O peão soltou a vítima. */
  aoSoltar: () => void
  /** A vítima bateu no chão de costas: daqui em diante a altura e o tamanho dela são de quem chamou (a cratera). */
  aoColidir: (colisao: ColisaoDoEspiral) => void
  /** O peão pousou, meio agachado. */
  aoPousar: (onde: THREE.Vector3) => void
}

interface PeNoChao {
  lado: 'Left' | 'Right'
  base: THREE.Vector3
}

interface Espiral {
  peca: THREE.Object3D
  vitima: THREE.Object3D
  cena: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  ossosDaVitima: OssoSalvo[]
  /** O peão antes do golpe: onde estava, o tamanho, o giro e os eixos no mundo (a esquerda e a frente). */
  base: THREE.Vector3
  escala: number
  giroDoPeao: number
  xq: THREE.Vector3
  zq: THREE.Vector3
  pes: PeNoChao[]
  /** O queixo da vítima, no espaço do peão. */
  queixo: THREE.Vector3
  /** A vítima: onde estava (os pés), o giro de frente pro peão, o tamanho e a altura do corpo. */
  vitimaBase: THREE.Vector3
  deFrente: THREE.Quaternion
  vitimaEscala: number
  /** Do pé ao meio do corpo, e do pé ao alto da cabeça. */
  meio: number
  comprimento: number
  /** Do peão pra vítima, no chão, e o eixo em volta do qual ela gira pra trás com o chute. */
  rumo: THREE.Vector3
  eixoDoChute: THREE.Vector3
  /** Onde o peão pousa, e o giro dele lá (de frente pra cratera). */
  pouso: THREE.Vector3
  giroDoPouso: number
  /** Onde o peão estava na hora de soltar (o pulo pro chão sai dali), e o giro dele. */
  soltouEm: THREE.Vector3 | null
  giroAoSoltar: number
  /** O último giro da espiral (a vítima cai do jeito que estava). */
  ultimoGiro: number
  ultimo: { ponto: THREE.Vector3; t: number } | null
  meiasVoltas: number
  marcos: Set<string>
  colidiu: boolean
  continua: () => boolean
  avisos: AvisosDoEspiral
}

const espirais = new Set<Espiral>()

const suave = (t: number) => t * t * (3 - 2 * t)
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const fracao = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))

/** A altura da peça (dos pés ao alto da cabeça), pelo osso da cabeça no modelo RPG. */
function alturaDaPeca(peca: THREE.Object3D): number {
  const cabeca = ossoRPG(peca, 'Head')
  if (!cabeca) return 0.85 * peca.scale.y
  return (cabeca.getWorldPosition(new THREE.Vector3()).y - peca.getWorldPosition(new THREE.Vector3()).y) * 1.15
}

/** Começa o Espiral Absoluto, com o peão já virado pra vítima e perto dela. */
export function espiralAbsoluto(peca: THREE.Object3D, vitima: THREE.Object3D, cena: THREE.Object3D, continua: () => boolean, avisos: AvisosDoEspiral) {
  peca.updateWorldMatrix(true, true)
  voltarAoDescanso(vitima)
  novaSequenciaRPG(vitima)
  mostrarEspadaRPG(vitima, false)
  const rumo = new THREE.Vector3(vitima.position.x - peca.position.x, 0, vitima.position.z - peca.position.z)
  if (rumo.lengthSq() < 1e-8) rumo.set(0, 0, 1)
  rumo.normalize()
  // a vítima de frente pro peão
  vitima.rotation.set(0, Math.atan2(-rumo.x, -rumo.z), 0)
  vitima.updateWorldMatrix(true, true)
  const cabeca = ossoRPG(vitima, 'Head')
  const cabecaNoMundo = cabeca ? cabeca.getWorldPosition(new THREE.Vector3()) : vitima.localToWorld(new THREE.Vector3(0, 0.7, 0))
  const local = peca.worldToLocal(cabecaNoMundo.clone())
  const comprimento = alturaDaPeca(vitima)
  const escala = peca.scale.x
  const pouso = vitima.position.clone().addScaledVector(rumo, -POUSO_ANTES_DA_CASA * escala)
  pouso.y = peca.position.y
  peca.userData.poseDeHabilidade = true
  vitima.userData.poseDeHabilidade = true
  espirais.add({
    peca,
    vitima,
    cena,
    inicio: agoraDoJogo(),
    ossos: [],
    ossosDaVitima: [],
    base: peca.position.clone(),
    escala,
    giroDoPeao: peca.rotation.y,
    xq: LADO.clone().transformDirection(peca.matrixWorld),
    zq: FRENTE.clone().transformDirection(peca.matrixWorld),
    pes: (['Left', 'Right'] as const).flatMap((lado) => {
      const pe = ossoRPG(peca, `${lado}Foot`)
      return pe ? [{ lado, base: pe.getWorldPosition(new THREE.Vector3()) }] : []
    }),
    // o queixo, um pouco abaixo do meio da cabeça
    queixo: new THREE.Vector3(0, local.y - 0.05, Math.max(local.z - 0.06, 0.2)),
    vitimaBase: vitima.position.clone(),
    deFrente: vitima.quaternion.clone(),
    vitimaEscala: vitima.scale.x,
    meio: comprimento * 0.45,
    comprimento,
    rumo,
    eixoDoChute: new THREE.Vector3().crossVectors(CIMA, rumo).normalize(),
    pouso,
    giroDoPouso: Math.atan2(rumo.x, rumo.z),
    soltouEm: null,
    giroAoSoltar: 0,
    ultimoGiro: 0,
    ultimo: null,
    meiasVoltas: 0,
    marcos: new Set(),
    colidiu: false,
    continua,
    avisos,
  })
}

/** Uma vez só, no primeiro quadro depois de `quando`. */
function primeiraVez(e: Espiral, marco: string, t: number, quando: number): boolean {
  if (t < quando || e.marcos.has(marco)) return false
  e.marcos.add(marco)
  return true
}

/** Inclina ou torce o tronco (metade em cada osso da coluna) em volta de um eixo da peça. */
function girarTronco(peca: THREE.Object3D, eixoNaPeca: THREE.Vector3, angulo: number) {
  if (Math.abs(angulo) < 1e-4) return
  const giro = new THREE.Quaternion().setFromAxisAngle(eixoNaPeca.clone().transformDirection(peca.matrixWorld), angulo / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(peca, nome)
    if (osso) girarOssoNoMundo(osso, giro)
  }
}

/** Um ponto no espaço do peão de antes do golpe (no tamanho dele), no mundo. */
function daBase(e: Espiral, local: THREE.Vector3): THREE.Vector3 {
  return e.base.clone().addScaledVector(e.xq, local.x * e.escala).addScaledVector(CIMA, local.y * e.escala).addScaledVector(e.zq, local.z * e.escala)
}

// --- a vítima ---------------------------------------------------------------------------------------------------------

/** A vítima girada pra trás `tomba` (0 em pé, π/2 deitada de barriga pra cima) e girada `giro` em volta do alto. */
function giroDaVitima(e: Espiral, tomba: number, giro: number): THREE.Quaternion {
  return new THREE.Quaternion()
    .setFromAxisAngle(CIMA, giro)
    .multiply(new THREE.Quaternion().setFromAxisAngle(e.eixoDoChute, tomba))
    .multiply(e.deFrente)
}

/** Põe a vítima com o meio do corpo em `centro`, girada `quaternion`. */
function colocarVitima(e: Espiral, centro: THREE.Vector3, quaternion: THREE.Quaternion) {
  e.vitima.quaternion.copy(quaternion)
  const doPeAoMeio = new THREE.Vector3(0, e.meio, 0).applyQuaternion(quaternion)
  e.vitima.position.copy(centro).sub(doPeAoMeio)
  e.vitima.updateWorldMatrix(true, true)
}

const centroEmPe = (e: Espiral) => e.vitimaBase.clone().addScaledVector(CIMA, e.meio)
const alturaDoApice = (e: Espiral) => CHAO + ALTURA_DO_APICE * e.vitimaEscala
const alturaDeSoltar = (e: Espiral) => CHAO + ALTURA_DE_SOLTAR * e.vitimaEscala

/** O ângulo da espiral na fração `s` da queda: começa devagar e acelera. */
const anguloDaEspiral = (s: number) => VOLTAS * Math.PI * 2 * (0.3 * s + 0.7 * s * s)

/** Onde está o meio do corpo da vítima na espiral (fração `s` da queda), e o giro dela. */
function naEspiral(e: Espiral, s: number): { centro: THREE.Vector3; giro: number } {
  const angulo = anguloDaEspiral(s)
  const raio = RAIO_DA_ESPIRAL * e.vitimaEscala * (1 - s)
  // a queda pesa: começa devagar e acelera, como quem cai
  const altura = alturaDoApice(e) + (alturaDeSoltar(e) - alturaDoApice(e)) * s * s
  // o caminho em espiral sai de cima da casa e fecha de volta nela
  const deLado = new THREE.Vector3(Math.cos(angulo) - 1, 0, Math.sin(angulo)).multiplyScalar(raio)
  return { centro: e.vitimaBase.clone().add(deLado).setY(altura), giro: angulo }
}

/** A vítima em cada instante: com medo do chute, subindo, no alto, na espiral e caindo. Devolve se ainda é dela. */
function moverVitima(e: Espiral, t: number) {
  if (t < CHUTE_ACERTA) {
    // vê o joelho subindo: se inclina pra trás, encolhida
    const medo = sobe(t, BASE_ATE * 0.5, CHUTE_ACERTA)
    colocarVitima(e, centroEmPe(e), giroDaVitima(e, -0.18 * medo, 0))
    return
  }
  if (t < APICE_ATE) {
    // o chute no queixo: sobe bem alto freando (sai de uma vez), girando pra trás até ficar deitada de barriga pra cima,
    // e um pouco pra longe do peão
    const u = fracao(t, CHUTE_ACERTA, SOBE_ATE)
    const subida = 1 - (1 - u) ** 2.2
    const centro = centroEmPe(e).addScaledVector(e.rumo, 0.12 * e.vitimaEscala * Math.sin(Math.PI * u))
    centro.y += (alturaDoApice(e) - centro.y) * subida
    // no alto, parada, mas viva: treme de desenho em desenho
    if (t >= SOBE_ATE) {
      const desenho = Math.floor((t - SOBE_ATE) / QUADRO_EM_DOIS)
      centro.add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 3) - 0.5, acaso(desenho + 9) - 0.5).multiplyScalar(0.012 * e.vitimaEscala))
    }
    colocarVitima(e, centro, giroDaVitima(e, (Math.PI / 2) * (1 - (1 - u) ** 1.6), 0))
    return
  }
  if (t < ESPIRAL_ATE) {
    const { centro, giro } = naEspiral(e, fracao(t, APICE_ATE, ESPIRAL_ATE))
    e.ultimoGiro = giro
    colocarVitima(e, centro, giroDaVitima(e, Math.PI / 2, giro))
    return
  }
  // solta: cai do que falta de uma vez, deitada, de costas
  const v = fracao(t, ESPIRAL_ATE, COLIDE)
  const deitada = CHAO + MEIA_GROSSURA * e.vitimaEscala
  const centro = e.vitimaBase.clone().setY(alturaDeSoltar(e) + (deitada - alturaDeSoltar(e)) * v * v)
  colocarVitima(e, centro, giroDaVitima(e, Math.PI / 2, e.ultimoGiro))
}

/** Os braços e as pernas da vítima em cada instante (ver realismo.ts). */
function poseDaVitima(t: number): PoseLargada {
  if (t < CHUTE_ACERTA) {
    const medo = sobe(t, BASE_ATE * 0.5, CHUTE_ACERTA)
    return { pratras: -0.35 * medo, abertura: 0.2 * medo, arco: -0.2 * medo }
  }
  // subindo: o tranco joga os membros pra baixo, atrasados; no alto, soltos e abertos
  if (t < SOBE_ATE) return { pratras: 0.85, abertura: 0.3, arco: 0.7 }
  if (t < APICE_ATE) return { pratras: 0.2, abertura: 0.55, arco: 0.2 }
  // na espiral: os membros abertos pra fora, jogados pelo giro
  if (t < ESPIRAL_ATE) return { pratras: -0.3, abertura: 0.9, arco: 0, deLado: -0.6 }
  if (t < COLIDE) return { pratras: -0.6, abertura: 0.6, arco: 0.2 }
  return { pratras: 0, abertura: 1, arco: 0 }
}

// --- o peão ------------------------------------------------------------------------------------------------------------

/** O peão ajoelhado em cima da vítima (deitada no ar), segurando pelos ombros. `peso` 0 deixa os membros no clipe. */
function ajoelharEmCima(e: Espiral, peso: number, giro: number) {
  const { peca, vitima } = e
  // os pés do peão um pouco acima do peito dela, e ele de frente pra cabeça dela
  const peito = vitima.localToWorld(new THREE.Vector3(0, 0.42, 0))
  peca.position.copy(peito).addScaledVector(CIMA, 0.14 * e.escala)
  peca.rotation.set(0, giro, 0)
  peca.updateWorldMatrix(true, true)
  girarTronco(peca, LADO, 0.55 * peso)
  levarPernaAte(peca, 'Left', vitima.localToWorld(CINTURA_DA_VITIMA.esquerda.clone()), peso)
  levarPernaAte(peca, 'Right', vitima.localToWorld(CINTURA_DA_VITIMA.direita.clone()), peso)
  levarBracoAte(peca, 'Left', vitima.localToWorld(OMBROS_DA_VITIMA.esquerdo.clone()), peso)
  levarBracoAte(peca, 'Right', vitima.localToWorld(OMBROS_DA_VITIMA.direito.clone()), peso)
}

/** O giro do peão em cima da vítima: olhando pra cabeça dela, que no alto aponta pra longe dele. */
const giroEmCima = (e: Espiral, giroDaEspiral: number) => e.giroDoPouso + giroDaEspiral

/** O giro mais perto de `alvo` partindo de `de` (sem dar a volta inteira). */
function pertoDe(de: number, alvo: number): number {
  let a = alvo
  while (a - de > Math.PI) a -= Math.PI * 2
  while (a - de < -Math.PI) a += Math.PI * 2
  return a
}

function posarPeao(e: Espiral, t: number, agora: number) {
  const { peca } = e
  if (t < AGACHA_ATE) {
    // a base, o joelho recolhido (tremendo, carregando), o chute pra cima no queixo e a perna que segue subindo
    const peso = sobe(t, 0, BASE_ATE * 0.6)
    let pe = daBase(e, JOELHO_RECOLHIDO).lerp(daBase(e, PE_ESQUERDO_NA_BASE.clone().setX(-0.06)), 1 - sobe(t, 0, BASE_ATE))
    let inclina = 0
    if (t >= BASE_ATE && t < CARREGA_ATE) {
      const desenho = Math.floor((t - BASE_ATE) / QUADRO_EM_DOIS)
      pe = daBase(e, JOELHO_RECOLHIDO).add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 4) - 0.5, 0).multiplyScalar(0.015 * e.escala))
      inclina = -0.1
    } else if (t >= CARREGA_ATE) {
      // a perna sai de uma vez até o queixo e passa dele; o tronco vai pra trás pra ela alcançar
      const solta = fracao(t, CARREGA_ATE, CHUTE_ACERTA) ** 2
      const segue = sobe(t, CHUTE_ACERTA, CHUTE_SEGUE_ATE)
      const desce = sobe(t, CHUTE_SEGUE_ATE, AGACHA_ATE)
      const queixo = daBase(e, e.queixo)
      const passou = queixo.clone().addScaledVector(CIMA, 0.12 * e.escala).addScaledVector(e.zq, -0.03 * e.escala)
      pe = daBase(e, JOELHO_RECOLHIDO).lerp(queixo, solta).lerp(passou, segue).lerp(daBase(e, new THREE.Vector3(-0.06, 0, 0.08)), desce)
      inclina = -0.1 - 0.45 * solta * (1 - desce)
    }
    // o agachar antes do salto
    const agacha = 0.1 * sobe(t, CHUTE_SEGUE_ATE, AGACHA_ATE)
    peca.position.copy(e.base).addScaledVector(CIMA, -agacha * e.escala)
    peca.rotation.set(0, e.giroDoPeao, 0)
    peca.updateWorldMatrix(true, true)
    const esquerdo = e.pes.find((p) => p.lado === 'Left')
    if (esquerdo) levarPernaAte(peca, 'Left', esquerdo.base, peso)
    levarPernaAte(peca, 'Right', pe, peso)
    girarTronco(peca, LADO, (inclina + 0.25 * agacha / 0.1) * peso)
    levarBracoAte(peca, 'Left', daBase(e, MAOS_DO_EQUILIBRIO.esquerda), peso)
    levarBracoAte(peca, 'Right', daBase(e, MAOS_DO_EQUILIBRIO.direita), peso)
    return
  }
  if (t < AGARRA) {
    // o salto: do chão até em cima da vítima, num arco, os joelhos encolhidos e as mãos esticadas pra cima
    const u = fracao(t, AGACHA_ATE, AGARRA)
    const sai = 1 - (1 - u) ** 2
    const peito = e.vitima.localToWorld(new THREE.Vector3(0, 0.42, 0)).addScaledVector(CIMA, 0.14 * e.escala)
    peca.position.copy(e.base).lerp(peito, sai).addScaledVector(CIMA, 0.25 * e.escala * Math.sin(Math.PI * u))
    peca.rotation.set(0, e.giroDoPeao + (pertoDe(e.giroDoPeao, giroEmCima(e, 0)) - e.giroDoPeao) * sobe(u, 0.5, 1), 0)
    peca.updateWorldMatrix(true, true)
    const encolhe = Math.sin(Math.PI * Math.min(1, u * 1.2))
    levarPernaAte(peca, 'Left', peca.localToWorld(new THREE.Vector3(0.06, 0.14, 0.1)), encolhe)
    levarPernaAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.06, 0.12, 0.12)), encolhe)
    levarBracoAte(peca, 'Left', peca.localToWorld(MAOS_PRA_CIMA.esquerda.clone()), 1)
    levarBracoAte(peca, 'Right', peca.localToWorld(MAOS_PRA_CIMA.direita.clone()), 1)
    // chegando, já se ajoelha em cima dela
    if (u > 0.8) ajoelharEmCima(e, sobe(u, 0.8, 1), pertoDe(peca.rotation.y, giroEmCima(e, 0)))
    return
  }
  if (t < ESPIRAL_ATE) {
    ajoelharEmCima(e, 1, giroEmCima(e, t < APICE_ATE ? 0 : e.ultimoGiro))
    return
  }
  if (!e.soltouEm) {
    e.soltouEm = peca.position.clone()
    e.giroAoSoltar = peca.rotation.y
  }
  if (t < POUSO) {
    // solta e cai pro lado, de pé, girando pra ficar de frente pra cratera
    const u = fracao(t, ESPIRAL_ATE, POUSO)
    peca.position.copy(e.soltouEm).lerp(e.pouso, u).addScaledVector(CIMA, 0.08 * e.escala * Math.sin(Math.PI * u))
    peca.position.y = Math.max(e.pouso.y, peca.position.y)
    peca.rotation.set(0, e.giroAoSoltar + (pertoDe(e.giroAoSoltar, e.giroDoPouso) - e.giroAoSoltar) * suave(u), 0)
    peca.updateWorldMatrix(true, true)
    levarPernaAte(peca, 'Left', peca.localToWorld(new THREE.Vector3(0.08, 0.06, 0)), 1 - u)
    levarPernaAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.08, 0.06, 0.04)), 1 - u)
    levarBracoAte(peca, 'Left', peca.localToWorld(MAO_NO_AR.clone()), 1)
    levarBracoAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.2, 0.4, 0.12)), 1)
    return
  }
  // a queda meio agachada: os pés no chão, a mão direita no chão e a esquerda no ar; parada, tremendo em dois, e
  // depois se levanta devagar
  const peso = 1 - sobe(t, FICA_ATE, FIM)
  const assenta = Math.exp(-(t - POUSO) / 60) * Math.sin((t - POUSO) / 25)
  const agacha = (0.2 + 0.03 * assenta) * peso
  peca.position.copy(e.pouso).addScaledVector(CIMA, -agacha * e.escala)
  peca.rotation.set(0, e.giroDoPouso, 0)
  peca.updateWorldMatrix(true, true)
  const doPouso = (local: THREE.Vector3) => {
    const p = e.pouso.clone().add(new THREE.Vector3(local.x, 0, local.z).multiplyScalar(e.escala).applyAxisAngle(CIMA, e.giroDoPouso))
    p.y = local.y > 0 ? e.pouso.y + local.y * e.escala : CHAO + 0.02 * e.escala
    return p
  }
  for (const lado of ['Left', 'Right'] as const) levarPernaAte(peca, lado, doPouso(PES_DA_QUEDA[lado]).setY(e.pes.find((p) => p.lado === lado)?.base.y ?? e.pouso.y), peso)
  girarTronco(peca, LADO, 0.45 * peso)
  girarTronco(peca, CIMA, -0.2 * peso)
  const mao = doPouso(MAO_NO_CHAO)
  const noAr = peca.localToWorld(MAO_NO_AR.clone())
  if (t < FICA_ATE) {
    const desenho = Math.floor(emDois(agora) / QUADRO_EM_DOIS)
    noAr.add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 2) - 0.5, 0).multiplyScalar(0.01 * e.escala))
  }
  levarBracoAte(peca, 'Right', mao, peso)
  levarBracoAte(peca, 'Left', noAr, peso)
}

// --- os avisos ---------------------------------------------------------------------------------------------------------

function avisar(e: Espiral, t: number) {
  if (primeiraVez(e, 'brilho', t, BASE_ATE)) {
    const pe = ossoRPG(e.peca, 'RightFoot')
    e.avisos.aoBrilhar(pe ? pe.getWorldPosition(new THREE.Vector3()) : daBase(e, JOELHO_RECOLHIDO))
  }
  if (primeiraVez(e, 'chute', t, CHUTE_ACERTA)) {
    const queixo = e.vitimaBase.clone().addScaledVector(CIMA, e.comprimento * 0.78).addScaledVector(e.rumo, -0.06 * e.vitimaEscala)
    e.avisos.aoChutar(queixo, e.rumo.clone().multiplyScalar(0.25).add(CIMA).normalize())
  }
  if (primeiraVez(e, 'salto', t, AGACHA_ATE)) e.avisos.aoSaltar(e.base.clone())
  if (primeiraVez(e, 'pegada', t, AGARRA)) {
    congelar(TRANCO_MS)
    e.avisos.aoAgarrar(e.vitima.localToWorld(new THREE.Vector3(0, 0.56, 0.06)))
  }
  if (primeiraVez(e, 'espiral', t, APICE_ATE)) e.avisos.aoComecarAEspiral(e.vitima.localToWorld(new THREE.Vector3(0, e.meio / e.vitimaEscala, 0)))
  if (t >= APICE_ATE && t < ESPIRAL_ATE) {
    const meias = Math.floor(anguloDaEspiral(fracao(t, APICE_ATE, ESPIRAL_ATE)) / Math.PI)
    if (meias > e.meiasVoltas) {
      e.meiasVoltas = meias
      e.avisos.aoGirar(meias)
    }
    // um ponto por quadro, nos pés dela: o rastro desenha a espiral sem pesar no celular fraco
    e.avisos.aoRastro(e.vitima.localToWorld(new THREE.Vector3(0, 0.05, 0)))
  }
  if (primeiraVez(e, 'solta', t, ESPIRAL_ATE)) e.avisos.aoSoltar()
  if (primeiraVez(e, 'pouso', t, POUSO)) e.avisos.aoPousar(e.pouso.clone().setY(0))
}

/** As linhas de velocidade em volta do meio do corpo da vítima, no rumo em que ela anda. */
function linhasDoCorpo(e: Espiral, t: number, cor: THREE.ColorRepresentation) {
  const meio = e.vitima.localToWorld(new THREE.Vector3(0, e.meio / e.vitimaEscala, 0))
  if (e.ultimo && t > e.ultimo.t) {
    const velocidade = meio.clone().sub(e.ultimo.ponto).multiplyScalar(1000 / (t - e.ultimo.t))
    if (velocidade.length() > 1.5) linhasDeVelocidade(e.cena, meio, velocidade, e.comprimento * 0.3, cor, 2)
  }
  e.ultimo = { ponto: meio, t }
}

function colidir(e: Espiral) {
  e.colidiu = true
  const deitada = CHAO + MEIA_GROSSURA * e.vitimaEscala
  colocarVitima(e, e.vitimaBase.clone().setY(deitada), giroDaVitima(e, Math.PI / 2, e.ultimoGiro))
  // pra onde a cabeça aponta, no chão (o alto da peça deitada)
  const rumo = CIMA.clone().applyQuaternion(e.vitima.quaternion).setY(0)
  if (rumo.lengthSq() < 1e-6) rumo.copy(e.rumo)
  rumo.normalize()
  const meio = e.vitimaBase.clone().setY(0)
  delete e.vitima.userData.poseDeHabilidade
  e.avisos.aoColidir({ meio, rumo, comprimento: e.comprimento, meiaGrossura: MEIA_GROSSURA * e.vitimaEscala })
}

function encerrar(e: Espiral) {
  espirais.delete(e)
  // o peão fica onde pousou (dali o lance o leva pra casa), em pé
  e.peca.position.copy(t0(e) >= POUSO ? e.pouso : e.base)
  delete e.peca.userData.poseDeHabilidade
  if (!e.colidiu) delete e.vitima.userData.poseDeHabilidade
}

/** Quanto do golpe já passou. */
const t0 = (e: Espiral) => agoraDoJogo() - e.inicio

/** A peça no meio de um Espiral Absoluto: nessa hora não começa um gesto. */
export function estaNoEspiral(peca: THREE.Object3D): boolean {
  for (const e of espirais) if (e.peca === peca) return true
  return false
}

/** Antes dos clipes, a cada quadro: tira as poses. */
export function desfazerPosesDosEspirais() {
  for (const e of espirais) {
    restaurarOssos(e.ossosDaVitima)
    restaurarOssos(e.ossos)
  }
}

/** Depois dos clipes, a cada quadro (no relógio do jogo). */
export function atualizarEspirais(agora: number) {
  for (const e of [...espirais]) {
    const t = agora - e.inicio
    // depois da pancada, ainda mantém a vítima esparramada até ela sumir no chão
    const vitimaNoChao = e.colidiu && e.vitima.parent !== null && e.vitima.visible
    if (!e.continua() || !e.peca.parent || (t >= FIM && !vitimaNoChao)) {
      encerrar(e)
      continue
    }
    e.ossos = t >= FIM ? [] : salvarOssos(e.peca, OSSOS)
    e.ossosDaVitima = e.vitima.parent ? salvarOssos(e.vitima, OSSOS_DO_CORPO_LARGADO) : []
    if (!e.colidiu) moverVitima(e, t)
    avisar(e, t)
    if (!e.colidiu && t >= COLIDE) colidir(e)
    if (t < FIM) posarPeao(e, t, agora)
    else {
      e.peca.position.copy(e.pouso)
      delete e.peca.userData.poseDeHabilidade
    }
    if (!e.colidiu && t >= CHUTE_ACERTA) linhasDoCorpo(e, t, 0xffffff)
    if (e.vitima.parent && e.vitima.visible) corpoLargado(e.vitima, poseDaVitima(t), t >= SOBE_ATE && t < APICE_ATE ? emDois(agora) : agora)
  }
}
