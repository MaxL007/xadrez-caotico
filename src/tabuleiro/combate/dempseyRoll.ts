import * as THREE from 'three'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG, restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'
import { voltarAoDescanso } from '../animacoes/gestos'
import { novaSequenciaRPG } from '../pecas/modelosRPG'
import { corpoLargado, OSSOS_DO_CORPO_LARGADO, realismo } from '../sensacao/realismo'
import { agoraDoJogo } from '../sensacao/relogioDoJogo'
import { acaso, QUADRO_EM_DOIS } from './efeitosDeAnime'

// A Dempsey Roll, habilidade do peão (símbolo do usuário: a luva de boxe). O golpe do boxe de Jack Dempsey, que é o golpe
// final do Ippo em Hajime no Ippo: agachado na guarda alta (os punhos no rosto), o tronco descreve um oito deitado (∞)
// avançando sobre a vítima, e a cada lado do balanço sai um gancho, esquerdo e direito alternados, cada vez mais rápido.
// Como o Ippo depois da luta com o Sawamura, a roda para de repente no meio (pra não ser contra-atacada) e volta mais
// rápida. No fim, o corpo carrega no ponto mais baixo e solta o gancho de direita com o peso todo: a vítima sai voando
// (nocaute.ts). A cabeça da vítima vai de um lado pro outro a cada gancho.
// Os ossos vão por cima do clipe, como na luta sem arma: desfeitos antes dos clipes e refeitos depois.

/** Os instantes, em ms desde o começo. */
const ENTRA_ATE = 260
const ROLA_DE = 260
/** As voltas do oito, sem contar a parada. */
const ROLA_MS = 1440
const VOLTAS = 3
/** A parada brusca, no meio do oito (depois do quarto gancho, com o corpo no centro e agachado). */
const PARADA_MS = 150
const PARADA_NO_ANGULO = 4 * Math.PI
const ROLA_ATE = ROLA_DE + ROLA_MS + PARADA_MS
/** A carga parada antes do golpe final (o "ma"), o acerto e o fim. */
const CARGA_ATE = ROLA_ATE + 150
const ACERTO_FINAL = CARGA_ATE + 90
const FIM = ACERTO_FINAL + 560

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']

const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
const FRENTE = new THREE.Vector3(0, 0, 1)
/** A guarda alta: os punhos no rosto (no espaço da peça: ela olha pra +z, a esquerda em +x). */
const GUARDA_ESQ = new THREE.Vector3(0.065, 0.6, 0.12)
const GUARDA_DIR = new THREE.Vector3(-0.065, 0.6, 0.12)
/** A base: os pés afastados, o esquerdo um pouco à frente. */
const PE_ESQUERDO = new THREE.Vector3(0.05, 0, 0.07)
const PE_DIREITO = new THREE.Vector3(-0.05, 0, -0.07)

/** Em que ângulo do oito sai cada gancho: nas pontas do balanço (sen φ = ±1). Os pares são de esquerda. */
const GANCHOS = Array.from({ length: VOLTAS * 2 }, (_, k) => Math.PI / 2 + k * Math.PI)
/** O gancho, em volta do ângulo dele: começa um pouco antes da ponta e acerta um pouco depois. */
const GANCHO_ANTES = 0.25
const GANCHO_DEPOIS = 0.75
const GANCHO_ACERTA = 0.6

interface AvisosDaDempsey {
  /** Agachou na guarda: o brilho nos olhos (o "tiin"). */
  aoEntrar: (olhos: THREE.Vector3) => void
  /** Cada meia volta do oito (o vento do corpo passando). */
  aoBalancar: () => void
  /** A cada quadro do oito: onde está a cabeça (o rastro de luz do ∞). */
  aoRolar: (cabeca: THREE.Vector3) => void
  /** Um gancho acertou: \`numero\` de 0 a 5, \`ponto\` o queixo da vítima. */
  aoGancho: (numero: number, ponto: THREE.Vector3) => void
  /** A parada brusca no meio do oito. */
  aoParar: (ponto: THREE.Vector3) => void
  /** A carga antes do golpe final: o brilho no punho. */
  aoCarregar: (punho: THREE.Vector3) => void
  /** O golpe final acertou: \`direcao\` é pra onde a vítima vai (no chão). A partir daqui, a vítima é do nocaute. */
  aoGolpeFinal: (ponto: THREE.Vector3, direcao: { x: number; z: number }) => void
}

