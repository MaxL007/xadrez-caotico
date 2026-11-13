import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { materiaisPorFaccao, materialCaboKatana, materialCoroa, materialLaminaEspada, materialSaya } from './materiais'

// As peças RPG (modelos .glb com esqueleto e animações): o carregamento, os materiais, a espada do peão e os clipes tocados uma vez ou em sequência.

// ---------------------------------------------------------------------------
// Peças "RPG": cada tipo pode vir de um modelo .glb externo (malha + esqueleto + animações, feito
// no Blender — ver scripts/blender/importar_animacoes_mixamo.py) em vez de só primitivas
// geométricas. Todas usam o MESMO esqueleto (o do Mixamo, montado a partir do peão) e as mesmas
// animações de base; cada tipo muda os acessórios e tem os próprios golpes. Carregados uma vez só,
// em segundo plano, e reaproveitados (clonados) pra cada peça no tabuleiro. Se um arquivo não
// existir ou falhar ao carregar, aquele tipo cai de volta pro modelo geométrico de sempre — nunca
// quebra o tabuleiro por causa disso.
//
// Clipes que o jogo usa (nomes vindos do Blender):
//   Parado              — em pé normal; a pose de descanso, tocando o tempo todo por baixo
//   Gesto1, Gesto2…     — movimentos tocados de vez em quando, num intervalo sorteado por peça
//   Walk                — andando no lugar enquanto a peça desliza de casa em casa
//   Attack1, Attack2…   — os golpes DESTA peça (nenhum se repete entre tipos), sorteados na captura
//   Mortal, MortalTombo — o mortal pra trás do gesto amigável (às vezes com tombo no fim); no
//                         cavalo, um salto e um corcoveio que joga o cavaleiro pra cima
//   Desembainhar, Embainhar — só o peão, o único com espada: ele saca antes do golpe e dos gestos e
//                         guarda depois (a espada faz parte do modelo; ver EspadaRPG)
// O cavalo é um cavaleiro (o mesmo esqueleto das outras peças) montado num cavalo com ossos próprios.
// ---------------------------------------------------------------------------
interface ModeloRPG {
  cena: THREE.Object3D
  clipes: THREE.AnimationClip[]
}
const ARQUIVOS_MODELO_RPG: Record<string, string> = {
  p: 'peao_rpg.glb',
  r: 'torre_rpg.glb',
  n: 'cavalo_rpg.glb',
  b: 'bispo_rpg.glb',
  q: 'dama_rpg.glb',
  k: 'rei_rpg.glb',
}
// por tipo: undefined = ainda não tentou, null = tentou e falhou
export const modelosRPG: Record<string, ModeloRPG | null | undefined> = {}
let carregamentoModelosRPG: Promise<void> | null = null

/** Dispara (uma única vez) o carregamento dos modelos RPG de todas as peças; chama `aoResolver`
 * quando todos terminarem (com sucesso ou falha) — usado pra re-sincronizar o tabuleiro e trocar
 * as peças já desenhadas (geométricas) pelos modelos novos assim que chegarem. */
