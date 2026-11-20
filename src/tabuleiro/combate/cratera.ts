import * as THREE from 'three'
import { desenharRachaduras } from './efeitosDasArmas'

// A cratera da pancada (pedido do usuário para o Puxão Universal: "o chão também deve sofrer rachaduras e afundar
// proporcionalmente, seguindo uma lógica de gravidade"). O chão cede debaixo de quem cai, num buraco com o feitio do
// corpo, mais fundo e mais largo quanto mais pesada a peça (a massa de sempre do xadrez, em realismo.ts).
//
// O tabuleiro continua inteiro: a cratera é uma tigela logo abaixo do tampo e uma tampa invisível em cima dela, que só
// escreve profundidade. A tampa é desenhada antes das casas, então as casas, atrás dela, não aparecem ali: abre-se o
// buraco. A vítima é desenhada antes da tampa, pra parte dela que entra no buraco continuar à vista. Quem chamou fecha a
// cratera quando quiser (o chão volta, o buraco fechando da borda pro meio).

/** O tampo das casas (as casas têm 0,1 de altura com o meio em -0,05). */
const TAMPO = 0
/** A ordem de desenho: a tigela e a vítima antes da tampa, e a tampa antes de todo o resto (as casas). */
const ORDEM_DA_TIGELA = -3
const ORDEM_DA_VITIMA = -2
const ORDEM_DA_TAMPA = -1
/** O chão cede depressa, passa um pouco do ponto e assenta. */
const ABRE_MS = 120
const FECHA_MS = 420
/** Quanto a peça achata deitada (a grossura vira isto) e quanto tempo fica assim antes de o chão a engolir. */
const ACHATADA = 0.18
const ACHATAR_MS = 90
const ACHATADA_MS = 420
/** A gravidade que puxa a peça achatada pra dentro do chão (casas por segundo ao quadrado). */
const GRAVIDADE = 2.4

export interface Cratera {
  /** A altura do fundo num ponto do tabuleiro, agora (o tampo, fora do buraco). */
  fundoEm: (x: number, z: number) => number
  /** O chão volta; `aoFechar` quando já está inteiro. */
  fechar: (aoFechar: () => void) => void
}

/** O formato do fundo: 1 no meio, 0 na borda (`d`: a distância até o meio, ao quadrado, com a borda em 1). */
const perfil = (d: number) => (d >= 1 ? 0 : Math.pow(1 - d, 0.7))
const suave = (t: number) => t * t * (3 - 2 * t)

/** O fundo da cratera: madeira quebrada e escura, mais escura no meio, com as rachaduras de sempre por cima. */
function texturaDoFundo(): THREE.CanvasTexture {
  const tamanho = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = tamanho
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const fundo = ctx.createRadialGradient(tamanho / 2, tamanho / 2, 6, tamanho / 2, tamanho / 2, tamanho / 2)
  fundo.addColorStop(0, '#1c1009')
  fundo.addColorStop(0.6, '#3e2615')
  fundo.addColorStop(1, '#6a4527')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, tamanho, tamanho)
  const rachaduras = desenharRachaduras()
  ctx.drawImage(rachaduras.image as HTMLCanvasElement, 0, 0, tamanho, tamanho)
  rachaduras.dispose()
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/**
 * Abre a cratera debaixo de `quemCaiu`, deitado com o meio do corpo em `meio` e a cabeça pro lado de `rumo`. `massa`
 * (peão 1 … rainha 9) dá a profundidade e a largura, como o peso de verdade daria.
 */
