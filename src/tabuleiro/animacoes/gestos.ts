import * as THREE from 'three'
import { estaLutando } from '../combate/lutaSemArma'
import { type MembrosPersonagem, POSE_BASE_NEUTRA, type PoseBaseMembros } from '../pecas/geometricas'
import { clipesRPGComPrefixo, type EspadaRPG, gestoComEspada, guardarEspadaRPG, mostrarEspadaRPG, novaSequenciaRPG, sacarEspadaRPG, sequenciaRPGValida, sortearProximoGesto, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'

// Gestos das peças: os de vez em quando, os amigáveis entre aliadas, a comemoração, a recusa e a volta ao descanso.

/** Chamado a cada quadro pra cada peça: parada a maior parte do tempo, de vez em quando (no
 * intervalo sorteado por peça) faz um dos gestos — só se estiver mesmo parada (sem andar, golpear
 * ou fazer um gesto amigável com outra peça naquele momento). O peão desembainha a espada, faz o
 * gesto com ela na mão e guarda de volta. */
export function atualizarGestoRPG(mesh: THREE.Object3D, agora: number) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  if (!acoes || agora < (mesh.userData.proximoGestoRPG as number)) return
  mesh.userData.proximoGestoRPG = sortearProximoGesto(agora)
  const ocupada =
    meshesEmGesto.has(mesh) ||
    estaLutando(mesh) ||
    Boolean((mesh.userData.espadaRPG as EspadaRPG | undefined)?.fora) ||
    Object.entries(acoes).some(([nome, acao]) => nome !== 'Parado' && acao.enabled && acao.isScheduled() && acao.getEffectiveWeight() > 0.01)
  if (ocupada) return
  const gestos = clipesRPGComPrefixo(mesh, 'Gesto')
  if (!gestos.length) return
  const gesto = gestos[Math.floor(Math.random() * gestos.length)]
  if (!mesh.userData.espadaRPG || !gestoComEspada(gesto)) {
    tocarClipeRPGUmaVez(mesh, gesto, { entrada: 0.5, saida: 0.6 })
    return
  }
  const senha = novaSequenciaRPG(mesh)
  sacarEspadaRPG(mesh, senha, () => {
    tocarClipeRPGUmaVez(mesh, gesto, {
      entrada: 0.3,
      voltarAoParado: false,
      aoTerminar: () => {
        if (sequenciaRPGValida(mesh, senha)) guardarEspadaRPG(mesh, senha)
      },
    })
  })
}

/** Duração da comemoração de xeque-mate — pulos com os braços levantados, cada peça começando num instante levemente diferente pra não ficarem todas sincronizadas feito robôs. */
const DURACAO_COMEMORACAO_MS = 2400

/**
 * Faz a peça pular com os braços erguidos, comemorando — usado tanto na comemoração grande de
 * xeque-mate quanto (com uma duração bem mais curta) quando peças aliadas próximas reagem a uma
 * captura de um companheiro de time.
 */
export function animarComemoracao(mesh: THREE.Object3D, atraso: number, duracaoMs: number = DURACAO_COMEMORACAO_MS) {
  voltarAoDescanso(mesh)
  // peça RPG: o clipe "Comemorar" (pulos de verdade com os braços erguidos — no cavalo, ele empina
  // com o cavaleiro de punho erguido), em vez de quicar a peça inteira rígida
  if ((mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined)?.Comemorar) {
    window.setTimeout(() => {
      if (meshesEmGesto.has(mesh)) return
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      tocarClipeRPGUmaVez(mesh, 'Comemorar', { entrada: 0.15, saida: 0.3 })
    }, atraso)
    return
  }
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const yBase = mesh.position.y
  const rotYBase = mesh.rotation.y // brancas ficam viradas 180° (Math.PI) — não pode resetar pra 0
  const inicio = performance.now() + atraso
  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const amortecido = 1 - t // os pulos vão ficando mais baixos até parar
    const pulo = Math.abs(Math.sin(t * Math.PI * 7)) * 0.22 * amortecido
    mesh.position.y = yBase + pulo
    mesh.rotation.y = rotYBase + Math.sin(t * Math.PI * 3) * 0.5 * amortecido

    if (membros) {
      const braceje = Math.sin(t * Math.PI * 9) * 0.25
      membros.bracoEsq.rotation.z = (Math.PI * 0.65 + braceje) * amortecido
      membros.bracoDir.rotation.z = -(Math.PI * 0.65 - braceje) * amortecido
      membros.pernaEsq.rotation.x = pulo * 1.5
      membros.pernaDir.rotation.x = -pulo * 1.5
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.position.y = yBase
      mesh.rotation.y = rotYBase
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoDir.rotation.z = 0
        membros.pernaEsq.rotation.x = 0
        membros.pernaDir.rotation.x = 0
      }
    }
  }
  requestAnimationFrame(passo)
}