interface Dempsey {
  peca: THREE.Object3D
  vitima: THREE.Object3D
  inicio: number
  ossos: OssoSalvo[]
  ossosDaVitima: OssoSalvo[]
  base: THREE.Vector3
  escala: number
  /** Os eixos de quem bate, no mundo: a esquerda e a frente (pra vítima). */
  xq: THREE.Vector3
  zq: THREE.Vector3
  pes: { lado: 'Left' | 'Right'; base: THREE.Vector3; desvio: THREE.Vector3 }[]
  /** O queixo da vítima, no espaço de quem bate. */
  queixo: THREE.Vector3
  /** A vítima: onde estava, o giro de frente pra quem bate, a mola da cabeça e pra onde foi o último gancho. */
  vitimaBase: THREE.Vector3
  vitimaGiro: number
  balanco: number
  velocidade: number
  empurrao: THREE.Vector3
  recuo: number
  ultimoQuadro: number
  ganchosDados: number
  meiasVoltas: number
  marcos: Set<string>
  vitimaSolta: boolean
  continua: () => boolean
  avisos: AvisosDaDempsey
}

const dempseys = new Set<Dempsey>()

const suave = (t: number) => t * t * (3 - 2 * t)
const sobe = (t: number, de: number, ate: number) => suave(Math.min(1, Math.max(0, (t - de) / (ate - de))))
const fracao = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))

/** O ângulo do oito no instante \`u\` (0 a 1) das voltas: acelerando, cada volta mais rápida. */
const anguloDasVoltas = (u: number) => VOLTAS * Math.PI * 2 * (0.55 * u + 0.45 * u * u)
/** Em que \`u\` das voltas o oito passa pela parada (o inverso de \`anguloDasVoltas\`). */
const U_DA_PARADA = (() => {
  const alvo = PARADA_NO_ANGULO / (VOLTAS * Math.PI * 2)
  return (-0.55 + Math.sqrt(0.55 * 0.55 + 4 * 0.45 * alvo)) / (2 * 0.45)
})()

/** O ângulo do oito no instante \`t\` do golpe, com a parada brusca no meio. */
function anguloNoInstante(t: number): number {
  const naRoda = t - ROLA_DE
  const paradaEm = U_DA_PARADA * ROLA_MS
  if (naRoda <= paradaEm) return anguloDasVoltas(Math.max(0, naRoda) / ROLA_MS)
  if (naRoda <= paradaEm + PARADA_MS) return PARADA_NO_ANGULO
  return anguloDasVoltas(Math.min(1, (naRoda - PARADA_MS) / ROLA_MS))
}

/** Começa a Dempsey Roll, com quem bate já virado pra vítima e perto dela. */
export function dempseyRoll(peca: THREE.Object3D, vitima: THREE.Object3D, continua: () => boolean, avisos: AvisosDaDempsey) {
  peca.updateWorldMatrix(true, true)
  // a vítima fica de frente pra quem bate (no meio da luta não dá pra ficar de lado)
  voltarAoDescanso(vitima)
  novaSequenciaRPG(vitima)
  const rumo = new THREE.Vector3(vitima.position.x - peca.position.x, 0, vitima.position.z - peca.position.z).normalize()
  vitima.rotation.y = Math.atan2(-rumo.x, -rumo.z)
  vitima.updateWorldMatrix(true, true)
  const cabeca = ossoRPG(vitima, 'Head')
  const noMundo = cabeca ? cabeca.getWorldPosition(new THREE.Vector3()) : vitima.localToWorld(new THREE.Vector3(0, 0.7, 0))
  const local = peca.worldToLocal(noMundo.clone())
  const pes = (['Left', 'Right'] as const).flatMap((lado) => {
    const pe = ossoRPG(peca, `${lado}Foot`)
    return pe ? [{ lado, base: pe.getWorldPosition(new THREE.Vector3()), desvio: lado === 'Left' ? PE_ESQUERDO : PE_DIREITO }] : []
  })
  peca.userData.poseDeHabilidade = true
  vitima.userData.poseDeHabilidade = true
  dempseys.add({
    peca,
    vitima,
    inicio: agoraDoJogo(),
    ossos: [],
    ossosDaVitima: [],
    base: peca.position.clone(),
    escala: peca.scale.x,
    xq: LADO.clone().transformDirection(peca.matrixWorld),
    zq: FRENTE.clone().transformDirection(peca.matrixWorld),
    pes,
    // o queixo, um pouco abaixo do meio da cabeça; muito alto ou muito baixo, o gancho fica onde um braço alcança
    queixo: new THREE.Vector3(0, THREE.MathUtils.clamp(local.y - 0.04, 0.42, 0.66), Math.max(local.z - 0.05, 0.22)),
    vitimaBase: vitima.position.clone(),
    vitimaGiro: vitima.rotation.y,
    balanco: 0,
    velocidade: 0,
    empurrao: new THREE.Vector3(),
    recuo: 0,
    ultimoQuadro: agoraDoJogo(),
    ganchosDados: 0,
    meiasVoltas: 0,
    marcos: new Set(),
    vitimaSolta: false,
    continua,
    avisos,
  })
}

