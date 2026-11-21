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
//
//  1. A guarda: agacha, os punhos no rosto, os olhos brilham.
//  2. O aquecimento (pedido do usuário): duas voltas do oito sem bater, o balanço crescendo e os pés saltitando, com o
//     rastro de luz desenhando o ∞. A vítima levanta a guarda com medo, treme, recua e acompanha o balanço com a cabeça.
//  3. Os ganchos, mais lentos que no começo (pedido do usuário), acelerando: cada um joga a cabeça da vítima pro lado,
//     a guarda dela cai, ela cambaleia e os joelhos vão cedendo.
//  4. A parada brusca no meio do oito (a do Ippo depois da luta com o Sawamura), com a vítima tonta, e a roda volta mais
//     rápida.
//  5. A carga parada e o gancho final de direita com o peso todo: a vítima sai voando (nocaute.ts).
//
// Os ossos das duas peças vão por cima do clipe, como na luta sem arma: desfeitos antes dos clipes e refeitos depois.

/** Os instantes, em ms desde o começo. */
const ENTRA_ATE = 300
const AQUECE_DE = 300
/** O aquecimento: duas voltas do oito sem bater. */
const AQUECE_MS = 2000
const VOLTAS_DO_AQUECIMENTO = 2
const ROLA_DE = AQUECE_DE + AQUECE_MS
/** As voltas do oito com os ganchos, sem contar a parada. */
const ROLA_MS = 2400
const VOLTAS = 3
/** Quanto da velocidade do oito já vem do começo (o resto é aceleração): começa no ritmo do aquecimento. */
const RITMO_INICIAL = 0.7
/** A parada brusca, no meio do oito (depois do quarto gancho, com o corpo no centro e agachado). */
const PARADA_MS = 260
const PARADA_NO_ANGULO = 4 * Math.PI
const ROLA_ATE = ROLA_DE + ROLA_MS + PARADA_MS
/** A carga parada antes do golpe final (o "ma"), o acerto e o fim. */
const CARGA_ATE = ROLA_ATE + 280
const ACERTO_FINAL = CARGA_ATE + 120
const FIM = ACERTO_FINAL + 650

const OSSOS = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']

const CIMA = new THREE.Vector3(0, 1, 0)
const LADO = new THREE.Vector3(1, 0, 0)
const FRENTE = new THREE.Vector3(0, 0, 1)
/** A guarda alta: os punhos no rosto (no espaço da peça: ela olha pra +z, a esquerda em +x). */
const GUARDA_ESQ = new THREE.Vector3(0.065, 0.6, 0.12)
const GUARDA_DIR = new THREE.Vector3(-0.065, 0.6, 0.12)
/** A guarda de medo da vítima: os braços cobrindo o rosto, um pouco mais alto e mais fechado. */
const MEDO_ESQ = new THREE.Vector3(0.045, 0.64, 0.14)
const MEDO_DIR = new THREE.Vector3(-0.045, 0.64, 0.14)
/** A base: os pés afastados, o esquerdo um pouco à frente. */
const PE_ESQUERDO = new THREE.Vector3(0.05, 0, 0.07)
const PE_DIREITO = new THREE.Vector3(-0.05, 0, -0.07)

/** Em que ângulo do oito sai cada gancho: nas pontas do balanço (sen φ = ±1). Os pares são de esquerda. */
const GANCHOS = Array.from({ length: VOLTAS * 2 }, (_, k) => Math.PI / 2 + k * Math.PI)
/** O gancho, em volta do ângulo dele: começa um pouco antes da ponta e acerta um pouco depois. */
const GANCHO_ANTES = 0.3
const GANCHO_DEPOIS = 0.8
const GANCHO_ACERTA = 0.6

interface AvisosDaDempsey {
  /** Agachou na guarda: o brilho nos olhos (o "tiin"). */
  aoEntrar: (olhos: THREE.Vector3) => void
  /** Cada meia volta do oito (o vento do corpo passando). */
  aoBalancar: () => void
  /** A cada quadro do oito: onde está a cabeça (o rastro de luz do ∞). */
  aoRolar: (cabeca: THREE.Vector3) => void
  /** O aquecimento acabou e os ganchos começam: o impulso de anime. */
  aoComecarOsGanchos: (ponto: THREE.Vector3) => void
  /** Um gancho acertou: `numero` de 0 a 5, `ponto` o queixo da vítima. */
  aoGancho: (numero: number, ponto: THREE.Vector3) => void
  /** A parada brusca no meio do oito. */
  aoParar: (ponto: THREE.Vector3) => void
  /** A carga antes do golpe final: o brilho no punho. */
  aoCarregar: (punho: THREE.Vector3) => void
  /** O golpe final acertou: `direcao` é pra onde a vítima vai (no chão). A partir daqui, a vítima é do nocaute. */
  aoGolpeFinal: (ponto: THREE.Vector3, direcao: { x: number; z: number }) => void
}

