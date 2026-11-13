import * as THREE from 'three'
import { escolhaDaParte, partesDaPeca, type Peca } from '../../conta/personalizacao'
import { tocarSom } from '../../som/sons'
import { esconderCavaleiro } from '../combate/efeitosDasArmas'
import { spriteDeBrilho } from '../combate/poderes'
import { cajadoQueVoa, pecasDoEquipamento, vestirPeca, type MateriaisDaPeca, type PedacoQueVoa } from '../pecas/equipamentos'
import { ESCALA_POR_TIPO } from '../pecas/geometricas'
import { buildPecaRPG, desligarClipesRPG, modelosRPG } from '../pecas/modelosRPG'
import { girarOssoNoMundo, levarBracoAte, levarPernaAte, ossoRPG } from '../pecas/ossos'
import { deslocarRPG, diferencaAngular, pararRPG, rumoDeDescanso, virarRPG } from './movimento'
import { adicionarPostura } from './posturas'

// A promoção com os equipamentos. A peça nova nasce sem eles, e cada um surge em volta dela, voa e se prende na sua
// parte. No cavalo é uma cena maior: o equipamento do cavaleiro voa pro próprio peão, um cavalo sem ninguém chega a
// galope de fora do tabuleiro, recebe o dele (armadura, sela, cabresto), e o peão monta: pé no estribo, mãos na
// sela, impulso, a perna direita passa por cima e ele senta.

const suave = (t: number) => t * t * (3 - 2 * t)
const entre = (t: number, de: number, ate: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)))
const CIMA = new THREE.Vector3(0, 1, 0)

/** As partes do cavalo; o resto do equipamento do cavalo é do cavaleiro. */
const DA_MONTARIA = ['cavalo', 'sela', 'cabresto']

/** O que a peça veste fora do padrão, parte por parte (a habilidade especial não é equipamento: não voa). */
export function partesVestidas(tipo: Peca, escolhas: Record<string, Record<string, string>>): [string, string][] {
  return partesDaPeca(tipo)
    .filter((parte) => parte.parte !== 'golpe')
    .map((parte): [string, string] => [parte.parte, escolhaDaParte(escolhas, tipo, parte)])
    .filter(([parte, opcao]) => opcao !== partesDaPeca(tipo).find((p) => p.parte === parte)?.opcoes[0])
}
export const doCavaleiro = (partes: [string, string][]) => partes.filter(([parte]) => !DA_MONTARIA.includes(parte))
export const daMontaria = (partes: [string, string][]) => partes.filter(([parte]) => DA_MONTARIA.includes(parte))

/** As malhas da peça (vestida `porParte`) que são dessas partes. */
function malhasDasPartes(peca: THREE.Object3D, partes: string[]): THREE.Object3D[] {
  const malhas: THREE.Object3D[] = []
  peca.traverse((obj) => {
    if (typeof obj.userData.parte === 'string' && partes.includes(obj.userData.parte)) malhas.push(obj)
  })
  return malhas
}

/** Some com esses equipamentos da peça, até eles chegarem voando. */
export function esconderPartes(peca: THREE.Object3D, partes: [string, string][]) {
  for (const malha of malhasDasPartes(
    peca,
    partes.map(([parte]) => parte),
  ))
    malha.visible = false
}

/** O osso do esqueleto do Mixamo (o corpo) ou do cavalo (Cavalo, Pescoco…). */
const osso = (peca: THREE.Object3D, nome: string) => ossoRPG(peca, nome) ?? peca.getObjectByName(nome)

/** O tamanho do modelo no mundo: os equipamentos são medidos no espaço do modelo. */
function escalaDoModelo(peca: THREE.Object3D): number {
  let corpo: THREE.Object3D | undefined
  peca.traverse((obj) => {
    if (!corpo && obj instanceof THREE.SkinnedMesh && obj.userData.material === 'Corpo') corpo = obj
  })
  return (corpo ?? peca).getWorldScale(new THREE.Vector3()).x
}