/** Uma vez só, no primeiro quadro depois de \`quando\`. */
function primeiraVez(d: Dempsey, marco: string, t: number, quando: number): boolean {
  if (t < quando || d.marcos.has(marco)) return false
  d.marcos.add(marco)
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

/** A mão no gancho (\`h\` de 0 a 1): sai pro lado, cruza num arco até o queixo e volta pra guarda. \`lado\` 1 é a esquerda. */
function maoNoGancho(d: Dempsey, lado: 1 | -1, h: number, guarda: THREE.Vector3, forca = 1): THREE.Vector3 {
  const fora = new THREE.Vector3(lado * 0.24, 0.56, 0.05)
  const alvo = new THREE.Vector3(-lado * 0.03, d.queixo.y, d.queixo.z + 0.05 * forca)
  const meio = new THREE.Vector3(lado * 0.17, d.queixo.y + 0.03, d.queixo.z * 0.85)
  if (h < 0.35) return guarda.clone().lerp(fora, suave(h / 0.35))
  if (h < GANCHO_ACERTA + 0.05) {
    // o arco do gancho: quadrático, de fora até o queixo, saindo de uma vez
    const u = 1 - (1 - (h - 0.35) / (GANCHO_ACERTA + 0.05 - 0.35)) ** 2
    return fora.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(meio, 2 * u * (1 - u)).addScaledVector(alvo, u * u)
  }
  return alvo.clone().lerp(guarda, suave((h - GANCHO_ACERTA - 0.05) / (1 - GANCHO_ACERTA - 0.05)))
}

/** A pose de quem bate no instante \`t\`; devolve o queixo da vítima no mundo (pros avisos). */
function posar(d: Dempsey, t: number) {
  const { peca } = d
  const peso = sobe(t, 0, ENTRA_ATE) * (1 - sobe(t, FIM - 260, FIM))
  // o oito: de lado (sen φ, positivo pra esquerda) e de cima pra baixo (sen 2φ)
  let lado = 0
  let giro = 0
  let agacha = 0.08 * sobe(t, 0, ENTRA_ATE)
  let avanco = 0
  let maoEsq = GUARDA_ESQ.clone()
  let maoDir = GUARDA_DIR.clone()
  const phi = anguloNoInstante(t)
  if (t >= ROLA_DE && t < ROLA_ATE) {
    lado = Math.sin(phi)
    // o oito: o corpo sobe de um lado e desce do outro (sen 2φ)
    const bob = 0.5 * Math.sin(2 * phi)
    // o tronco carrega antes da ponta e solta o gancho voltando
    giro = 0.38 * Math.sin(phi + 0.5)
    agacha = 0.08 - 0.03 * bob
    avanco = 0.06 * fracao(t, ROLA_DE, ROLA_ATE)
    GANCHOS.forEach((noAngulo, k) => {
      const h = (phi - (noAngulo - GANCHO_ANTES)) / (GANCHO_ANTES + GANCHO_DEPOIS)
      if (h <= 0 || h >= 1) return
      const deQual: 1 | -1 = k % 2 === 0 ? 1 : -1
      if (deQual === 1) maoEsq = maoNoGancho(d, 1, h, GUARDA_ESQ)
      else maoDir = maoNoGancho(d, -1, h, GUARDA_DIR)
    })
  } else if (t >= ROLA_ATE) {
    // a carga: agachado bem baixo, inclinado pra direita e torcido, o punho direito puxado; depois o gancho final
    // com o corpo todo, passando do ponto, e a volta pra guarda
    const carga = sobe(t, ROLA_ATE, ROLA_ATE + 90)
    const solta = fracao(t, CARGA_ATE, ACERTO_FINAL) ** 2
    const segue = sobe(t, ACERTO_FINAL, ACERTO_FINAL + 160)
    lado = -0.9 * carga * (1 - solta) + 0.45 * solta * (1 - 0.6 * segue)
    giro = -0.5 * carga * (1 - solta) + 0.6 * solta
    agacha = 0.08 + 0.05 * carga * (1 - solta)
    avanco = 0.06 + 0.07 * solta
    const fora = new THREE.Vector3(-0.27, 0.5, -0.02)
    const alvo = new THREE.Vector3(0.04, d.queixo.y, d.queixo.z + 0.1)
    const meio = new THREE.Vector3(-0.2, d.queixo.y + 0.04, d.queixo.z * 0.85)
    if (t < CARGA_ATE) maoDir = GUARDA_DIR.clone().lerp(fora, carga)
    else if (t < ACERTO_FINAL) maoDir = fora.clone().multiplyScalar((1 - solta) * (1 - solta)).addScaledVector(meio, 2 * solta * (1 - solta)).addScaledVector(alvo, solta * solta)
    else maoDir = alvo.clone().lerp(GUARDA_DIR, sobe(t, ACERTO_FINAL + 120, FIM - 200))
    if (t >= ROLA_ATE + 90 && t < CARGA_ATE) {
      // parada carregando, mas viva: treme de desenho em desenho
      const desenho = Math.floor((t - ROLA_ATE) / QUADRO_EM_DOIS)
      maoDir.add(new THREE.Vector3(acaso(desenho) - 0.5, acaso(desenho + 5) - 0.5, 0).multiplyScalar(0.02))
    }
  }
  // o corpo: desce, vai pro lado do oito e avança, os pés presos no chão
  peca.position
    .copy(d.base)
    .addScaledVector(CIMA, -agacha * d.escala * peso)
    .addScaledVector(d.xq, 0.07 * lado * d.escala * peso)
    .addScaledVector(d.zq, avanco * d.escala * peso)
  peca.updateWorldMatrix(true, true)
  for (const pe of d.pes) {
    const alvo = pe.base.clone().addScaledVector(d.xq, pe.desvio.x * d.escala).addScaledVector(d.zq, pe.desvio.z * d.escala)
    levarPernaAte(peca, pe.lado, alvo, peso)
  }
  // o tronco: pra frente na guarda, inclinado pro lado do oito (positivo em volta da frente leva o alto pra direita)
  girarTronco(peca, LADO, 0.3 * peso)
  girarTronco(peca, FRENTE, -0.6 * lado * peso)
  girarTronco(peca, CIMA, giro * peso)
  // as mãos seguem o tronco pro lado
  const deslocar = (v: THREE.Vector3) => peca.localToWorld(v.clone().add(new THREE.Vector3(0.12 * lado, -agacha * 0.6, 0)))
  levarBracoAte(peca, 'Left', deslocar(maoEsq), peso)
  levarBracoAte(peca, 'Right', deslocar(maoDir), peso)
}

/** A cabeça da vítima numa mola: cada gancho joga pro lado, e ela balança e volta. */
function posarVitima(d: Dempsey, dt: number, agora: number) {
  const { vitima } = d
  if (dt > 0) {
    const aceleracao = -240 * d.balanco - 15 * d.velocidade
    d.velocidade += aceleracao * dt
    d.balanco += d.velocidade * dt
  }
  const forca = d.balanco * realismo()
  // recua um pouco a cada gancho e vai pro lado em que a cabeça foi
  const rumo = new THREE.Vector3().copy(d.zq)
  vitima.position.copy(d.vitimaBase).addScaledVector(rumo, d.recuo * d.escala).addScaledVector(d.empurrao, 0.05 * forca * d.escala)
  vitima.rotation.y = d.vitimaGiro + 0.35 * forca * Math.sign(d.empurrao.dot(d.xq) || 1)
  vitima.updateWorldMatrix(true, true)
  if (d.empurrao.lengthSq() > 0) {
    // girar em volta de (cima × empurrão) leva o alto da peça pro lado do empurrão
    const eixo = new THREE.Vector3().crossVectors(CIMA, d.empurrao).normalize()
    const pescoco = ossoRPG(vitima, 'Neck')
    const peito = ossoRPG(vitima, 'Spine2')
    const tronco = ossoRPG(vitima, 'Spine')
    if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(eixo, 0.15 * forca))
    if (peito) girarOssoNoMundo(peito, new THREE.Quaternion().setFromAxisAngle(eixo, 0.3 * forca))
    if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(eixo, 0.75 * forca))
  }
  // os braços soltos, tontos
  corpoLargado(vitima, { pratras: 0.15 + 0.3 * Math.abs(forca), abertura: 0.15 + 0.3 * Math.abs(forca), arco: 0 }, agora)
}