interface PeNoChao {
  lado: 'Left' | 'Right'
  base: THREE.Vector3
  desvio: THREE.Vector3
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
  pes: PeNoChao[]
  /** O queixo da vítima, no espaço de quem bate. */
  queixo: THREE.Vector3
  /** A vítima: onde estava, os pés, o giro de frente pra quem bate, a mola da cabeça e pra onde foi o último gancho. */
  vitimaBase: THREE.Vector3
  pesDaVitima: PeNoChao[]
  vitimaGiro: number
  vitimaEscala: number
  balanco: number
  velocidade: number
  empurrao: THREE.Vector3
  /** O quanto a vítima já recuou e cambaleou pro lado (no tamanho dela). */
  recuo: number
  deLado: number
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

/** O ângulo do oito no instante `u` (0 a 1) das voltas com ganchos: começa no ritmo do aquecimento e acelera. */
const anguloDasVoltas = (u: number) => VOLTAS * Math.PI * 2 * (RITMO_INICIAL * u + (1 - RITMO_INICIAL) * u * u)
/** Em que `u` das voltas o oito passa pela parada (o inverso de `anguloDasVoltas`). */
const U_DA_PARADA = (() => {
  const alvo = PARADA_NO_ANGULO / (VOLTAS * Math.PI * 2)
  const a = 1 - RITMO_INICIAL
  return (-RITMO_INICIAL + Math.sqrt(RITMO_INICIAL * RITMO_INICIAL + 4 * a * alvo)) / (2 * a)
})()

/** O ângulo dos ganchos no instante `t` do golpe, com a parada brusca no meio (antes das voltas com ganchos, 0). */
function anguloNoInstante(t: number): number {
  const naRoda = t - ROLA_DE
  const paradaEm = U_DA_PARADA * ROLA_MS
  if (naRoda <= paradaEm) return anguloDasVoltas(Math.max(0, naRoda) / ROLA_MS)
  if (naRoda <= paradaEm + PARADA_MS) return PARADA_NO_ANGULO
  return anguloDasVoltas(Math.min(1, (naRoda - PARADA_MS) / ROLA_MS))
}

/** O ângulo do oito pro corpo: no aquecimento, as voltas sem bater, no mesmo ritmo do começo dos ganchos. */
function anguloDoCorpo(t: number): number {
  if (t < AQUECE_DE) return 0
  if (t < ROLA_DE) return VOLTAS_DO_AQUECIMENTO * Math.PI * 2 * ((t - AQUECE_DE) / AQUECE_MS)
  return anguloNoInstante(t)
}

/** Os pés de uma peça, presos no chão onde estavam, com o desvio da base de luta. */
function pesNoChao(peca: THREE.Object3D, desvios: Record<'Left' | 'Right', THREE.Vector3>): PeNoChao[] {
  return (['Left', 'Right'] as const).flatMap((lado) => {
    const pe = ossoRPG(peca, `${lado}Foot`)
    return pe ? [{ lado, base: pe.getWorldPosition(new THREE.Vector3()), desvio: desvios[lado] }] : []
  })
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
  const parado = new THREE.Vector3()
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
    pes: pesNoChao(peca, { Left: PE_ESQUERDO, Right: PE_DIREITO }),
    // o queixo, um pouco abaixo do meio da cabeça; muito alto ou muito baixo, o gancho fica onde um braço alcança
    queixo: new THREE.Vector3(0, THREE.MathUtils.clamp(local.y - 0.04, 0.42, 0.66), Math.max(local.z - 0.05, 0.22)),
    vitimaBase: vitima.position.clone(),
    pesDaVitima: pesNoChao(vitima, { Left: parado, Right: parado }),
    vitimaGiro: vitima.rotation.y,
    vitimaEscala: vitima.scale.x,
    balanco: 0,
    velocidade: 0,
    empurrao: new THREE.Vector3(),
    recuo: 0,
    deLado: 0,
    ultimoQuadro: agoraDoJogo(),
    ganchosDados: 0,
    meiasVoltas: 0,
    marcos: new Set(),
    vitimaSolta: false,
    continua,
    avisos,
  })
}