export interface Encaixe {
  cena: THREE.Object3D
  /** Quem recebe (vestido `porParte`). */
  peca: THREE.Object3D
  /** De que peça é o equipamento (no peão que vai montar, é o do cavalo). */
  tipo: string
  partes: [string, string][]
  materiais: MateriaisDaPeca
  cor: THREE.ColorRepresentation
  continua: () => boolean
  aoTerminar: () => void
}

const SURGE_MS = 300
const PRIMEIRO_VOO_MS = 420
const ENTRE_VOOS_MS = 170
const VOO_MS = 640

/** Cada equipamento surge em volta da peça, brilhando, voa até a parte dela e se prende ali. */
export function encaixarEquipamentos(e: Encaixe) {
  const { cena, peca } = e
  esconderPartes(peca, e.partes)
  interface Voo {
    parte: string
    pedaco: PedacoQueVoa
    brilho: THREE.Sprite
    saida: THREE.Vector3
    giro: number
    chegou: boolean
  }
  const voos: Voo[] = []
  const mostrarAoChegar = new Map<string, (() => void)[]>()
  for (const [parte, opcao] of e.partes) {
    let pedacos: PedacoQueVoa[] = pecasDoEquipamento(e.tipo, parte, opcao, e.materiais)
    if (parte === 'arma' && opcao === 'cajado') {
      // o cajado de sempre vem no modelo: some da mão até a cópia chegar
      const cajado = cajadoQueVoa(peca, e.tipo)
      if (cajado) {
        pedacos = [cajado.pedaco]
        const mostrar = cajado.esconder()
        mostrarAoChegar.set(parte, [mostrar])
      }
    }
    for (const pedaco of pedacos) voos.push({ parte, pedaco, brilho: spriteDeBrilho(e.cor, 0.5), saida: new THREE.Vector3(), giro: Math.random() * Math.PI * 2, chegou: false })
  }
  const mostrar = (parte: string) => {
    for (const malha of malhasDasPartes(peca, [parte])) malha.visible = true
    for (const volta of mostrarAoChegar.get(parte) ?? []) volta()
    mostrarAoChegar.delete(parte)
  }
  if (voos.length === 0) {
    for (const [parte] of e.partes) mostrar(parte)
    e.aoTerminar()
    return
  }

  const escala = escalaDoModelo(peca)
  const centro = peca.getWorldPosition(new THREE.Vector3())
  voos.forEach((voo, i) => {
    const angulo = (i / voos.length) * Math.PI * 2 + Math.random() * 0.3
    voo.saida.set(centro.x + Math.cos(angulo) * 0.95, centro.y + 0.35 + Math.random() * 0.5, centro.z + Math.sin(angulo) * 0.95)
    voo.pedaco.objeto.position.copy(voo.saida)
    voo.pedaco.objeto.scale.setScalar(0.001)
    voo.brilho.position.copy(voo.saida)
    cena.add(voo.pedaco.objeto, voo.brilho)
  })
  tocarSom('equipamento:surge')

  const faltam = new Map<string, number>()
  for (const voo of voos) faltam.set(voo.parte, (faltam.get(voo.parte) ?? 0) + 1)
  const limpar = () => {
    for (const voo of voos) {
      voo.pedaco.objeto.removeFromParent()
      voo.brilho.removeFromParent()
      voo.brilho.material.dispose()
    }
  }
  const inicio = performance.now()
  const alvo = new THREE.Vector3()
  const quadro = (agora: number) => {
    if (!e.continua()) {
      limpar()
      for (const [parte] of e.partes) mostrar(parte)
      return
    }
    const t = agora - inicio
    peca.updateMatrixWorld(true)
    voos.forEach((voo, i) => {
      if (voo.chegou) return
      const { objeto } = voo.pedaco
      const surgiu = suave(entre(t, i * 40, i * 40 + SURGE_MS))
      const comeca = PRIMEIRO_VOO_MS + i * ENTRE_VOOS_MS
      const u = entre(t, comeca, comeca + VOO_MS)
      objeto.scale.setScalar(Math.max(0.001, escala * surgiu))
      voo.giro += 0.06 * (1 - u)
      objeto.rotation.set(0.3 * Math.sin(voo.giro), voo.giro, 0)
      // de onde surgiu até o osso, num arco por cima
      ;(osso(peca, voo.pedaco.osso) ?? peca).getWorldPosition(alvo)
      const k = suave(u)
      const meio = voo.saida.clone().lerp(alvo, 0.5).addScaledVector(CIMA, 0.4)
      objeto.position.copy(voo.saida).multiplyScalar((1 - k) * (1 - k)).addScaledVector(meio, 2 * k * (1 - k)).addScaledVector(alvo, k * k)
      voo.brilho.position.copy(objeto.position)
      voo.brilho.material.opacity = 0.9 * surgiu * (1 - u * 0.6)
      if (u >= 1) {
        voo.chegou = true
        objeto.removeFromParent()
        voo.brilho.removeFromParent()
        voo.brilho.material.dispose()
        tocarSom('encaixe')
        const resto = (faltam.get(voo.parte) ?? 1) - 1
        faltam.set(voo.parte, resto)
        if (resto === 0) mostrar(voo.parte)
      }
    })
    if (voos.every((voo) => voo.chegou)) {
      window.setTimeout(() => e.continua() && e.aoTerminar(), 200)
      return
    }
    requestAnimationFrame(quadro)
  }
  requestAnimationFrame(quadro)
}

