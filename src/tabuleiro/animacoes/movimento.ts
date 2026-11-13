import * as THREE from 'three'
import { ossoRPG } from '../pecas/ossos'
import { ritmoDosPassos, tocarSom, tocarUmPasso } from '../../som/sons'
import { voltarAoDescanso } from './gestos'
import { type MembrosPersonagem, POSE_BASE_NEUTRA, type PoseBaseMembros } from '../pecas/geometricas'
import { type DadosRPG, desligarClipesRPG, mostrarEspadaRPG, novaSequenciaRPG, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'

// A peça andando, correndo, virando e saltando (o cavalo), com os passos no ritmo dos pés.

// Velocidade de caminhada das peças: a duração do deslocamento e o número de passadas escalam
// com a distância percorrida (em casas do tabuleiro), então uma peça anda no mesmo ritmo humano
// constante tanto num lance curto quanto num lance longo — em vez de todo lance levar o mesmo
// tempo fixo, com as pernas balançando fixo desincronizadas da distância real percorrida.
const VELOCIDADE_CASAS_POR_SEGUNDO = 2.6
const DURACAO_LANCE_MIN_MS = 650
const DURACAO_LANCE_MAX_MS = 2400
const PASSADAS_POR_CASA = 1.6
/** Ângulo de `de` até `para` pelo caminho mais curto (entre -π e π). */
export function diferencaAngular(de: number, para: number): number {
  return Math.atan2(Math.sin(para - de), Math.cos(para - de))
}

/** A frente de cada peça no tabuleiro: as brancas olham pras pretas (-Z) e as pretas pras brancas (+Z). */
export function rumoDeDescanso(mesh: THREE.Object3D): number {
  return mesh.userData.cor === 'w' ? Math.PI : 0
}

/** Rumo (rotation.y) de quem olha de `de` pra `para`. */
export function rumoEntre(de: { x: number; z: number }, para: { x: number; z: number }): number {
  return Math.atan2(para.x - de.x, para.z - de.z)
}

/** Acima disso (em casas, no tamanho do modelo) a peça corre em vez de andar. */
const DISTANCIA_PRA_CORRER = 2.2
/** Tempo pra acelerar até a velocidade do passo (e pra frear no fim). */
const TEMPO_ACELERACAO_S = 0.35

/** Peça RPG dando passos no lugar enquanto gira até o rumo `alvo` (sem girar parada feito um
 * pião); `depois` roda ao terminar. */
export function virarRPG(mesh: THREE.Object3D, alvo: number, depois: () => void) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const caminhada = acoes.Walk
  const inicial = mesh.rotation.y
  const giro = diferencaAngular(inicial, alvo)
  if (Math.abs(giro) < 0.05) {
    mesh.rotation.y = alvo
    depois()
    return
  }
  const duracao = Math.max(0.2, (Math.abs(giro) / Math.PI) * 0.6)
  if (caminhada) {
    desligarClipesRPG(acoes, caminhada, 0.15)
    if (!caminhada.isRunning()) caminhada.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play()
    caminhada.setEffectiveTimeScale(0.7)
  }
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / 1000 / duracao)
    const suave = t * t * (3 - 2 * t)
    mesh.rotation.y = inicial + giro * suave
    if (t < 1) requestAnimationFrame(passo)
    else depois()
  }
  requestAnimationFrame(passo)
}

/** Volta suave pro "Parado" (e o ritmo normal de todos os clipes). */
export function pararRPG(mesh: THREE.Object3D) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const parado = acoes.Parado
  if (parado) {
    desligarClipesRPG(acoes, parado, 0.25)
    parado.reset().fadeIn(0.25).play()
  }
  for (const acao of Object.values(acoes)) acao.setEffectiveTimeScale(1)
}

/**
 * Peça RPG andando (até ~2 casas) ou correndo (mais longe) de `de` até `para`, na velocidade do
 * próprio passo — o corpo avança exatamente o que os pés pisam (velocidade medida no clipe, ver
 * DadosRPG) —, acelerando no começo e freando no fim (perfil trapezoidal), com o ritmo dos passos
 * acompanhando a velocidade. Não vira nem para no fim (quem chama decide o que vem depois).
 */