export function abrirCratera(cena: THREE.Object3D, quemCaiu: THREE.Object3D, meio: THREE.Vector3, rumo: THREE.Vector3, comprimento: number, massa: number): Cratera {
  const profundidade = Math.min(0.13, 0.03 + 0.0095 * massa)
  const meioComprimento = comprimento * 0.5 + 0.05 + 0.01 * massa
  const meiaLargura = comprimento * 0.24 + 0.04 + 0.012 * massa

  const grupo = new THREE.Group()
  grupo.position.set(meio.x, TAMPO, meio.z)
  // o comprimento da cratera (o z dela) vai ao longo do corpo
  grupo.rotation.y = Math.atan2(rumo.x, rumo.z)
  cena.add(grupo)

  // a tigela: um retângulo dobrado pra baixo dentro da elipse; fora dela fica rente ao tampo, escondido pelas casas
  const geometria = new THREE.PlaneGeometry(meiaLargura * 2.1, meioComprimento * 2.1, 36, 48)
  geometria.rotateX(-Math.PI / 2)
  const posicoes = geometria.attributes.position
  for (let i = 0; i < posicoes.count; i++) {
    const x = posicoes.getX(i) / meiaLargura
    const z = posicoes.getZ(i) / meioComprimento
    posicoes.setY(i, -0.002 - profundidade * perfil(x * x + z * z))
  }
  geometria.computeVertexNormals()
  const textura = texturaDoFundo()
  const tigela = new THREE.Mesh(geometria, new THREE.MeshStandardMaterial({ map: textura, roughness: 0.95, metalness: 0 }))
  tigela.renderOrder = ORDEM_DA_TIGELA
  // o buraco atravessa a madeira: nada em cima pra fazer sombra
  tigela.receiveShadow = false
  grupo.add(tigela)

  // a tampa: só profundidade, um pouco acima do tampo e puxada pra câmera mais que as rachaduras (que também são puxadas),
  // pra elas não aparecerem por cima do buraco
  const elipse = new THREE.Shape().absellipse(0, 0, meiaLargura, meioComprimento, 0, Math.PI * 2, false, 0)
  const tampa = new THREE.Mesh(
    new THREE.ShapeGeometry(elipse, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  )
  tampa.position.y = 0.005
  tampa.renderOrder = ORDEM_DA_TAMPA
  grupo.add(tampa)

  // quem caiu é desenhado antes da tampa, e no buraco não recebe a sombra da madeira que não está mais lá
  quemCaiu.traverse((objeto) => {
    if (!(objeto as THREE.Mesh).isMesh) return
    objeto.renderOrder = ORDEM_DA_VITIMA
    objeto.receiveShadow = false
  })

  /** O quanto o chão cedeu (0 inteiro, 1 a cratera toda) e o quanto o buraco ainda está aberto (1 aberto, 0 fechado). */
  let cedeu = 0
  let aberto = 1
  const inicio = performance.now()
  let fechando: { desde: number; aoFechar: () => void } | null = null
  let acabou = false
  const passo = (agora: number) => {
    if (acabou) return
    const decorrido = agora - inicio
    if (decorrido < ABRE_MS) {
      const u = decorrido / ABRE_MS
      cedeu = 1 - (1 - u) ** 3
    } else {
      // passa um pouco do ponto e assenta, como madeira que cede e segura
      const depois = decorrido - ABRE_MS
      cedeu = 1 + 0.1 * Math.sin(depois / 38) * Math.exp(-depois / 110)
    }
    if (fechando) {
      const u = Math.min(1, (agora - fechando.desde) / FECHA_MS)
      aberto = 1 - suave(u)
      if (u >= 1) {
        acabou = true
        grupo.removeFromParent()
        geometria.dispose()
        tampa.geometry.dispose()
        ;(tigela.material as THREE.Material).dispose()
        ;(tampa.material as THREE.Material).dispose()
        textura.dispose()
        fechando.aoFechar()
        return
      }
    }
    tigela.scale.set(Math.max(0.001, aberto), Math.max(0.001, cedeu * aberto), Math.max(0.001, aberto))
    tampa.scale.set(Math.max(0.001, aberto), 1, Math.max(0.001, aberto))
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)

  return {
    fundoEm(x, z) {
      // o ponto no espaço da cratera
      const dx = x - grupo.position.x
      const dz = z - grupo.position.z
      const giro = grupo.rotation.y
      const lx = (dx * Math.cos(giro) - dz * Math.sin(giro)) / (meiaLargura * Math.max(0.001, aberto))
      const lz = (dx * Math.sin(giro) + dz * Math.cos(giro)) / (meioComprimento * Math.max(0.001, aberto))
      return TAMPO - 0.002 - profundidade * perfil(lx * lx + lz * lz) * cedeu * aberto
    },
    fechar(aoFechar) {
      if (!fechando && !acabou) fechando = { desde: performance.now(), aoFechar }
    },
  }
}

/**
 * A peça deitada de costas no buraco: achata a grossura (o eixo z dela, que agora aponta pra cima) enquanto o chão cede,
 * fica assim um instante e a gravidade a puxa pra dentro do chão até sumir. `meio` é o meio do corpo (onde a cratera é
 * mais funda); `meiaGrossura`, a metade da grossura do corpo antes de achatar.
 */
export function afundarNaCratera(vitima: THREE.Object3D, cratera: Cratera, meio: THREE.Vector3, meiaGrossura: number, aoSumir: () => void) {
  const base = vitima.scale.clone()
  const alturaInicial = vitima.position.y
  const inicio = performance.now()
  const passo = (agora: number) => {
    const decorrido = agora - inicio
    const a = Math.min(1, decorrido / ACHATAR_MS)
    vitima.scale.set(base.x * (1 + 0.4 * a), base.y * (1 + 0.08 * a), base.z * (1 - (1 - ACHATADA) * a))
    // o corpo acompanha o chão cedendo (acelerando, como quem cai)
    const deitada = cratera.fundoEm(meio.x, meio.z) + meiaGrossura * (1 - (1 - ACHATADA) * a)
    let altura = alturaInicial + (deitada - alturaInicial) * a * a
    const engolindo = (decorrido - ACHATAR_MS - ACHATADA_MS) / 1000
    if (engolindo > 0) altura = deitada - 0.5 * GRAVIDADE * engolindo * engolindo
    vitima.position.y = altura
    // já passou do fundo: o chão engoliu a peça
    if (altura < deitada - meiaGrossura * ACHATADA * 2 - 0.03) {
      vitima.visible = false
      aoSumir()
      return
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}