/** O peão que vai montar no cavalo: o próprio modelo do peão, vestido com o equipamento do cavaleiro (sem a montaria,
 * que é do cavalo), sem a katana, que cavaleiro não usa. Os equipamentos começam escondidos: eles chegam voando. */
export function peaoCavaleiro(cor: 'w' | 'b', escolhasDoCavalo: Record<string, string>, materiais: MateriaisDaPeca): THREE.Group | null {
  const modelo = modelosRPG.p
  if (!modelo) return null
  const grupo = buildPecaRPG(modelo, cor)
  const doCavaleiroSo = Object.fromEntries(Object.entries(escolhasDoCavalo).filter(([parte]) => !DA_MONTARIA.includes(parte)))
  vestirPeca(grupo, 'n', doCavaleiroSo, materiais, { porParte: true })
  grupo.traverse((obj) => {
    if (['EspadaLamina', 'EspadaCabo', 'CaboBainha', 'BainhaKatana'].includes(obj.userData.material as string)) obj.visible = false
  })
  delete grupo.userData.espadaRPG
  grupo.userData.tipo = 'p'
  grupo.userData.cor = cor
  // nada de gesto no meio da cena
  grupo.userData.proximoGestoRPG = Infinity
  grupo.rotation.y = cor === 'w' ? Math.PI : 0
  grupo.scale.setScalar(ESCALA_POR_TIPO.p ?? 1)
  return grupo
}

/** Os materiais da peça trocados por cópias transparentes, pra ela aparecer aos poucos; `restaurar` devolve os de
 * sempre (os de todas as peças da mesma cor). */
function materiaisQueSomem(peca: THREE.Object3D) {
  const originais: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  const copias: THREE.Material[] = []
  peca.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    originais.push([obj, obj.material])
    const copiar = (m: THREE.Material) => {
      const copia = m.clone()
      copia.transparent = true
      copias.push(copia)
      return copia
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(copiar) : copiar(obj.material)
  })
  return {
    opacidade: (valor: number) => copias.forEach((m) => (m.opacity = valor)),
    restaurar: () => {
      for (const [malha, material] of originais) malha.material = material
      copias.forEach((m) => m.dispose())
    },
  }
}

export interface Montaria {
  cena: THREE.Object3D
  /** O cavalo da casa (a peça nova, vestida `porParte`), por enquanto escondido. */
  cavalo: THREE.Group
  /** O peão já com o equipamento do cavaleiro, na casa. */
  peao: THREE.Group
  destino: { x: number; z: number }
  /** O que voa pro cavalo depois que ele para. */
  partesDaMontaria: [string, string][]
  materiais: MateriaisDaPeca
  cor: THREE.ColorRepresentation
  continua: () => boolean
  aoTerminar: () => void
}

