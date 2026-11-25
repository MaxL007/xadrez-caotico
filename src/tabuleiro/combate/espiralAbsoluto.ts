import * as THREE from 'three'
import { voltarAoDescanso } from '../animacoes/gestos'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { mostrarEspadaRPG, novaSequenciaRPG } from '../pecas/modelosRPG'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, type PoseLargada } from '../sensacao/realismo'
import { agoraDoJogo, congelar } from '../sensacao/relogioDoJogo'
import { acaso, emDois, linhasDeVelocidade, QUADRO_EM_DOIS } from './efeitosDeAnime'

// O Espiral Absoluto, habilidade do peão (a ideia, a descrição e um vídeo de referência são do usuário, 25/11). Vale com
// ou sem arma: luta com o corpo, como a Dempsey Roll. Segue a mecânica do vídeo (o chute que joga pro alto, a pegada
// por trás no ar, os dois de cabeça pra baixo caindo como uma broca), com mudanças pedidas pelo usuário pra não ficar
// igual: fitas de luz na cor da facção no lugar das faixas, o rastro de luz do peão subindo, a broca descendo num
// caminho em espiral, a vítima que fica fincada e tomba de costas na cratera, e o mortal pra trás antes da queda.
//
//  1. A base: o peão firma o pé esquerdo, recolhe o joelho direito e o pé acende (o "tiin").
//  2. O chute pra cima no queixo: a vítima sobe bem alto, a cabeça jogada pra trás.
//  3. O salto: o peão agacha e sobe atrás dela deixando um rastro de luz, e a abraça pelas costas.
//  4. No alto, os dois viram de cabeça pra baixo e as fitas de luz enrolam a vítima inteira (os braços presos no corpo).
//  5. A broca: os dois caem girando cada vez mais rápido, num caminho em espiral que fecha em cima da casa.
//  6. Bem perto do chão o peão solta, dá um mortal pra trás e cai meio agachado: os pés no chão, uma mão no chão e a
//     outra no ar. A vítima bate de cabeça no chão, fica fincada um instante, tomba de costas e o chão cede (a cratera,
//     como no Puxão).
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
/** O peão alcança as costas da vítima e a abraça. */
const AGARRA = 1000
/** Os dois viram de cabeça pra baixo; as fitas enrolam a vítima. */
const VIRA_ATE = 1250
const ENROLA_DE = 1080
const ENROLA_ATE = 1400
/** O "ma" lá no alto, de cabeça pra baixo, antes da broca. */
const APICE_ATE = 1450
/** A broca: os dois caindo e girando. No fim dela o peão solta. */
const ESPIRAL_ATE = 2250
const VOLTAS = 3
/** Quantas vezes a broca gira em volta dela mesma a cada volta da espiral. */
const GIROS_DA_BROCA = 2
/** A cabeça da vítima bate no chão; fica fincada um instante e tomba de costas. */
const COLIDE = 2310
const FINCADA_ATE = 2560
const DEITA = 2720
/** O peão: o mortal pra trás e a queda meio agachada. */
const POUSO = 2560
/** O peão fica na pose da queda (o zanshin) e depois se levanta. */
const FICA_ATE = 3150
const FIM = 3550
/** O tranco da pegada: o tempo para um instante. */
const TRANCO_MS = 60

/** O centro do corpo da vítima no ponto mais alto, acima do chão (no tamanho dela): "bem alto". */
const ALTURA_DO_APICE = 3.1
/** Na hora de soltar, a cabeça da vítima a esta altura do chão (no tamanho dela). */
const CABECA_AO_SOLTAR = 0.35
/** O raio da espiral no começo da queda (no tamanho da vítima): fecha até zero em cima da casa. */
const RAIO_DA_ESPIRAL = 0.55
/** O quanto a vítima vai pra trás com o chute, no ar, antes de virar de cabeça pra baixo. */
const TOMBA_NO_CHUTE = 0.55
/** As peças ficam em pé nesta altura do tabuleiro. */
const CHAO = 0.05
/** Deitada, a metade da grossura do corpo (no tamanho da vítima). */
const MEIA_GROSSURA = 0.08
/** Onde o peão pousa, da casa da vítima pro lado de onde ele veio (no tamanho dele). */
const POUSO_ANTES_DA_CASA = 0.6

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