/** Duração do gesto amigável entre peças aliadas — bem mais longa e cadenciada, pra ficar mais
 * natural (dá tempo de perceber o movimento) em vez de um giro-e-volta rápido demais. O mortal é
 * um pouco mais curto (senão fica devagar demais pra dar uma volta inteira). */
const DURACAO_GESTO_MS = 2800
const DURACAO_MORTAL_MS = 1800
/** Chance de o mortal da peça RPG terminar num tombo (cai sentada, fica tonta e levanta). */
const CHANCE_TOMBO_NO_MORTAL = 0.3

/** Meshes com um gesto amigável em andamento agora — sincronizarPecas() confere esse conjunto
 * antes de recriar uma peça do zero, pra não cortar/acelerar a interação no meio caso um lance
 * (do jogador ou da máquina) aconteça enquanto ela ainda está rolando. */
const meshesEmGesto = new Set<THREE.Object3D>()

/** Onde a peça descansa: o centro da casa e o giro de frente. */
interface Descanso {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
}

/**
 * A recusa e o gesto amigável mexem na posição e no giro da peça e, no fim, devolvem a peça ao descanso. Antes, cada
 * uma guardava a peça como estava no começo: um clique no meio da recusa guardava a peça já fora do lugar como se fosse
 * o descanso, e ela terminava fora do centro da casa. Agora o descanso fica na peça enquanto alguma animação de corpo
 * roda; a nova parte dele, e só a mais nova mexe na peça.
 */
function comecarAnimacaoDoCorpo(mesh: THREE.Object3D, ehGesto = false) {
  const descanso: Descanso = (mesh.userData.descanso as Descanso | undefined) ?? {
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
    rotX: mesh.rotation.x,
    rotY: mesh.rotation.y,
  }
  const minha = Symbol('corpo')
  mesh.userData.descanso = descanso
  mesh.userData.animacaoDoCorpo = minha
  mesh.userData.corpoEmGesto = ehGesto
  return {
    descanso,
    /** Outra animação de corpo (ou um lance) tomou a peça: esta para onde está. */
    valendo: () => mesh.userData.animacaoDoCorpo === minha,
    terminar: () => {
      if (mesh.userData.animacaoDoCorpo === minha) voltarAoDescanso(mesh)
    },
  }
}

/** Devolve a peça ao descanso e encerra as animações de corpo: no fim delas e antes de um lance, golpe ou queda. */
export function voltarAoDescanso(mesh: THREE.Object3D) {
  const descanso = mesh.userData.descanso as Descanso | undefined
  if (descanso) {
    mesh.position.set(descanso.x, descanso.y, descanso.z)
    mesh.rotation.x = descanso.rotX
    mesh.rotation.y = descanso.rotY
  }
  mesh.userData.descanso = undefined
  mesh.userData.animacaoDoCorpo = undefined
  mesh.userData.corpoEmGesto = false
}