const GALOPE = 2.6
const RITMO_DO_GALOPE = 2.1
/** O peão fica desse lado do cavalo (a esquerda dele), a essa distância, pra montar. */
const AO_LADO = 0.42

/** O cavalo chega a galope de fora do tabuleiro, para na casa, recebe a montaria e o peão monta. */
export function cavaloChegaEMontam(m: Montaria) {
  const { cavalo, peao, destino } = m
  const trazerCavaleiro = esconderCavaleiro(cavalo)
  esconderPartes(cavalo, m.partesDaMontaria)
  cavalo.userData.proximoGestoRPG = Infinity
  cavalo.visible = true
  const transparente = materiaisQueSomem(cavalo)
  transparente.opacidade(0)

  // vem de fora do tabuleiro, além da borda da casa, pelo lado de dentro, e faz a curva pra entrar nela
  const fora = Math.sign(destino.z || 1) * 5
  const lado = destino.x >= 0 ? -1 : 1
  const p0 = new THREE.Vector2(destino.x + lado * 2.6, fora)
  const p1 = new THREE.Vector2(destino.x + lado * 0.3, fora)
  const p2 = new THREE.Vector2(destino.x, destino.z)
  const naCurva = (u: number) => p0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(p1, 2 * u * (1 - u)).addScaledVector(p2, u * u)
  const rumoFinal = Math.atan2(p2.x - p1.x, p2.y - p1.y)
  let comprimento = 0
  for (let i = 1; i <= 20; i++) comprimento += naCurva(i / 20).distanceTo(naCurva((i - 1) / 20))
  const duracao = (comprimento / GALOPE) * 1000 * 1.25
  const inicio = naCurva(0)
  cavalo.position.set(inicio.x, cavalo.position.y, inicio.y)
  const acoes = cavalo.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const galope = acoes.Walk
  if (galope) {
    desligarClipesRPG(acoes, galope, 0.2)
    galope.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(RITMO_DO_GALOPE).play()
  }
  tocarSom('cavalo:chega')

  // o peão sai da frente: vai pro lado esquerdo de onde o cavalo vai parar e vira pra ele
  const esquerda = new THREE.Vector3(Math.cos(rumoFinal), 0, -Math.sin(rumoFinal))
  const pontoDeMontar = { x: destino.x + esquerda.x * AO_LADO * cavalo.scale.x, z: destino.z + esquerda.z * AO_LADO * cavalo.scale.x }
  const deFrenteProCavalo = Math.atan2(-esquerda.x, -esquerda.z)
  let prontos = 0
  const pronto = () => {
    if (++prontos === 2 && m.continua()) receberMontaria()
  }
  deslocarRPG(peao, { x: peao.position.x, z: peao.position.z }, pontoDeMontar, () => {
    if (!m.continua()) return
    virarRPG(peao, deFrenteProCavalo, () => {
      pararRPG(peao)
      pronto()
    })
  })

  const comeco = performance.now()
  const correr = (agora: number) => {
    if (!m.continua()) {
      transparente.restaurar()
      trazerCavaleiro()
      return
    }
    const t = Math.min(1, (agora - comeco) / duracao)
    // acelera no começo e freia no fim, como quem chega
    const u = t < 0.7 ? t / 0.7 * 0.8 : 0.8 + 0.2 * (1 - Math.pow(1 - (t - 0.7) / 0.3, 2))
    const aqui = naCurva(u)
    const adiante = naCurva(Math.min(1, u + 0.02))
    cavalo.position.set(aqui.x, cavalo.position.y, aqui.y)
    if (adiante.distanceTo(aqui) > 1e-4) cavalo.rotation.y = Math.atan2(adiante.x - aqui.x, adiante.y - aqui.y)
    transparente.opacidade(Math.min(1, t / 0.25))
    if (galope) galope.setEffectiveTimeScale(RITMO_DO_GALOPE * (t < 0.7 ? 1 : Math.max(0.35, 1 - (t - 0.7) / 0.3)))
    if (t < 1) {
      requestAnimationFrame(correr)
      return
    }
    cavalo.position.set(destino.x, cavalo.position.y, destino.z)
    cavalo.rotation.y = rumoFinal
    transparente.restaurar()
    pararRPG(cavalo)
    pronto()
  }
  requestAnimationFrame(correr)

  function receberMontaria() {
    encaixarEquipamentos({
      cena: m.cena,
      peca: cavalo,
      tipo: 'n',
      partes: m.partesDaMontaria,
      materiais: m.materiais,
      cor: m.cor,
      continua: m.continua,
      aoTerminar: montar,
    })
  }

  function montar() {
    montarNoCavalo(peao, cavalo, m.continua, () => {
      // montado: quem fica é o cavaleiro do próprio cavalo, no mesmo lugar e na mesma pose
      trazerCavaleiro()
      peao.removeFromParent()
      const clarao = spriteDeBrilho(m.cor, 0.9)
      const quadril = osso(cavalo, 'Hips')
      ;(quadril ?? cavalo).getWorldPosition(clarao.position)
      m.cena.add(clarao)
      const nasce = performance.now()
      const apagar = (agora: number) => {
        const t = (agora - nasce) / 350
        clarao.material.opacity = Math.max(0, 1 - t)
        if (t < 1) requestAnimationFrame(apagar)
        else {
          clarao.removeFromParent()
          clarao.material.dispose()
        }
      }
      requestAnimationFrame(apagar)
      // e vira pro inimigo, como toda peça parada
      virarRPG(cavalo, rumoDeDescanso(cavalo), () => {
        pararRPG(cavalo)
        cavalo.userData.proximoGestoRPG = performance.now() + 15000
        if (m.continua()) m.aoTerminar()
      })
    })
  }
}