/** No espaço da vítima (sem o tamanho): o peão abraçado nas costas dela, os pés dele na altura dos dela. */
const NAS_COSTAS = new THREE.Vector3(0, 0.02, -0.15)
/** As mãos dele cruzadas no peito dela, e as pernas dele presas nas dela. */
const MAOS_NO_PEITO = { esquerda: new THREE.Vector3(-0.05, 0.5, 0.08), direita: new THREE.Vector3(0.05, 0.47, 0.08) }
const PES_NAS_PERNAS = { esquerdo: new THREE.Vector3(0.05, 0.12, 0.02), direito: new THREE.Vector3(-0.05, 0.12, 0.02) }
/** As fitas de luz: uma hélice em volta do corpo dela, dos pés ao pescoço. */
const FITA = { de: 0.08, ate: 0.62, raio: 0.15, voltas: 6, grossura: 0.012 }

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
  /** A cada quadro do salto: por onde passa o peito do peão (o rastro de luz dele subindo). */
  aoRastroDoSalto: (ponto: THREE.Vector3) => void
  /** O peão abraçou a vítima pelas costas, no ar. */
  aoAgarrar: (ponto: THREE.Vector3) => void
  /** As fitas de luz começaram a enrolar a vítima. */
  aoEnrolar: (ponto: THREE.Vector3) => void
  /** A broca começou a descer. */
  aoComecarAEspiral: (ponto: THREE.Vector3) => void
  /** Cada meia volta da espiral. */
  aoGirar: (volta: number) => void
  /** A cada quadro da broca: por onde passam os pés da vítima (o rastro de luz da espiral). */
  aoRastro: (ponto: THREE.Vector3) => void
  /** O peão soltou a vítima. */
  aoSoltar: () => void
  /** A cabeça da vítima bateu no chão (o golpe que decide). */
  aoColidir: (ponto: THREE.Vector3) => void
  /** A vítima tombou deitada de costas: daqui em diante a altura e o tamanho dela são de quem chamou (a cratera). */
  aoDeitar: (colisao: ColisaoDoEspiral) => void
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
  /** Do peão pra vítima, no chão, e o eixo em volta do qual ela gira pra trás. */
  rumo: THREE.Vector3
  eixoDoChute: THREE.Vector3
  /** As fitas de luz, presas no corpo da vítima. */
  fitas: THREE.Mesh
  /** Onde o peão pousa, e o giro dele lá (de frente pra cratera). */
  pouso: THREE.Vector3
  giroDoPouso: number
  /** Onde o peão estava na hora de soltar (o mortal sai dali). */
  soltouEm: THREE.Vector3 | null
  /** O último giro da broca (a vítima cai do jeito que estava). */
  ultimoGiro: number
  ultimo: { ponto: THREE.Vector3; t: number } | null
  meiasVoltas: number
  marcos: Set<string>
  colidiu: boolean
  deitou: boolean
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

/** As fitas de luz: um tubo fino em hélice em volta do corpo, no espaço da vítima. Começam escondidas (o desenho cresce
 * de baixo pra cima quando enrolam). */
function criarFitas(cor: THREE.ColorRepresentation): THREE.Mesh {
  const pontos: THREE.Vector3[] = []
  const passos = 140
  for (let i = 0; i <= passos; i++) {
    const u = i / passos
    const angulo = u * FITA.voltas * Math.PI * 2
    // mais justa nos tornozelos e no pescoço, como quem amarra
    const raio = FITA.raio * (0.75 + 0.25 * Math.sin(Math.PI * u))
    pontos.push(new THREE.Vector3(Math.cos(angulo) * raio, FITA.de + (FITA.ate - FITA.de) * u, Math.sin(angulo) * raio))
  }
  const geometria = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 280, FITA.grossura, 5, false)
  geometria.setDrawRange(0, 0)
  const material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  const fitas = new THREE.Mesh(geometria, material)
  fitas.name = 'espiral:fitas'
  fitas.renderOrder = 2
  return fitas
}