function avisar(d: Dempsey, t: number) {
  const queixoNoMundo = () => d.peca.localToWorld(d.queixo.clone())
  if (primeiraVez(d, 'entra', t, ENTRA_ATE * 0.6)) {
    const cabeca = ossoRPG(d.peca, 'Head')
    d.avisos.aoEntrar(cabeca ? cabeca.getWorldPosition(new THREE.Vector3()) : d.peca.localToWorld(new THREE.Vector3(0, 0.62, 0.05)))
  }
  if (t >= ROLA_DE && t < ROLA_ATE) {
    const phi = anguloNoInstante(t)
    const meias = Math.floor(phi / Math.PI)
    if (meias > d.meiasVoltas) {
      d.meiasVoltas = meias
      d.avisos.aoBalancar()
    }
    while (d.ganchosDados < GANCHOS.length && phi >= GANCHOS[d.ganchosDados] - GANCHO_ANTES + GANCHO_ACERTA * (GANCHO_ANTES + GANCHO_DEPOIS)) {
      const numero = d.ganchosDados++
      // o gancho de esquerda (de quem bate) joga a cabeça pra direita dele, e o de direita pra esquerda
      const deQual = numero % 2 === 0 ? 1 : -1
      d.empurrao.copy(d.xq).multiplyScalar(-deQual)
      d.balanco = 0
      d.velocidade = 9 + numero * 0.8
      d.recuo += 0.025
      d.avisos.aoGancho(numero, queixoNoMundo())
    }
    if (primeiraVez(d, 'parada', t, ROLA_DE + U_DA_PARADA * ROLA_MS)) d.avisos.aoParar(queixoNoMundo())
  }
  if (primeiraVez(d, 'carga', t, ROLA_ATE + 90)) {
    const punho = ossoRPG(d.peca, 'RightHand')
    d.avisos.aoCarregar(punho ? punho.getWorldPosition(new THREE.Vector3()) : d.peca.localToWorld(new THREE.Vector3(-0.27, 0.5, 0)))
  }
  if (primeiraVez(d, 'final', t, ACERTO_FINAL)) {
    d.vitimaSolta = true
    delete d.vitima.userData.poseDeHabilidade
    // o gancho de direita joga a vítima pra frente e pro lado esquerdo de quem bate
    const direcao = d.zq.clone().addScaledVector(d.xq, 0.45).normalize()
    d.avisos.aoGolpeFinal(queixoNoMundo(), { x: direcao.x, z: direcao.z })
  }
}