/** Pool de gestos possíveis nas interações entre peças aliadas — sorteado a cada interação, pra
 * não ser sempre o mesmo movimento. Mesmo sendo peças de formas geométricas simples, os gestos
 * imitam movimentos humanos de verdade. */
type TipoGesto = 'aceno' | 'braco_erguido' | 'inclinacao' | 'agachamento' | 'mortal'
export const POOL_GESTOS: TipoGesto[] = ['aceno', 'braco_erguido', 'inclinacao', 'agachamento', 'mortal']

/**
 * Gesto amigável entre peças aliadas — vira na direção da outra (exceto no mortal, que já gira
 * sozinho) e faz um movimento de corpo inteiro: acenar, erguer o braço, se inclinar numa
 * reverência, se agachar, ou dar um mortal pra trás. Usado quando uma peça aliada é selecionada e
 * nas interações aleatórias entre peças do mesmo time que ficam paradas esperando a vez.
 */
export function animarGestoAmigavel(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  tipo: TipoGesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)],
  atraso = 0,
) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const duracao = tipo === 'mortal' ? DURACAO_MORTAL_MS : DURACAO_GESTO_MS
  const inicio = performance.now() + atraso
  const ehRPG = Boolean(mesh.userData.acoesRPG)

  // peça RPG: o mortal é o clipe feito no Blender — agacha, toma impulso, gira grupada no ar e
  // aterrissa amortecendo; de vez em quando gira demais e cai sentada (tombo), fica tonta e levanta
  if (tipo === 'mortal' && ehRPG && clipesRPGComPrefixo(mesh, 'Mortal').length) {
    meshesEmGesto.add(mesh)
    const clipe = Math.random() < CHANCE_TOMBO_NO_MORTAL ? 'MortalTombo' : 'Mortal'
    window.setTimeout(() => {
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      const tocou = tocarClipeRPGUmaVez(mesh, clipe, { entrada: 0.15, saida: 0.3, aoTerminar: () => meshesEmGesto.delete(mesh) })
      if (!tocou) meshesEmGesto.delete(mesh)
    }, atraso)
    return
  }

  // peça RPG nos outros gestos: vira pra outra peça (abaixo) e faz um movimento de corpo de
  // verdade (um dos gestos dela), em vez de inclinar/afundar a peça inteira rígida
  if (ehRPG) {
    window.setTimeout(() => {
      // as guardas de samurai do peão são com a katana na mão — no gesto amigável ele não desembainha
      const gestos = clipesRPGComPrefixo(mesh, 'Gesto').filter((g) => g !== 'GestoKamae' && g !== 'GestoHasso')
      if (!gestos.length) return
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      tocarClipeRPGUmaVez(mesh, gestos[Math.floor(Math.random() * gestos.length)], { entrada: 0.4, saida: 0.5 })
    }, atraso)
  }

  let corpo: ReturnType<typeof comecarAnimacaoDoCorpo> | null = null
  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    corpo ??= comecarAnimacaoDoCorpo(mesh, true)
    if (!corpo.valendo()) {
      // quem tomou a peça foi outro gesto: ele tira a peça da lista quando acabar
      if (!mesh.userData.corpoEmGesto) meshesEmGesto.delete(mesh)
      return
    }
    const { rotY: rotYOriginal, rotX: rotXOriginal, y: yOriginal } = corpo.descanso
    const t = Math.min(1, (agora - inicio) / duracao)
    const giro = t < 0.25 ? t / 0.25 : t > 0.8 ? (1 - t) / 0.2 : 1
    if (tipo !== 'mortal') {
      mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro
    }

    switch (tipo) {
      case 'aceno': {
        if (membros) membros.bracoEsq.rotation.z = Math.sin(Math.min(1, t / 0.8) * Math.PI * 3) * 0.45 * giro
        break
      }
      case 'braco_erguido': {
        if (membros) {
          const envelope = t < 0.4 ? Math.min(1, t / 0.3) : Math.max(0, (1 - t) / 0.4)
          membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.75 * envelope
        }
        break
      }
      case 'inclinacao': {
        // uma reverência — o corpo inteiro curva pra frente e volta (a peça RPG faz o gesto pelo
        // esqueleto, ver acima)
        if (!ehRPG) mesh.rotation.x = rotXOriginal + Math.sin(t * Math.PI) * 0.5
        break
      }
      case 'agachamento': {
        const envelope = Math.sin(t * Math.PI)
        // a peça RPG não tem pernas soltas pra dobrar aqui — descer o corpo inteiro a afundaria no
        // tabuleiro, então ela só vira pra outra peça
        if (!ehRPG) mesh.position.y = yOriginal - envelope * 0.14
        if (membros) {
          membros.pernaEsq.rotation.x = base.pernaEsq + envelope * 0.6
          membros.pernaDir.rotation.x = base.pernaDir - envelope * 0.6
        }
        break
      }
      case 'mortal': {
        // gira o corpo inteiro pra trás em torno do eixo X, com um salto em arco
        mesh.rotation.x = rotXOriginal - t * Math.PI * 2
        mesh.position.y = yOriginal + Math.sin(t * Math.PI) * 0.45
        break
      }
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      corpo.terminar()
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
      }
      meshesEmGesto.delete(mesh)
    }
  }
  meshesEmGesto.add(mesh)
  requestAnimationFrame(passo)
}