/** Começa o Espiral Absoluto, com o peão já virado pra vítima e perto dela. `cor` é a das fitas de luz. */
export function espiralAbsoluto(peca: THREE.Object3D, vitima: THREE.Object3D, cena: THREE.Object3D, cor: THREE.ColorRepresentation, continua: () => boolean, avisos: AvisosDoEspiral) {
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
  const fitas = criarFitas(cor)
  vitima.add(fitas)
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
    fitas,
    pouso,
    giroDoPouso: Math.atan2(rumo.x, rumo.z),
    soltouEm: null,
    ultimoGiro: 0,
    ultimo: null,
    meiasVoltas: 0,
    marcos: new Set(),
    colidiu: false,
    deitou: false,
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

/** A vítima girada pra trás `tomba` (0 em pé, π/2 deitada de barriga pra cima, π de cabeça pra baixo) e girada `giro`
 * em volta do alto. */
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
/** De cabeça pra baixo, o centro do corpo fica a (comprimento - meio) acima da cabeça. */
const centroComACabecaEm = (e: Espiral, alturaDaCabeca: number) => alturaDaCabeca + (e.comprimento - e.meio)
const alturaDeSoltar = (e: Espiral) => centroComACabecaEm(e, CHAO + CABECA_AO_SOLTAR * e.vitimaEscala)

/** O ângulo da espiral na fração `s` da queda: começa devagar e acelera. */
const anguloDaEspiral = (s: number) => VOLTAS * Math.PI * 2 * (0.3 * s + 0.7 * s * s)

/** Onde está o meio do corpo da vítima na broca (fração `s` da queda), e o giro dela em volta dela mesma. */
function naEspiral(e: Espiral, s: number): { centro: THREE.Vector3; giro: number } {
  const angulo = anguloDaEspiral(s)
  const raio = RAIO_DA_ESPIRAL * e.vitimaEscala * (1 - s)
  // a queda pesa: começa devagar e acelera, como quem cai
  const altura = alturaDoApice(e) + (alturaDeSoltar(e) - alturaDoApice(e)) * s * s
  // o caminho em espiral sai de cima da casa e fecha de volta nela
  const deLado = new THREE.Vector3(Math.cos(angulo) - 1, 0, Math.sin(angulo)).multiplyScalar(raio)
  return { centro: e.vitimaBase.clone().add(deLado).setY(altura), giro: angulo * GIROS_DA_BROCA }
}

/** A vítima em cada instante: com medo do chute, subindo, virando de cabeça pra baixo, na broca, fincada e tombando. */
function moverVitima(e: Espiral, t: number) {
  if (t < CHUTE_ACERTA) {
    // vê o joelho subindo: se inclina pra trás, encolhida
    const medo = sobe(t, BASE_ATE * 0.5, CHUTE_ACERTA)
    colocarVitima(e, centroEmPe(e), giroDaVitima(e, -0.18 * medo, 0))
    return
  }
  if (t < APICE_ATE) {
    // o chute no queixo: sobe bem alto freando, a cabeça jogada pra trás, e um pouco pra longe do peão; abraçada,
    // vira de cabeça pra baixo lá no alto
    const u = fracao(t, CHUTE_ACERTA, SOBE_ATE)
    const subida = 1 - (1 - u) ** 2.2
    const centro = centroEmPe(e).addScaledVector(e.rumo, 0.12 * e.vitimaEscala * Math.sin(Math.PI * u))
    centro.y += (alturaDoApice(e) - centro.y) * subida
    // no alto, parada, mas viva: treme de desenho em desenho
    if (t >= SOBE_ATE) {
      const desenho = Math.floor((t - SOBE_ATE) / QUADRO_EM_DOIS)
      centro.add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 3) - 0.5, acaso(desenho + 9) - 0.5).multiplyScalar(0.012 * e.vitimaEscala))
    }
    const vira = sobe(t, AGARRA, VIRA_ATE)
    const tomba = TOMBA_NO_CHUTE * (1 - (1 - u) ** 1.6) * (1 - vira) + Math.PI * vira
    colocarVitima(e, centro, giroDaVitima(e, tomba, 0))
    return
  }
  if (t < ESPIRAL_ATE) {
    const { centro, giro } = naEspiral(e, fracao(t, APICE_ATE, ESPIRAL_ATE))
    e.ultimoGiro = giro
    colocarVitima(e, centro, giroDaVitima(e, Math.PI, giro))
    return
  }
  if (t < COLIDE) {
    // solta: cai o que falta de uma vez, de cabeça, ainda girando
    const v = fracao(t, ESPIRAL_ATE, COLIDE)
    const centro = e.vitimaBase.clone().setY(alturaDeSoltar(e) + (centroComACabecaEm(e, CHAO) - alturaDeSoltar(e)) * v * v)
    colocarVitima(e, centro, giroDaVitima(e, Math.PI, e.ultimoGiro + 0.8 * v))
    return
  }
  // fincada, a broca freia até o giro em que o tombo vai pra longe do peão (o corpo deita do outro lado da casa, e a
  // cratera nunca abre debaixo dele)
  const giro = e.ultimoGiro + 0.8 + (giroDoTombo(e) - e.ultimoGiro - 0.8) * sobe(t, COLIDE, FINCADA_ATE)
  if (t < FINCADA_ATE) {
    // fincada de cabeça no chão, tremendo de leve, um instante (o "ma" depois da pancada)
    const desenho = Math.floor((t - COLIDE) / QUADRO_EM_DOIS)
    const treme = (acaso(desenho) - 0.5) * 0.05 * (1 - fracao(t, COLIDE, FINCADA_ATE))
    colocarVitima(e, e.vitimaBase.clone().setY(centroComACabecaEm(e, CHAO)), giroDaVitima(e, Math.PI + treme, giro))
    return
  }
  // tomba de costas: gira em volta da cabeça, que fica no chão, e o corpo assenta deitado de barriga pra cima
  const d = fracao(t, FINCADA_ATE, DEITA)
  const tomba = Math.PI - (Math.PI / 2) * d * d
  const quaternion = giroDaVitima(e, tomba, giro)
  const cabecaNoChao = e.vitimaBase.clone().setY(CHAO)
  // do pé à cabeça, girado: a peça pendurada pela cabeça, sem passar do chão
  const doPeACabeca = new THREE.Vector3(0, e.comprimento, 0).applyQuaternion(quaternion)
  e.vitima.quaternion.copy(quaternion)
  e.vitima.position.copy(cabecaNoChao).sub(doPeACabeca)
  const deitada = CHAO + MEIA_GROSSURA * e.vitimaEscala
  e.vitima.position.y = Math.max(e.vitima.position.y, deitada)
  e.vitima.updateWorldMatrix(true, true)
}