/** A peça no meio de uma Dempsey Roll: nessa hora não começa um gesto. */
export function estaNaDempsey(peca: THREE.Object3D): boolean {
  for (const d of dempseys) if (d.peca === peca) return true
  return false
}

/** Antes dos clipes, a cada quadro: tira as poses. */
export function desfazerPosesDasDempseys() {
  for (const d of dempseys) {
    restaurarOssos(d.ossosDaVitima)
    restaurarOssos(d.ossos)
  }
}

/** Depois dos clipes, a cada quadro (no relógio do jogo). */
export function atualizarDempseys(agora: number) {
  for (const d of [...dempseys]) {
    const t = agora - d.inicio
    if (!d.continua() || !d.peca.parent || t >= FIM) {
      d.peca.position.copy(d.base)
      delete d.peca.userData.poseDeHabilidade
      if (!d.vitimaSolta) delete d.vitima.userData.poseDeHabilidade
      dempseys.delete(d)
      continue
    }
    const dt = Math.max(0, agora - d.ultimoQuadro) / 1000
    d.ultimoQuadro = agora
    d.ossos = salvarOssos(d.peca, OSSOS)
    d.ossosDaVitima = d.vitimaSolta || !d.vitima.parent ? [] : salvarOssos(d.vitima, OSSOS_DO_CORPO_LARGADO)
    avisar(d, t)
    posar(d, t)
    // o rastro de luz do oito, com a cabeça já no lugar deste quadro
    const cabeca = t >= ROLA_DE && t < ROLA_ATE ? ossoRPG(d.peca, 'Head') : undefined
    if (cabeca) d.avisos.aoRolar(cabeca.getWorldPosition(new THREE.Vector3()))
    if (!d.vitimaSolta && d.vitima.parent) posarVitima(d, dt, agora)
  }
}