/** Duração da recusa — rápida e seca (bem mais curta que o gesto amigável), pra ler como um "não,
 * não é sua vez" imediato e não deixar o tabuleiro travado esperando por ela. */
const DURACAO_RECUSA_MS = 900
/** Quanto a peça avança na direção da câmera durante a recusa, antes de voltar. */
const DISTANCIA_RECUSA = 0.16

/**
 * Reação de recusa: dispara quando o jogador clica numa peça do próprio time fora da sua vez (ou
 * com a máquina jogando). A peça vira de frente pra câmera — o "para quem está olhando" que o
 * jogador realmente vê, não uma direção fixa do tabuleiro —, dá um passo nessa direção, balança o
 * corpo de um lado pro outro como um "não" físico com os dois braços erguidos num gesto de "pera,
 * calma", e volta exatamente pra posição, rotação e pose que tinha antes.
 */
export function animarRecusa(mesh: THREE.Object3D, direcaoCamera: { x: number; z: number }) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const corpo = comecarAnimacaoDoCorpo(mesh)
  const rotYOriginal = corpo.descanso.rotY
  const posOriginal = { x: corpo.descanso.x, z: corpo.descanso.z }
  const anguloAlvo = Math.atan2(direcaoCamera.x, direcaoCamera.z)
  const inicio = performance.now()

  function passo(agora: number) {
    if (!corpo.valendo()) return
    const t = Math.min(1, (agora - inicio) / DURACAO_RECUSA_MS)
    const giro = t < 0.18 ? t / 0.18 : t > 0.85 ? (1 - t) / 0.15 : 1
    // janela do balanço "não" — só depois que já virou de frente, e some antes da recuperação
    const janela = Math.min(1, Math.max(0, (t - 0.18) / 0.67))
    const balanco = Math.sin(janela * Math.PI * 4) * 0.2 * Math.sin(janela * Math.PI)
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro + balanco

    const avanco = Math.sin(t * Math.PI) * DISTANCIA_RECUSA
    mesh.position.x = posOriginal.x + direcaoCamera.x * avanco
    mesh.position.z = posOriginal.z + direcaoCamera.z * avanco

    if (membros) {
      const bracos = t < 0.22 ? t / 0.22 : t > 0.8 ? (1 - t) / 0.2 : 1
      membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.32 * bracos
      membros.bracoDir.rotation.x = base.bracoDir - Math.PI * 0.32 * bracos
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      corpo.terminar()
      if (membros) {
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
    }
  }
  requestAnimationFrame(passo)
}