export function deslocarRPG(mesh: THREE.Object3D, de: { x: number; z: number }, para: { x: number; z: number }, depois: () => void) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const dados = mesh.userData.dadosRPG as DadosRPG
  const dx = para.x - de.x
  const dz = para.z - de.z
  const distancia = Math.hypot(dx, dz)
  const escala = mesh.scale.x
  const corre = distancia / escala > DISTANCIA_PRA_CORRER && Boolean(acoes.Run)
  const clipe = corre ? acoes.Run : acoes.Walk
  const velocidade = (corre ? dados.velocidadeRun : dados.velocidadeWalk) * escala
  if (!clipe || distancia < 1e-3) {
    depois()
    return
  }
  desligarClipesRPG(acoes, clipe, 0.2)
  if (!clipe.isRunning()) clipe.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play()
  const aceleracao = Math.min(TEMPO_ACELERACAO_S, (0.5 * distancia) / velocidade)
  const total = distancia / velocidade + aceleracao
  // o som de cada passo cai quando o pé encosta no chão; o cavalo (patas sem esses ossos) galopa pela distância
  const pisar = ouvidoDosPes(mesh, corre)
  const passada = velocidade * ritmoDosPassos(mesh.userData.tipo as string, corre)
  let proximaPisada = passada * 0.3
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(total, (agora - inicio) / 1000)
    let percorrido: number
    let v: number
    if (t < aceleracao) {
      percorrido = (velocidade * t * t) / (2 * aceleracao)
      v = (velocidade * t) / aceleracao
    } else if (t < total - aceleracao) {
      percorrido = (velocidade * aceleracao) / 2 + velocidade * (t - aceleracao)
      v = velocidade
    } else {
      const falta = total - t
      percorrido = distancia - (velocidade * falta * falta) / (2 * aceleracao)
      v = (velocidade * falta) / aceleracao
    }
    const fracao = Math.min(1, percorrido / distancia)
    mesh.position.x = de.x + dx * fracao
    mesh.position.z = de.z + dz * fracao
    if (pisar) pisar()
    else {
      // acelerando e freando, os passos ficam mais espaçados no tempo: cada um a uma passada de distância
      while (percorrido >= proximaPisada) {
        tocarUmPasso(mesh.userData.tipo as string, corre)
        proximaPisada += passada
      }
    }
    // o ritmo dos passos acompanha a velocidade (nunca parado de todo, pra não "congelar" no
    // meio de um passo enquanto ainda arranca/freia)
    clipe!.setEffectiveTimeScale(Math.max(0.35, v / velocidade))
    if (t < total) requestAnimationFrame(passo)
    else depois()
  }
  requestAnimationFrame(passo)
}

/**
 * Escuta os pés da peça andando: a cada quadro, o pé que vinha descendo e para de descer perto do ponto mais baixo
 * dele é o pé que pisou, e o passo soa ali. Null pra peça sem os ossos dos pés (o cavalo).
 */
function ouvidoDosPes(mesh: THREE.Object3D, correndo: boolean): (() => void) | null {
  const tipo = mesh.userData.tipo as string
  const pes = ['LeftFoot', 'RightFoot'].map((nome) => ossoRPG(mesh, nome)).filter((osso): osso is THREE.Object3D => Boolean(osso))
  if (tipo === 'n' || pes.length < 2) return null
  const ponto = new THREE.Vector3()
  // cada pé só pisa de novo depois de ter subido de verdade: o calcanhar e a ponta encostam em dois tempos, e sem isso
  // o mesmo passo soava duas vezes
  const estados = pes.map(() => ({ anterior: Infinity, menor: Infinity, maior: -Infinity, levantado: false, ultimo: 0 }))
  return () => {
    const agora = performance.now()
    pes.forEach((osso, i) => {
      const e = estados[i]
      const y = osso.getWorldPosition(ponto).y
      e.menor = Math.min(e.menor, y)
      e.maior = Math.max(e.maior, y)
      const altura = e.maior - e.menor
      if (altura < 0.008 * mesh.scale.y) return
      if (y > e.menor + altura * 0.6) e.levantado = true
      else if (e.levantado && y <= e.menor + altura * 0.25 && agora - e.ultimo > 160) {
        e.levantado = false
        e.ultimo = agora
        tocarUmPasso(tipo, correndo)
      }
      e.anterior = y
    })
  }
}

/** Cavalo: salto de `de` até `para` (o salto do clipe "Mortal") — só se desloca entre a decolagem e
 * o pouso; `aoPousar` roda no instante em que as patas tocam o chão, `depois` no fim do clipe. */