/** Uma vez só, no primeiro quadro depois de `quando`. */
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

/** A mão no gancho (`h` de 0 a 1): sai pro lado, cruza num arco até o queixo e volta pra guarda. `lado` 1 é a esquerda. */
function maoNoGancho(d: Dempsey, lado: 1 | -1, h: number, guarda: THREE.Vector3): THREE.Vector3 {
  const fora = new THREE.Vector3(lado * 0.24, 0.56, 0.05)
  const alvo = new THREE.Vector3(-lado * 0.03, d.queixo.y, d.queixo.z + 0.05)
  const meio = new THREE.Vector3(lado * 0.17, d.queixo.y + 0.03, d.queixo.z * 0.85)
  if (h < 0.35) return guarda.clone().lerp(fora, suave(h / 0.35))
  if (h < GANCHO_ACERTA + 0.05) {
    // o arco do gancho: quadrático, de fora até o queixo, saindo de uma vez
    const u = 1 - (1 - (h - 0.35) / (GANCHO_ACERTA + 0.05 - 0.35)) ** 2
    return fora.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(meio, 2 * u * (1 - u)).addScaledVector(alvo, u * u)
  }
  return alvo.clone().lerp(guarda, suave((h - GANCHO_ACERTA - 0.05) / (1 - GANCHO_ACERTA - 0.05)))
}

/** O oito de lado no instante `t` (1 a -1, positivo pra esquerda de quem bate): pra vítima acompanhar com a cabeça. */
function ladoDoOito(t: number): number {
  if (t < AQUECE_DE || t >= ROLA_ATE) return 0
  const amplitude = t < ROLA_DE ? 0.45 + 0.55 * sobe(t, AQUECE_DE, AQUECE_DE + 900) : 1
  return amplitude * Math.sin(anguloDoCorpo(t))
}