export function garantirModelosRPG(aoResolver: () => void) {
  if (!carregamentoModelosRPG) {
    const loader = new GLTFLoader()
    carregamentoModelosRPG = Promise.all(
      Object.entries(ARQUIVOS_MODELO_RPG).map(
        ([tipo, arquivo]) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${import.meta.env.BASE_URL}models/${arquivo}`,
              (gltf) => {
                modelosRPG[tipo] = { cena: gltf.scene, clipes: gltf.animations }
                resolve()
              },
              undefined,
              () => {
                // sem modelo (ou falhou) — esse tipo segue com a peça geométrica normal
                modelosRPG[tipo] = null
                resolve()
              },
            )
          }),
      ),
    ).then(() => undefined)
  }
  carregamentoModelosRPG.then(aoResolver)
}

/** Intervalo (ms) entre um gesto e outro de cada peça parada — sorteado entre os dois valores pra
 * cada peça ter o próprio ritmo: a maior parte do tempo elas ficam só em pé, e de vez em quando
 * uma ou outra se mexe. */
const INTERVALO_GESTO_MIN_MS = 15000
const INTERVALO_GESTO_MAX_MS = 40000

export function sortearProximoGesto(agora: number): number {
  return agora + INTERVALO_GESTO_MIN_MS + Math.random() * (INTERVALO_GESTO_MAX_MS - INTERVALO_GESTO_MIN_MS)
}

/** Material da peça pelo nome do material que veio do Blender: Corpo/Detalhe/Brilho seguem a
 * facção, Coroa é dourado, e a katana do peão: lâmina de aço (EspadaLamina), cabo e tsuba com a
 * trama escura (EspadaCabo, e CaboBainha — o cabo que aparece pra fora da saya) e a saya laqueada
 * de preto (BainhaKatana). */
function materialRPG(nome: string | undefined, cor: 'w' | 'b'): THREE.Material {
  if (nome === 'Detalhe') return materiaisPorFaccao[cor].detalhe
  if (nome === 'Coroa') return materialCoroa
  if (nome === 'Brilho') return materiaisPorFaccao[cor].brilho
  if (nome === 'EspadaLamina') return materialLaminaEspada
  if (nome === 'EspadaCabo' || nome === 'CaboBainha') return materialCaboKatana
  if (nome === 'BainhaKatana') return materialSaya
  return materiaisPorFaccao[cor].armadura
}

/** Espada do peão RPG: as malhas da espada na mão (aparecem só desembainhada) e do cabo que fica
 * pra fora da bainha (some enquanto ela está na mão) e os instantes
 * (em segundos) em que ela sai da bainha no clipe "Desembainhar" e entra no "Embainhar" — gravados
 * no próprio modelo pelo Blender (scripts/blender/importar_animacoes_mixamo.py). */
/** Números que vêm do modelo (gravados pelo Blender): a velocidade com que o corpo avança no
 * andar e na corrida (unidades por segundo, no tamanho do modelo — o jogo desloca a peça nessa
 * velocidade, então os pés não escorregam) e, no cavalo, em que segundo do salto ele sai do chão
 * e pousa. */
export interface DadosRPG {
  velocidadeWalk: number
  velocidadeRun: number
  segundoDecola?: number
  segundoPousa?: number
}

export interface EspadaRPG {
  naMao: THREE.Object3D[]
  naBainha: THREE.Object3D[]
  segundoSaque: number
  segundoGuarda: number
  fora: boolean
}

/** Monta o grupo da peça a partir do modelo RPG carregado — mesmo "contrato" da peça geométrica
 * (posição/rotação/escala aplicadas por fora, em buildPieceMesh), mas com esqueleto de verdade em
 * vez de pivôs manuais: guarda o AnimationMixer em userData pro laço de render atualizar, e as
 * ações (clipes) nomeadas em userData.acoesRPG pra outras funções (ataque, etc.) poderem tocar.
 */
export function buildPecaRPG(modelo: ModeloRPG, cor: 'w' | 'b'): THREE.Group {
  const grupo = new THREE.Group()
  const clone = clonarComEsqueleto(modelo.cena) as THREE.Object3D

  // materiais PBR compartilhados (reaproveitados, não clonados, igual ao resto do tabuleiro). O
  // glTF divide a malha em uma primitiva por material, então cada uma vira um SkinnedMesh próprio
  // aqui, e o nome do material original (antes de trocar) diz qual material usar (ver materialRPG)
  // — e, no peão, quais malhas são a espada na mão e o cabo na bainha. O Blender grava nos
  // "extras" do esqueleto os números que o jogo precisa (velocidades do passo, tempos da espada e
  // do salto do cavalo) — o GLTFLoader põe em userData.
  const naMao: THREE.Object3D[] = []
  const naBainha: THREE.Object3D[] = []
  const extras: Record<string, number> = {}
  const malhas: THREE.SkinnedMesh[] = []
  clone.traverse((filho) => {
    for (const [chave, valor] of Object.entries(filho.userData)) {
      if (typeof valor === 'number') extras[chave] = valor
    }
    if (filho instanceof THREE.SkinnedMesh) malhas.push(filho)
  })
  for (const malha of malhas) {
    const nomeOriginal = Array.isArray(malha.material) ? undefined : malha.material?.name
    malha.material = materialRPG(nomeOriginal, cor)
    malha.userData.material = nomeOriginal
    malha.castShadow = true
    malha.receiveShadow = true
    if (nomeOriginal === 'EspadaLamina' || nomeOriginal === 'EspadaCabo') naMao.push(malha)
    if (nomeOriginal === 'CaboBainha') naBainha.push(malha)
  }
  grupo.add(clone)
  const dados: DadosRPG = {
    velocidadeWalk: extras.velocidade_walk ?? 0.68,
    velocidadeRun: extras.velocidade_run ?? 1.88,
    segundoDecola: extras.segundo_decola,
    segundoPousa: extras.segundo_pousa,
  }
  grupo.userData.dadosRPG = dados
  const segundoSaque = extras.segundo_saque
  const segundoGuarda = extras.segundo_guarda

  if (naMao.length && segundoSaque !== undefined && segundoGuarda !== undefined) {
    const espada: EspadaRPG = { naMao, naBainha, segundoSaque, segundoGuarda, fora: true }
    grupo.userData.espadaRPG = espada
    mostrarEspadaRPG(grupo, false)
  }

  const mixer = new THREE.AnimationMixer(clone)
  const acoes: Record<string, THREE.AnimationAction> = {}
  for (const clipe of modelo.clipes) {
    acoes[clipe.name] = mixer.clipAction(clipe)
  }
  acoes.Parado?.play()
  grupo.userData.mixer = mixer
  grupo.userData.acoesRPG = acoes
  grupo.userData.proximoGestoRPG = sortearProximoGesto(performance.now())

  return grupo
}

/** Espada na mão (true) ou guardada na bainha (false) — só o peão RPG tem espada. */
export function mostrarEspadaRPG(mesh: THREE.Object3D, naMao: boolean) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || espada.fora === naMao) return
  espada.fora = naMao
  for (const parte of espada.naMao) parte.visible = naMao
  for (const parte of espada.naBainha) parte.visible = !naMao
}

/** Nomes dos clipes da peça que começam com `prefixo` (ex.: "Attack" → os golpes dela). */
export function clipesRPGComPrefixo(mesh: THREE.Object3D, prefixo: string): string[] {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  return acoes ? Object.keys(acoes).filter((nome) => nome.startsWith(prefixo)) : []
}

/** Tira suavemente (fadeOut) tudo que estiver tocando ou parado no último quadro de um clipe
 * encadeado — `isRunning()` do Three.js não conta um clipe parado no fim (clampWhenFinished), que
 * continuaria com peso 1 misturado no seguinte. */
export function desligarClipesRPG(acoes: Record<string, THREE.AnimationAction>, exceto: THREE.AnimationAction, duracao: number) {
  for (const outra of Object.values(acoes)) {
    if (outra !== exceto && outra.enabled && outra.isScheduled()) outra.fadeOut(duracao)
  }
}

/** Toca um clipe nomeado uma vez só — misturando a partir do que estiver tocando (Parado, um
 * gesto, o Walk…), sem precisar saber o quê — e volta pro "Parado" no fim (ou, com
 * `voltarAoParado: false`, fica parado no último quadro, pra encadear outro clipe em seguida).
 * `aoTerminar` roda quando o clipe acaba. Devolve false (e não faz nada) se a peça não tiver esse
 * clipe (peça geométrica, ou modelo sem essa animação). */
export function tocarClipeRPGUmaVez(
  mesh: THREE.Object3D,
  nomeClipe: string,
  {
    entrada = 0.1,
    saida = 0.2,
    voltarAoParado = true,
    aoTerminar,
    velocidade = 1,
  }: { entrada?: number; saida?: number; voltarAoParado?: boolean; aoTerminar?: () => void; velocidade?: number } = {},
): boolean {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const acao = acoes?.[nomeClipe]
  if (!acoes || !acao) return false
  desligarClipesRPG(acoes, acao, entrada)
  acao.reset()
  // o mesmo clipe serve a golpes de ritmos diferentes (o retalhamento é mais rápido): a velocidade vale a cada vez
  acao.timeScale = velocidade
  acao.setLoop(THREE.LoopOnce, 1)
  acao.clampWhenFinished = true
  acao.fadeIn(entrada).play()
  const mixer = mesh.userData.mixer as THREE.AnimationMixer
  const terminou = (evento: { action: THREE.AnimationAction }) => {
    if (evento.action !== acao) return
    mixer.removeEventListener('finished', terminou)
    if (voltarAoParado) {
      acoes.Parado?.reset().fadeIn(saida).play()
      acao.fadeOut(saida)
    }
    aoTerminar?.()
  }
  mixer.addEventListener('finished', terminou)
  return true
}

/** Começa uma sequência de clipes na peça (sacar → golpe/gesto → guardar) e devolve a "senha" dela:
 * os passos seguintes só acontecem se a senha ainda for a atual — começar outra sequência (ou um
 * lance, ver animarPosicao) cancela a anterior sem precisar desmarcar timers. */
export function novaSequenciaRPG(mesh: THREE.Object3D): number {
  const senha = ((mesh.userData.sequenciaRPG as number | undefined) ?? 0) + 1
  mesh.userData.sequenciaRPG = senha
  return senha
}

export function sequenciaRPGValida(mesh: THREE.Object3D, senha: number): boolean {
  return mesh.userData.sequenciaRPG === senha
}

/** Peão RPG desembainha a espada (a espada aparece na mão no instante em que ela sai da bainha) e
 * fica em guarda; `depois` roda ao fim do clipe. Sem espada (outras peças), chama `depois` direto. */
export function sacarEspadaRPG(mesh: THREE.Object3D, senha: number, depois: () => void) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || espada.fora) {
    depois()
    return
  }
  const tocou = tocarClipeRPGUmaVez(mesh, 'Desembainhar', {
    entrada: 0.25,
    voltarAoParado: false,
    aoTerminar: () => {
      if (sequenciaRPGValida(mesh, senha)) depois()
    },
  })
  if (!tocou) {
    depois()
    return
  }
  window.setTimeout(() => {
    if (sequenciaRPGValida(mesh, senha)) mostrarEspadaRPG(mesh, true)
  }, espada.segundoSaque * 1000)
}

/** Peão RPG embainha a espada (ela some da mão no instante em que entra na bainha) e volta pro
 * Parado; `depois` (opcional) roda ao fim. */
export function guardarEspadaRPG(mesh: THREE.Object3D, senha: number, depois?: () => void) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || !espada.fora) {
    depois?.()
    return
  }
  const tocou = tocarClipeRPGUmaVez(mesh, 'Embainhar', {
    entrada: 0.2,
    saida: 0.3,
    aoTerminar: () => {
      if (sequenciaRPGValida(mesh, senha)) depois?.()
    },
  })
  if (!tocou) {
    mostrarEspadaRPG(mesh, false)
    depois?.()
    return
  }
  window.setTimeout(() => {
    if (sequenciaRPGValida(mesh, senha)) mostrarEspadaRPG(mesh, false)
  }, espada.segundoGuarda * 1000)
}

/** Golpe da captura: um dos golpes desta peça, sorteado — cada tipo de peça tem os seus (nenhum
 * se repete entre tipos), então a mesma peça varia de uma captura pra outra sem padrão fixo. O
 * peão golpeia com a espada (já desembainhada, ver capturarComGolpe). */
export function tocarGolpeRPG(mesh: THREE.Object3D) {
  const golpes = clipesRPGComPrefixo(mesh, 'Attack')
  if (golpes.length) {
    tocarClipeRPGUmaVez(mesh, golpes[Math.floor(Math.random() * golpes.length)], { voltarAoParado: !mesh.userData.espadaRPG })
  }
}

/** Gestos feitos com a espada na mão (o peão desembainha antes e guarda depois): todos menos a
 * meditação, que é com as mãos juntas. */
export function gestoComEspada(gesto: string): boolean {
  return gesto !== 'GestoMeditar'
}