/** Os braços e as pernas da vítima em cada instante (ver realismo.ts). Enrolada pelas fitas, fica com tudo preso no
 * corpo. */
function poseDaVitima(t: number): PoseLargada {
  if (t < CHUTE_ACERTA) {
    const medo = sobe(t, BASE_ATE * 0.5, CHUTE_ACERTA)
    return { pratras: -0.35 * medo, abertura: 0.2 * medo, arco: -0.2 * medo }
  }
  // subindo: o tranco joga os membros pra baixo, atrasados
  if (t < ENROLA_DE) return { pratras: 0.85, abertura: 0.3, arco: 0.7 }
  // as fitas apertam: os membros se fecham no corpo
  const preso = sobe(t, ENROLA_DE, ENROLA_ATE)
  if (t < DEITA) return { pratras: 0.6 * (1 - preso), abertura: 0.3 * (1 - preso), arco: 0.4 * (1 - preso) }
  return { pratras: 0, abertura: 0.15, arco: 0 }
}

/** As fitas crescendo de baixo pra cima enquanto enrolam; somem quando a vítima tomba. */
function mostrarFitas(e: Espiral, t: number) {
  const geometria = e.fitas.geometry as THREE.TubeGeometry
  const total = geometria.index ? geometria.index.count : 0
  const enrolou = fracao(t, ENROLA_DE, ENROLA_ATE)
  geometria.setDrawRange(0, Math.floor(total * enrolou / 6) * 6)
  const material = e.fitas.material as THREE.MeshBasicMaterial
  material.opacity = 0.9 * (1 - sobe(t, FINCADA_ATE, DEITA)) * (0.8 + 0.2 * Math.sin(t / 40))
}

// --- o peão ------------------------------------------------------------------------------------------------------------

/** O peão abraçado nas costas da vítima, do jeito que ela estiver virada (de pé ou de cabeça pra baixo). `peso` 0
 * deixa os membros no clipe. */