function saltarRPG(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  depois: () => void,
  aoPousar?: () => void,
) {
  const dados = mesh.userData.dadosRPG as DadosRPG
  const decola = dados.segundoDecola ?? 0.4
  const pousa = dados.segundoPousa ?? 1.13
  tocarSom('salto:n')
  tocarClipeRPGUmaVez(mesh, 'Mortal', { entrada: 0.15, voltarAoParado: false, aoTerminar: depois })
  const inicio = performance.now()
  function passo(agora: number) {
    const t = (agora - inicio) / 1000
    const fracao = Math.min(1, Math.max(0, (t - decola) / (pousa - decola)))
    mesh.position.x = de.x + (para.x - de.x) * fracao
    mesh.position.z = de.z + (para.z - de.z) * fracao
    if (fracao < 1) {
      requestAnimationFrame(passo)
      return
    }
    tocarSom('pouso:n')
    aoPousar?.()
  }
  requestAnimationFrame(passo)
}

/** O cavalo RPG salta (em vez de andar) — só se o modelo trouxer o salto. */
export function pecaSaltaRPG(mesh: THREE.Object3D): boolean {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const dados = mesh.userData.dadosRPG as DadosRPG | undefined
  return mesh.userData.tipo === 'n' && Boolean(acoes?.Mortal) && dados?.segundoDecola !== undefined
}

/**
 * Peça RPG indo de uma casa a outra, como um personagem de verdade: vira pra onde vai, anda ou
 * corre (ver deslocarRPG) e, ao chegar, vira de volta de frente pro adversário e para. O cavalo
 * salta direto até a casa, como o cavalo do xadrez, que pula por cima das outras peças.
 * `aoPousar` (só o cavalo) roda no instante em que ele toca o chão — é quando ele atropela a peça
 * capturada.
 */
export function animarPosicaoRPG(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  aoTerminar: () => void,
  aoPousar?: () => void,
) {
  // um lance interrompe o que a peça estava fazendo (gesto com a espada na mão, por exemplo): a
  // sequência em andamento é cancelada e a espada volta pra bainha
  novaSequenciaRPG(mesh)
  mostrarEspadaRPG(mesh, false)
  const terminar = () => {
    pararRPG(mesh)
    aoTerminar()
  }
  const seguir = () => virarRPG(mesh, rumoDeDescanso(mesh), terminar)
  if (Math.hypot(para.x - de.x, para.z - de.z) < 1e-3) {
    seguir()
    return
  }
  virarRPG(mesh, rumoEntre(de, para), () => {
    if (pecaSaltaRPG(mesh)) saltarRPG(mesh, de, para, seguir, aoPousar)
    else deslocarRPG(mesh, de, para, seguir)
  })
}

/**
 * Anima a posição x/z (ease-in-out) e, se a peça tiver braços/pernas, balança os membros como uma
 * caminhada durante o trajeto — voltando à pose de descanso da peça (guarda, no caso do peão) ao
 * terminar. Duração e número de passadas escalam com a distância percorrida, então o ritmo do
 * "passo" fica igual não importa se a peça andou uma casa ou atravessou o tabuleiro inteiro. As
 * peças RPG vão por animarPosicaoRPG.
 */
export function animarPosicao(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  aoTerminar: () => void,
  aoPousar?: () => void,
) {
  // a peça estava no meio de uma recusa ou de um gesto: quem leva ela agora é o lance
  voltarAoDescanso(mesh)
  if (mesh.userData.acoesRPG && mesh.userData.dadosRPG) {
    animarPosicaoRPG(mesh, de, para, aoTerminar, aoPousar)
    return
  }
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA

  const distancia = Math.hypot(para.x - de.x, para.z - de.z)
  const duracaoMs = Math.min(
    DURACAO_LANCE_MAX_MS,
    Math.max(DURACAO_LANCE_MIN_MS, (distancia / VELOCIDADE_CASAS_POR_SEGUNDO) * 1000),
  )
  const passadas = Math.max(1, Math.round(distancia * PASSADAS_POR_CASA))
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const suave = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    mesh.position.x = de.x + (para.x - de.x) * suave
    mesh.position.z = de.z + (para.z - de.z) * suave

    if (membros) {
      const envelope = Math.sin(t * Math.PI) // 0 no início/fim do trajeto, evita um "chute" seco na primeira/última passada
      const balanco = Math.sin(t * Math.PI * passadas) * 0.55 * envelope
      membros.pernaEsq.rotation.x = base.pernaEsq + balanco
      membros.pernaDir.rotation.x = base.pernaDir - balanco
      membros.bracoEsq.rotation.x = base.bracoEsq - balanco
      membros.bracoDir.rotation.x = base.bracoDir + balanco
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      if (membros) {
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}
