import * as THREE from 'three'
import { voltarAoDescanso } from '../animacoes/gestos'
import { CONFIG_BRACO_DIR, criarEspadaDoPeao, type MembrosPersonagem, POSE_BASE_NEUTRA, type PoseBaseMembros } from '../pecas/geometricas'

// O golpe corpo a corpo (a espada do peão e as peças geométricas), o alcance de cada tipo e o efeito de impacto.

/** Chance de o peão capturado por outro peão se render com a honra de um samurai (em vez de lutar). */
export const CHANCE_HONRA_SAMURAI = 0.15
/** A que distância do derrotado o vencedor para pra se curvar (em casas, no tamanho do modelo). */
export const DISTANCIA_REVERENCIA = 0.75

/** Até onde vai o golpe corpo a corpo (em casas, no tamanho do modelo): a peça para a essa
 * distância da vítima pra golpear — o peão com a espada alcança mais longe que a torre com o punho/pé. */
export const ALCANCE_GOLPE: Record<string, number> = { p: 0.62, r: 0.77 }

/** Duração do golpe de espada do peão ao capturar — preparação, corte e recuperação. */
const DURACAO_ATAQUE_MS = 520
/** Fração da duração em que o golpe atinge o alvo — é aí que o efeito de impacto dispara. */
const INSTANTE_IMPACTO = 0.55
/** Quanto a peça avança fisicamente na direção do alvo durante o golpe (lunge), voltando depois. */
const DISTANCIA_LUNGE = 0.14

/**
 * Curva do balanço do braço em 3 tempos — bem mais dramática que um simples vaivém: puxa o braço
 * pra trás (preparação), dispara num arco bem mais amplo que a guarda normal (corte) e só depois
 * assenta de volta na pose de guarda (recuperação). Valor 0 = pose de guarda; positivo = à frente.
 */
function curvaDoGolpe(t: number): number {
  if (t < 0.25) {
    const k = t / 0.25
    return -0.55 * k * k
  }
  if (t < INSTANTE_IMPACTO) {
    const k = (t - 0.25) / (INSTANTE_IMPACTO - 0.25)
    return -0.55 + 2.75 * (1 - Math.pow(1 - k, 3))
  }
  const k = (t - INSTANTE_IMPACTO) / (1 - INSTANTE_IMPACTO)
  return 2.2 * (1 - k * k)
}

/** Estilo do golpe do peão ao capturar — sorteado a cada captura, pra não repetir sempre a mesma animação. */
export type EstiloAtaque = 'corte' | 'derrubada'

/**
 * Ataque de espada do peão ao capturar: vira de frente pro alvo, avança um passo (lunge) e desfere
 * um golpe bem mais amplo — preparação, corte e recuperação — antes de assentar de volta na guarda.
 * Dois estilos possíveis: "corte" é um golpe vertical de cima pra baixo; "derrubada" é uma
 * bordoada bem mais larga e horizontal, de baixo pra cima, feita pra jogar a peça atingida longe
 * (ver `direcaoNocauteDoEstilo`). `aoImpacto` dispara no instante exato em que o golpe atinge o
 * alvo (pro efeito de impacto e a queda da peça atingida ficarem sincronizados com a espada, não
 * só depois de tudo terminar).
 */