/** A pose de quem bate no instante `t`. */
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
  if (t >= AQUECE_DE && t < ROLA_DE) {
    // o aquecimento: o oito crescendo, o tronco carregando de um lado pro outro sem soltar o golpe, e os pés saltitando
    const phi = anguloDoCorpo(t)
    lado = ladoDoOito(t)
    giro = 0.25 * Math.sin(phi + 0.5) * Math.abs(lado)
    agacha = 0.08 - 0.025 * Math.sin(2 * phi) - 0.012 * Math.abs(Math.sin(2 * phi + Math.PI / 2))
  } else if (t >= ROLA_DE && t < ROLA_ATE) {
    const phi = anguloNoInstante(t)
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
      if (k % 2 === 0) maoEsq = maoNoGancho(d, 1, h, GUARDA_ESQ)
      else maoDir = maoNoGancho(d, -1, h, GUARDA_DIR)
    })
  } else if (t >= ROLA_ATE) {
    // a carga: agachado bem baixo, inclinado pra direita e torcido, o punho direito puxado; depois o gancho final
    // com o corpo todo, passando do ponto, e a volta pra guarda
    const carga = sobe(t, ROLA_ATE, ROLA_ATE + 120)
    const solta = fracao(t, CARGA_ATE, ACERTO_FINAL) ** 2
    const segue = sobe(t, ACERTO_FINAL, ACERTO_FINAL + 180)
    lado = -0.9 * carga * (1 - solta) + 0.45 * solta * (1 - 0.6 * segue)
    giro = -0.5 * carga * (1 - solta) + 0.6 * solta
    agacha = 0.08 + 0.05 * carga * (1 - solta)
    avanco = 0.06 + 0.07 * solta
    const fora = new THREE.Vector3(-0.27, 0.5, -0.02)
    const alvo = new THREE.Vector3(0.04, d.queixo.y, d.queixo.z + 0.1)
    const meio = new THREE.Vector3(-0.2, d.queixo.y + 0.04, d.queixo.z * 0.85)
    if (t < CARGA_ATE) maoDir = GUARDA_DIR.clone().lerp(fora, carga)
    else if (t < ACERTO_FINAL) maoDir = fora.clone().multiplyScalar((1 - solta) * (1 - solta)).addScaledVector(meio, 2 * solta * (1 - solta)).addScaledVector(alvo, solta * solta)
    else maoDir = alvo.clone().lerp(GUARDA_DIR, sobe(t, ACERTO_FINAL + 140, FIM - 200))
    if (t >= ROLA_ATE + 120 && t < CARGA_ATE) {
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

/**
 * A vítima reage (pedido do usuário). No aquecimento: levanta a guarda com medo, treme, recua aos poucos e acompanha o
 * balanço com a cabeça. Nos ganchos: a cabeça vai pro lado numa mola, o corpo gira junto, a guarda cai, ela cambaleia
 * pro lado de cada golpe e os joelhos vão cedendo. Na parada e na carga, tonta, o tronco rodando devagar.
 */
function posarVitima(d: Dempsey, t: number, dt: number, agora: number) {
  const { vitima } = d
  if (dt > 0) {
    const aceleracao = -200 * d.balanco - 13 * d.velocidade
    d.velocidade += aceleracao * dt
    d.balanco += d.velocidade * dt
  }
  const forca = d.balanco * realismo()
  const medo = sobe(t, AQUECE_DE + 150, AQUECE_DE + 550)
  // a guarda sobe no aquecimento e cai com os ganchos (dois bastam pra abrir)
  const guarda = medo * Math.max(0, 1 - 0.5 * d.ganchosDados)
  // tonta: depois do terceiro gancho, o tronco roda devagar
  const tonta = Math.min(1, Math.max(0, d.ganchosDados - 2) / 3)
  const roda = (agora / 260) % (Math.PI * 2)
  // os joelhos cedem um pouco a cada gancho
  const cede = Math.min(0.07, 0.012 * d.ganchosDados) * sobe(t, ROLA_DE, ROLA_DE + 300)
  // no aquecimento, recua uns passos curtos de medo
  const recuoDoMedo = 0.05 * medo * fracao(t, AQUECE_DE, ROLA_DE)
  vitima.position
    .copy(d.vitimaBase)
    .addScaledVector(d.zq, (d.recuo + recuoDoMedo) * d.vitimaEscala)
    .addScaledVector(d.xq, (d.deLado + 0.05 * forca * Math.sign(d.empurrao.dot(d.xq) || 1)) * d.vitimaEscala)
    .addScaledVector(CIMA, -cede * d.vitimaEscala)
  // o corpo gira com o golpe; no aquecimento, a cabeça segue o oito de quem vai bater
  vitima.rotation.y = d.vitimaGiro + 0.35 * forca * Math.sign(d.empurrao.dot(d.xq) || 1) + 0.12 * tonta * Math.sin(roda)
  vitima.updateWorldMatrix(true, true)
  const ladoDaVitima = LADO.clone().transformDirection(vitima.matrixWorld)
  const frenteDaVitima = FRENTE.clone().transformDirection(vitima.matrixWorld)
  const tronco = ossoRPG(vitima, 'Spine')
  const peito = ossoRPG(vitima, 'Spine2')
  const pescoco = ossoRPG(vitima, 'Neck')
  // os braços: soltos e caídos quando a guarda abre, abertos quando ela está tonta
  corpoLargado(vitima, { pratras: (0.1 + 0.3 * Math.abs(forca)) * (1 - guarda), abertura: (0.15 + 0.3 * Math.abs(forca) + 0.3 * tonta) * (1 - guarda), arco: 0 }, agora)
  // o medo: o tronco pra trás, encolhido, tremendo em dois
  if (medo > 0) {
    const desenho = Math.floor(agora / QUADRO_EM_DOIS)
    const treme = (acaso(desenho) - 0.5) * 0.06 * guarda
    if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(ladoDaVitima, -0.16 * guarda + treme))
    // a cabeça acompanha o balanço de quem vai bater
    if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(CIMA, 0.35 * ladoDoOito(t) * guarda))
  }
  if (d.empurrao.lengthSq() > 0) {
    // girar em volta de (cima × empurrão) leva o alto da peça pro lado do empurrão
    const eixo = new THREE.Vector3().crossVectors(CIMA, d.empurrao).normalize()
    if (tronco) girarOssoNoMundo(tronco, new THREE.Quaternion().setFromAxisAngle(eixo, 0.15 * forca))
    if (peito) girarOssoNoMundo(peito, new THREE.Quaternion().setFromAxisAngle(eixo, 0.3 * forca))
    if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(eixo, 0.75 * forca))
  }
  if (tonta > 0) {
    // tonta: o tronco descreve um círculo pequeno, a cabeça caindo
    const rodaDoTronco = new THREE.Vector3().addScaledVector(ladoDaVitima, Math.cos(roda)).addScaledVector(frenteDaVitima, Math.sin(roda))
    if (peito) girarOssoNoMundo(peito, new THREE.Quaternion().setFromAxisAngle(rodaDoTronco, 0.12 * tonta))
    if (pescoco) girarOssoNoMundo(pescoco, new THREE.Quaternion().setFromAxisAngle(ladoDaVitima, 0.25 * tonta))
  }
  // a guarda de medo: os braços cobrindo o rosto
  if (guarda > 0.01) {
    levarBracoAte(vitima, 'Left', vitima.localToWorld(MEDO_ESQ.clone()), guarda)
    levarBracoAte(vitima, 'Right', vitima.localToWorld(MEDO_DIR.clone()), guarda)
  }
  // os pés ficam no chão onde estavam (andando junto com o recuo): os joelhos dobram quando o corpo cede
  const andou = vitima.position.clone().sub(d.vitimaBase).setY(0)
  for (const pe of d.pesDaVitima) levarPernaAte(vitima, pe.lado, pe.base.clone().add(andou), Math.min(1, cede * 20 + medo * 0.5))
}