const OSSOS_DE_MONTAR = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg']
/** Pé esquerdo no estribo e mãos na sela; o impulso com a perna direita passando por cima; sentar. */
const PE_NO_ESTRIBO_MS = 450
const POR_CIMA_MS = 1200
const SENTADO_MS = 1600
const MONTADO_MS = 1750

/**
 * O peão sobe no cavalo como gente: de frente pro flanco esquerdo, põe o pé esquerdo no estribo e as mãos na frente
 * da sela, toma impulso, o corpo sobe e gira pra frente enquanto a perna direita passa por cima da garupa, e ele senta
 * onde o cavaleiro do modelo senta, com os pés nos estribos e as mãos nas rédeas. Os pontos saem dos ossos do
 * cavaleiro escondido no cavalo, então valem pra qualquer tamanho. O peão vai encolhendo até o tamanho do cavaleiro.
 */
function montarNoCavalo(peao: THREE.Group, cavalo: THREE.Group, continua: () => boolean, aoMontar: () => void) {
  const rumoInicial = peao.rotation.y
  const escalaInicial = peao.scale.x
  const escalaFinal = cavalo.scale.x
  const frente = new THREE.Vector3(Math.sin(cavalo.rotation.y), 0, Math.cos(cavalo.rotation.y))
  const esquerda = new THREE.Vector3(Math.cos(cavalo.rotation.y), 0, -Math.sin(cavalo.rotation.y))
  const s = escalaFinal
  peao.updateMatrixWorld(true)
  const quadrilDoPeao = osso(peao, 'Hips')
  if (!quadrilDoPeao) {
    aoMontar()
    return
  }
  const quadrilNoChao = quadrilDoPeao.getWorldPosition(new THREE.Vector3())
  let peDireitoNoChao: THREE.Vector3 | null = null
  const ponto = (nome: string) => (osso(cavalo, nome) ?? cavalo).getWorldPosition(new THREE.Vector3())
  const curva = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, u: number) =>
    a.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(c, u * u)
  let impulso = false
  const inicio = performance.now()
  adicionarPostura(peao, OSSOS_DE_MONTAR, (agora) => {
    if (!continua()) return false
    const t = agora - inicio
    cavalo.updateMatrixWorld(true)
    const sela = ponto('Hips')
    const estriboEsq = ponto('LeftFoot')
    const estriboDir = ponto('RightFoot')
    const redeaEsq = ponto('LeftHand')
    const redeaDir = ponto('RightHand')
    const pomo = sela.clone().addScaledVector(frente, 0.12 * s).addScaledVector(CIMA, 0.07 * s)
    const porCima = suave(entre(t, PE_NO_ESTRIBO_MS, POR_CIMA_MS))
    const sentando = suave(entre(t, POR_CIMA_MS, SENTADO_MS))
    if (t >= PE_NO_ESTRIBO_MS && !impulso) {
      impulso = true
      tocarSom('montar')
    }

    // o corpo: gira pra frente do cavalo, encolhe pro tamanho do cavaleiro e o quadril sobe num arco até a sela
    peao.rotation.y = rumoInicial + diferencaAngular(rumoInicial, cavalo.rotation.y) * suave(entre(t, PE_NO_ESTRIBO_MS, POR_CIMA_MS * 0.95))
    peao.scale.setScalar(THREE.MathUtils.lerp(escalaInicial, escalaFinal, suave(entre(t, PE_NO_ESTRIBO_MS, SENTADO_MS))))
    const acimaDaSela = sela.clone().addScaledVector(CIMA, 0.12 * s).addScaledVector(esquerda, 0.03 * s)
    const meioDoArco = quadrilNoChao.clone().lerp(acimaDaSela, 0.5).addScaledVector(CIMA, 0.16 * s)
    const quadril =
      t < PE_NO_ESTRIBO_MS ? quadrilNoChao : t < POR_CIMA_MS ? curva(quadrilNoChao, meioDoArco, acimaDaSela, porCima) : acimaDaSela.clone().lerp(sela, sentando)
    peao.updateMatrixWorld(true)
    peao.position.add(quadril.clone().sub(quadrilDoPeao.getWorldPosition(new THREE.Vector3())))
    peao.updateMatrixWorld(true)

    // o tronco inclina pra frente no impulso e volta a ficar reto sentado
    const inclina = 0.4 * Math.sin(Math.PI * porCima) * (1 - sentando)
    if (inclina > 1e-3) {
      const eixo = new THREE.Vector3(1, 0, 0).transformDirection(peao.matrixWorld)
      const giro = new THREE.Quaternion().setFromAxisAngle(eixo, inclina / 2)
      for (const nome of ['Spine', 'Spine1']) {
        const o = ossoRPG(peao, nome)
        if (o) girarOssoNoMundo(o, giro)
      }
    }

    // as mãos vão na frente da sela; sentado, nas rédeas
    const pegar = suave(entre(t, 0, 260))
    levarBracoAte(peao, 'Left', pomo.clone().addScaledVector(esquerda, 0.04 * s).lerp(redeaEsq, sentando), pegar)
    levarBracoAte(peao, 'Right', pomo.clone().addScaledVector(esquerda, -0.04 * s).lerp(redeaDir, sentando), pegar)

    // o pé esquerdo sobe no estribo e fica nele
    levarPernaAte(peao, 'Left', estriboEsq, suave(entre(t, 80, PE_NO_ESTRIBO_MS)))

    // a perna direita passa por cima da garupa, alta e por trás, até o estribo do outro lado
    if (t >= PE_NO_ESTRIBO_MS) {
      peDireitoNoChao ??= (ossoRPG(peao, 'RightFoot') ?? peao).getWorldPosition(new THREE.Vector3())
      const garupa = sela.clone().addScaledVector(frente, -0.3 * s).addScaledVector(CIMA, 0.38 * s)
      const pe = t < POR_CIMA_MS ? curva(peDireitoNoChao, garupa, estriboDir, porCima) : estriboDir
      levarPernaAte(peao, 'Right', pe, 1)
    }
    if (t < MONTADO_MS) return true
    aoMontar()
    return false
  })
}