function abracarPelasCostas(e: Espiral, peso: number) {
  const { peca, vitima } = e
  peca.position.copy(vitima.localToWorld(NAS_COSTAS.clone()))
  peca.quaternion.copy(vitima.quaternion)
  peca.updateWorldMatrix(true, true)
  girarTronco(peca, LADO, 0.3 * peso)
  levarBracoAte(peca, 'Left', vitima.localToWorld(MAOS_NO_PEITO.esquerda.clone()), peso)
  levarBracoAte(peca, 'Right', vitima.localToWorld(MAOS_NO_PEITO.direita.clone()), peso)
  levarPernaAte(peca, 'Left', vitima.localToWorld(PES_NAS_PERNAS.esquerdo.clone()), peso)
  levarPernaAte(peca, 'Right', vitima.localToWorld(PES_NAS_PERNAS.direito.clone()), peso)
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
    girarTronco(peca, LADO, (inclina + (0.25 * agacha) / 0.1) * peso)
    levarBracoAte(peca, 'Left', daBase(e, MAOS_DO_EQUILIBRIO.esquerda), peso)
    levarBracoAte(peca, 'Right', daBase(e, MAOS_DO_EQUILIBRIO.direita), peso)
    return
  }
  if (t < AGARRA) {
    // o salto: do chão até as costas da vítima, num arco que passa por fora dela, os joelhos encolhidos e as mãos
    // esticadas pra cima
    const u = fracao(t, AGACHA_ATE, AGARRA)
    const sai = 1 - (1 - u) ** 2
    const costas = e.vitima.localToWorld(NAS_COSTAS.clone())
    const deLado = new THREE.Vector3().crossVectors(CIMA, e.rumo).multiplyScalar(0.35 * e.escala * Math.sin(Math.PI * u))
    peca.position.copy(e.base).lerp(costas, sai).add(deLado)
    // chegando, já vira do jeito da vítima
    peca.quaternion.setFromAxisAngle(CIMA, e.giroDoPeao).slerp(e.vitima.quaternion, sobe(u, 0.6, 1))
    peca.updateWorldMatrix(true, true)
    const encolhe = Math.sin(Math.PI * Math.min(1, u * 1.2))
    levarPernaAte(peca, 'Left', peca.localToWorld(new THREE.Vector3(0.06, 0.14, 0.1)), encolhe)
    levarPernaAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.06, 0.12, 0.12)), encolhe)
    levarBracoAte(peca, 'Left', peca.localToWorld(MAOS_PRA_CIMA.esquerda.clone()), 1)
    levarBracoAte(peca, 'Right', peca.localToWorld(MAOS_PRA_CIMA.direita.clone()), 1)
    if (u > 0.85) abracarPelasCostas(e, sobe(u, 0.85, 1))
    return
  }
  if (t < ESPIRAL_ATE) {
    abracarPelasCostas(e, 1)
    return
  }
  if (!e.soltouEm) e.soltouEm = peca.position.clone()
  if (t < POUSO) {
    // solta e dá um mortal pra trás no ar, de cabeça pra baixo até de pé, e cai de frente pra cratera
    const u = fracao(t, ESPIRAL_ATE, POUSO)
    peca.position.copy(e.soltouEm).lerp(e.pouso, u).addScaledVector(CIMA, 0.55 * e.escala * Math.sin(Math.PI * u))
    peca.position.y = Math.max(e.pouso.y, peca.position.y)
    peca.quaternion
      .setFromAxisAngle(CIMA, e.giroDoPouso)
      .multiply(new THREE.Quaternion().setFromAxisAngle(LADO, Math.PI * (1 - suave(u))))
    peca.updateWorldMatrix(true, true)
    // encolhido no mortal: os joelhos no peito e as mãos nas canelas
    const encolhe = Math.sin(Math.PI * u)
    levarPernaAte(peca, 'Left', peca.localToWorld(new THREE.Vector3(0.06, 0.2, 0.12)), encolhe)
    levarPernaAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.06, 0.2, 0.12)), encolhe)
    levarBracoAte(peca, 'Left', peca.localToWorld(new THREE.Vector3(0.08, 0.3, 0.16)), encolhe)
    levarBracoAte(peca, 'Right', peca.localToWorld(new THREE.Vector3(-0.08, 0.3, 0.16)), encolhe)
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
  // o rastro de luz do peão subindo (um ponto por quadro, no peito dele)
  if (t >= AGACHA_ATE && t < AGARRA) e.avisos.aoRastroDoSalto(e.peca.localToWorld(new THREE.Vector3(0, 0.45, 0)))
  if (primeiraVez(e, 'pegada', t, AGARRA)) {
    congelar(TRANCO_MS)
    e.avisos.aoAgarrar(e.vitima.localToWorld(new THREE.Vector3(0, 0.5, 0)))
  }
  if (primeiraVez(e, 'enrola', t, ENROLA_DE)) e.avisos.aoEnrolar(e.vitima.localToWorld(new THREE.Vector3(0, e.meio / e.vitimaEscala, 0)))
  if (primeiraVez(e, 'espiral', t, APICE_ATE)) e.avisos.aoComecarAEspiral(e.vitima.localToWorld(new THREE.Vector3(0, e.meio / e.vitimaEscala, 0)))
  if (t >= APICE_ATE && t < ESPIRAL_ATE) {
    const meias = Math.floor(anguloDaEspiral(fracao(t, APICE_ATE, ESPIRAL_ATE)) / Math.PI)
    if (meias > e.meiasVoltas) {
      e.meiasVoltas = meias
      e.avisos.aoGirar(meias)
    }
    // um ponto por quadro, nos pés dela (lá em cima, na broca): o rastro desenha a espiral sem pesar no celular fraco
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

/** O giro (em volta do alto) em que a vítima, de cabeça pra baixo, tomba pra longe do peão: deitada, a cabeça aponta
 * pra ele e os pés pro outro lado. É o múltiplo de uma volta mais perto de onde a broca parou, meia volta adiante. */
function giroDoTombo(e: Espiral): number {
  const parou = e.ultimoGiro + 0.8
  return Math.PI + Math.PI * 2 * Math.round((parou - Math.PI) / (Math.PI * 2))
}

function colidir(e: Espiral) {
  e.colidiu = true
  e.avisos.aoColidir(e.vitimaBase.clone().setY(CHAO + 0.02))
}

function deitar(e: Espiral) {
  e.deitou = true
  // deitada de costas no chão, o meio do corpo onde a cratera é mais funda
  const deitada = CHAO + MEIA_GROSSURA * e.vitimaEscala
  const quaternion = giroDaVitima(e, Math.PI / 2, giroDoTombo(e))
  const doPeAoMeio = new THREE.Vector3(0, e.meio, 0).applyQuaternion(quaternion)
  const cabecaNoChao = e.vitimaBase.clone().setY(CHAO)
  const doPeACabeca = new THREE.Vector3(0, e.comprimento, 0).applyQuaternion(quaternion)
  const pe = cabecaNoChao.clone().sub(doPeACabeca)
  const meio = pe.clone().add(doPeAoMeio).setY(0)
  e.vitima.quaternion.copy(quaternion)
  e.vitima.position.copy(pe).setY(deitada)
  e.vitima.updateWorldMatrix(true, true)
  // pra onde a cabeça aponta, no chão (o alto da peça deitada)
  const rumo = CIMA.clone().applyQuaternion(quaternion).setY(0)
  if (rumo.lengthSq() < 1e-6) rumo.copy(e.rumo)
  rumo.normalize()
  tirarFitas(e)
  delete e.vitima.userData.poseDeHabilidade
  e.avisos.aoDeitar({ meio, rumo, comprimento: e.comprimento, meiaGrossura: MEIA_GROSSURA * e.vitimaEscala })
}

function tirarFitas(e: Espiral) {
  if (!e.fitas.parent) return
  e.fitas.removeFromParent()
  e.fitas.geometry.dispose()
  ;(e.fitas.material as THREE.Material).dispose()
}

function encerrar(e: Espiral, t: number) {
  espirais.delete(e)
  tirarFitas(e)
  // o peão fica onde pousou (dali o lance o leva pra casa), em pé
  e.peca.position.copy(t >= POUSO ? e.pouso : e.base)
  e.peca.rotation.set(0, t >= POUSO ? e.giroDoPouso : e.giroDoPeao, 0)
  delete e.peca.userData.poseDeHabilidade
  if (!e.deitou) delete e.vitima.userData.poseDeHabilidade
}

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
    // depois de deitar, ainda mantém a vítima esparramada até ela sumir no chão
    const vitimaNoChao = e.deitou && e.vitima.parent !== null && e.vitima.visible
    if (!e.continua() || !e.peca.parent || (t >= FIM && !vitimaNoChao)) {
      encerrar(e, t)
      continue
    }
    e.ossos = t >= FIM ? [] : salvarOssos(e.peca, OSSOS)
    e.ossosDaVitima = e.vitima.parent ? salvarOssos(e.vitima, OSSOS_DO_CORPO_LARGADO) : []
    if (!e.deitou) {
      moverVitima(e, t)
      mostrarFitas(e, t)
    }
    avisar(e, t)
    if (!e.colidiu && t >= COLIDE) colidir(e)
    if (!e.deitou && t >= DEITA) deitar(e)
    if (t < FIM) posarPeao(e, t, agora)
    else {
      e.peca.position.copy(e.pouso)
      e.peca.rotation.set(0, e.giroDoPouso, 0)
      delete e.peca.userData.poseDeHabilidade
    }
    if (!e.colidiu && t >= CHUTE_ACERTA) linhasDoCorpo(e, t, 0xffffff)
    if (e.vitima.parent && e.vitima.visible) corpoLargado(e.vitima, poseDaVitima(t), t >= SOBE_ATE && t < APICE_ATE ? emDois(agora) : agora)
  }
}