export function animarAtaqueEspada(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  estilo: EstiloAtaque,
  aoImpacto: () => void,
  aoTerminar: () => void,
) {
  voltarAoDescanso(mesh)
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const rotYOriginal = mesh.rotation.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const inicio = performance.now()
  let impactoDisparado = false

  // peão geométrico: a espada só existe presa no pivô do braço durante o golpe (o resto do tempo
  // só o cabo aparece na bainha) e é guardada de volta ao fim do ataque. As peças RPG não passam
  // por aqui pra espada: o peão RPG tem a espada no próprio modelo (sacada antes do golpe, ver
  // sacarEspadaRPG) e as outras peças não usam espada.
  const espadaDesembainhada = membros ? criarEspadaDoPeao() : undefined
  if (membros && espadaDesembainhada) {
    espadaDesembainhada.position.y = -CONFIG_BRACO_DIR.comprimento
    espadaDesembainhada.rotation.z = Math.PI * 0.15
    espadaDesembainhada.scale.setScalar(1.5)
    membros.bracoDir.add(espadaDesembainhada)
  }

  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_ATAQUE_MS)
    // vira de frente rápido, segura o giro durante o golpe e desfaz na recuperação
    const giro = t < 0.2 ? t / 0.2 : t > 0.85 ? (1 - t) / 0.15 : 1
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro

    // avança um passo físico na direção do golpe (lunge) e volta, acompanhando o corte
    const avanco = Math.max(0, Math.sin(Math.min(1, t / INSTANTE_IMPACTO) * Math.PI)) * DISTANCIA_LUNGE
    mesh.position.x = posOriginal.x + direcao.x * avanco
    mesh.position.z = posOriginal.z + direcao.z * avanco

    if (membros) {
      const golpe = curvaDoGolpe(t)
      if (estilo === 'derrubada') {
        // bordoada larga e horizontal — o braço varre de lado em vez de cortar de cima pra baixo
        membros.bracoDir.rotation.z = golpe * -1.3
        membros.bracoDir.rotation.x = base.bracoDir + golpe * 0.3
      } else {
        membros.bracoDir.rotation.x = base.bracoDir + golpe
        membros.bracoDir.rotation.z = golpe * -0.35
      }
    }

    if (!impactoDisparado && t >= INSTANTE_IMPACTO) {
      impactoDisparado = true
      aoImpacto()
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.rotation.y = rotYOriginal
      mesh.position.x = posOriginal.x
      mesh.position.z = posOriginal.z
      if (membros) {
        membros.bracoDir.rotation.x = base.bracoDir
        membros.bracoDir.rotation.z = 0
        if (espadaDesembainhada) membros.bracoDir.remove(espadaDesembainhada)
      }
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Efeito especial de acerto — um anel de luz se espalhando pelo chão mais um
// estilhaço de raios, no ponto exato do golpe. Some rápido, é só pra dar peso
// visual ao instante do impacto, antes da peça atingida cair. Material próprio
// (não-toon, sempre "aceso") clonado por instância pra cada cópia poder sumir
// (opacity) de forma independente sem afetar outros efeitos ainda em andamento.
// ---------------------------------------------------------------------------
const materialImpactoBase = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, depthWrite: false })
const geoAnelImpacto = new THREE.RingGeometry(0.05, 0.12, 32)
const geoRaioImpacto = new THREE.BoxGeometry(0.03, 0.02, 0.24)
const RAIOS_IMPACTO = 6
const DURACAO_IMPACTO_MS = 380

function criarEfeitoImpacto(): THREE.Group {
  const grupo = new THREE.Group()

  const anel = new THREE.Mesh(geoAnelImpacto, materialImpactoBase.clone())
  anel.rotation.x = -Math.PI / 2
  grupo.add(anel)

  for (let i = 0; i < RAIOS_IMPACTO; i++) {
    const raio = new THREE.Mesh(geoRaioImpacto, materialImpactoBase.clone())
    raio.position.y = 0.012
    raio.rotation.y = (i / RAIOS_IMPACTO) * Math.PI * 2
    raio.translateZ(0.14) // empurra pra fora ao longo do próprio eixo já girado — fica radial
    grupo.add(raio)
  }
  return grupo
}

/** Dispara o estouro de luz no ponto (x,z) do golpe — remove a si mesmo da cena ao terminar. */
export function animarImpacto(scene: THREE.Object3D, x: number, z: number) {
  const efeito = criarEfeitoImpacto()
  efeito.position.set(x, 0.035, z)
  efeito.scale.setScalar(0.35)
  scene.add(efeito)

  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_IMPACTO_MS)
    const escala = 0.35 + t * 1.5
    efeito.scale.set(escala, 1, escala)
    const opacidade = 1 - t
    efeito.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj.material as THREE.MeshBasicMaterial).opacity = opacidade
    })

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      scene.remove(efeito)
      efeito.traverse((obj) => {
        if (obj instanceof THREE.Mesh) (obj.material as THREE.Material).dispose()
      })
    }
  }
  requestAnimationFrame(passo)
}