function avisar(d: Dempsey, t: number) {
  const queixoNoMundo = () => d.peca.localToWorld(d.queixo.clone())
  if (primeiraVez(d, 'entra', t, ENTRA_ATE * 0.6)) {
    const cabeca = ossoRPG(d.peca, 'Head')
    d.avisos.aoEntrar(cabeca ? cabeca.getWorldPosition(new THREE.Vector3()) : d.peca.localToWorld(new THREE.Vector3(0, 0.62, 0.05)))
  }
  if (t >= AQUECE_DE && t < ROLA_ATE) {
    const meias = Math.floor(anguloDoCorpo(t) / Math.PI) + (t >= ROLA_DE ? VOLTAS_DO_AQUECIMENTO * 2 : 0)
    if (meias > d.meiasVoltas) {
      d.meiasVoltas = meias
      d.avisos.aoBalancar()
    }
  }
  if (primeiraVez(d, 'ganchos', t, ROLA_DE)) d.avisos.aoComecarOsGanchos(queixoNoMundo())
  if (t >= ROLA_DE && t < ROLA_ATE) {
    const phi = anguloNoInstante(t)
    while (d.ganchosDados < GANCHOS.length && phi >= GANCHOS[d.ganchosDados] - GANCHO_ANTES + GANCHO_ACERTA * (GANCHO_ANTES + GANCHO_DEPOIS)) {
      const numero = d.ganchosDados++
      // o gancho de esquerda (de quem bate) joga a cabeça pra direita dele, e o de direita pra esquerda
      const deQual = numero % 2 === 0 ? 1 : -1
      d.empurrao.copy(d.xq).multiplyScalar(-deQual)
      d.balanco = 0
      d.velocidade = 8 + numero * 0.8
      d.recuo += 0.022
      // cambaleia pro lado do golpe e volta um pouco no seguinte
      d.deLado = -deQual * 0.04
      d.avisos.aoGancho(numero, queixoNoMundo())
    }
    if (primeiraVez(d, 'parada', t, ROLA_DE + U_DA_PARADA * ROLA_MS)) d.avisos.aoParar(queixoNoMundo())
  }
  if (primeiraVez(d, 'carga', t, ROLA_ATE + 120)) {
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
    // o rastro de luz do oito, com a cabeça já no lugar deste quadro (no aquecimento e nos ganchos)
    const cabeca = t >= AQUECE_DE && t < ROLA_ATE ? ossoRPG(d.peca, 'Head') : undefined
    if (cabeca) d.avisos.aoRolar(cabeca.getWorldPosition(new THREE.Vector3()))
    if (!d.vitimaSolta && d.vitima.parent) posarVitima(d, t, dt, agora)
  }
}
