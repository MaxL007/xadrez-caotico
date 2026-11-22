import * as THREE from 'three'
import { spriteDeBrilho } from './poderes'

// Os efeitos de anime (pedido do usuário: seguir a mecânica de movimento das animações de anime). No anime o movimento é
// desenhado de pose em pose: as poses-chave ficam paradas um instante (às vezes tremendo, "em dois": 12 desenhos por
// segundo), e entre elas o corpo passa rápido, com borrões (o leque atrás do que gira), linhas de velocidade, a faísca
// no contato e, no golpe mais forte, a tela em negativo por um instante (o quadro de impacto) e as linhas de foco
// apontando pro ponto da pancada (estas duas ficam no ChessBoard3D, em `SensacaoDaPartida`). Qualquer habilidade usa.

/** Um desenho "em dois": 12 por segundo, a animação limitada do anime nas poses paradas. */
export const QUADRO_EM_DOIS = 1000 / 12

/** O instante `t` andando em degraus de um desenho em dois, contados a partir de `de`. */
export function emDois(t: number, de = 0): number {
  return de + Math.floor((t - de) / QUADRO_EM_DOIS) * QUADRO_EM_DOIS
}

/** Um número de 0 a 1 fixo pra cada `i`: o tremor muda de desenho em desenho, não ao acaso a cada quadro. */
export function acaso(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Roda `passo(u)` com u de 0 a 1 ao longo de `ms` e chama `fim` depois. */
function animar(ms: number, passo: (u: number) => void, fim: () => void) {
  const inicio = performance.now()
  const quadro = (agora: number) => {
    const u = Math.min(1, (agora - inicio) / ms)
    passo(u)
    if (u < 1) requestAnimationFrame(quadro)
    else fim()
  }
  // o primeiro quadro já sai no tamanho do começo: sem isso, o efeito aparecia um quadro no tamanho 1 (um clarão enorme)
  passo(0)
  requestAnimationFrame(quadro)
}

const geometriaDaLinha = new THREE.BoxGeometry(1, 1, 1)

/**
 * Linhas de velocidade em volta de `ponto`, que se move a `velocidade` (casas por segundo): riscos finos no rumo do
 * movimento, pra trás do corpo, que somem num instante. Chamar a cada quadro do movimento rápido.
 */
export function linhasDeVelocidade(cena: THREE.Object3D, ponto: THREE.Vector3, velocidade: THREE.Vector3, raio: number, cor: THREE.ColorRepresentation, quantas = 2) {
  const rapidez = velocidade.length()
  if (rapidez < 0.8) return
  const rumo = velocidade.clone().normalize()
  for (let i = 0; i < quantas; i++) {
    const lado = new THREE.Vector3().randomDirection().projectOnPlane(rumo)
    if (lado.lengthSq() < 1e-6) continue
    lado.normalize().multiplyScalar(raio * (0.45 + Math.random() * 0.8))
    const comprimento = Math.min(1.1, 0.15 + rapidez * 0.11) * (0.6 + Math.random() * 0.6)
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.6), transparent: true, opacity: 0.75, depthWrite: false })
    const linha = new THREE.Mesh(geometriaDaLinha, material)
    linha.scale.set(0.008, 0.008, comprimento)
    linha.position.copy(ponto).add(lado).addScaledVector(rumo, -comprimento * (0.35 + Math.random() * 0.5))
    linha.lookAt(linha.position.clone().add(rumo))
    cena.add(linha)
    animar(
      170,
      (u) => {
        material.opacity = 0.75 * (1 - u)
        linha.scale.z = comprimento * (1 + 0.5 * u)
      },
      () => {
        linha.removeFromParent()
        material.dispose()
      },
    )
  }
}

let texturaDaEstrela: THREE.CanvasTexture | null = null
/** A estrela do brilho de anime: quatro pontas compridas, quatro curtas e o miolo aceso. */
function estrela(): THREE.CanvasTexture {
  if (texturaDaEstrela) return texturaDaEstrela
  const tamanho = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = tamanho
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const meio = tamanho / 2
  const miolo = ctx.createRadialGradient(meio, meio, 0, meio, meio, 26)
  miolo.addColorStop(0, 'rgba(255,255,255,1)')
  miolo.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = miolo
  ctx.fillRect(0, 0, tamanho, tamanho)
  const ponta = (angulo: number, comprimento: number, largura: number) => {
    ctx.save()
    ctx.translate(meio, meio)
    ctx.rotate(angulo)
    const brilho = ctx.createLinearGradient(0, 0, comprimento, 0)
    brilho.addColorStop(0, 'rgba(255,255,255,1)')
    brilho.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = brilho
    ctx.beginPath()
    ctx.moveTo(0, -largura)
    ctx.lineTo(comprimento, 0)
    ctx.lineTo(0, largura)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  for (let i = 0; i < 4; i++) ponta((i * Math.PI) / 2, 62, 5)
  for (let i = 0; i < 4; i++) ponta((i * Math.PI) / 2 + Math.PI / 4, 30, 3)
  texturaDaEstrela = new THREE.CanvasTexture(canvas)
  return texturaDaEstrela
}

/** A faísca de anime no ponto de contato: a estrela abre de uma vez, gira um pouco e some. */
export function faisca(cena: THREE.Object3D, ponto: THREE.Vector3, cor: THREE.ColorRepresentation, tamanho: number, ms = 240) {
  const material = new THREE.SpriteMaterial({ map: estrela(), color: new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.5), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
  const sprite = new THREE.Sprite(material)
  sprite.position.copy(ponto)
  sprite.renderOrder = 10
  cena.add(sprite)
  animar(
    ms,
    (u) => {
      const abre = u < 0.2 ? u / 0.2 : 1
      sprite.scale.setScalar(tamanho * (0.3 + 0.9 * abre) * (1 - 0.25 * Math.max(0, u - 0.2)))
      material.rotation = 0.5 * u
      material.opacity = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65
    },
    () => {
      sprite.removeFromParent()
      material.dispose()
    },
  )
}

export interface Leque {
  /** Põe o borrão atrás de quem gira: `centro` é o eixo do giro, `eixoX` e `eixoY` o plano do giro (o ângulo 0 em
   * `eixoX`, crescendo pra `eixoY`), `angulo` onde está quem gira agora e `raio` o tamanho dele. */
  mostrar: (centro: THREE.Vector3, eixoX: THREE.Vector3, eixoY: THREE.Vector3, angulo: number, raio: number, opacidade: number) => void
  /** Some aos poucos e se desfaz. */
  apagar: (ms: number) => void
}

/** O borrão de anime atrás do que gira rápido: um leque claro, mais forte junto do corpo e sumindo pra trás. */
export function criarLeque(cena: THREE.Object3D, cor: THREE.ColorRepresentation, abertura: number): Leque {
  const geometria = new THREE.RingGeometry(0.28, 1, 40, 1, 0, abertura)
  // o brilho cresce do fim do rastro até o corpo (no brilho somado, escuro é transparente)
  const base = new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.55)
  const posicoes = geometria.attributes.position
  const cores = new Float32Array(posicoes.count * 3)
  for (let i = 0; i < posicoes.count; i++) {
    const angulo = Math.atan2(posicoes.getY(i), posicoes.getX(i))
    const forca = Math.pow(Math.min(1, Math.max(0, (angulo < -1e-6 ? angulo + Math.PI * 2 : angulo) / abertura)), 1.6)
    cores[i * 3] = base.r * forca
    cores[i * 3 + 1] = base.g * forca
    cores[i * 3 + 2] = base.b * forca
  }
  geometria.setAttribute('color', new THREE.BufferAttribute(cores, 3))
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const malha = new THREE.Mesh(geometria, material)
  const grupo = new THREE.Group()
  grupo.add(malha)
  grupo.visible = false
  cena.add(grupo)
  let apagando = false
  return {
    mostrar(centro, eixoX, eixoY, angulo, raio, opacidade) {
      if (apagando) return
      const z = new THREE.Vector3().crossVectors(eixoX, eixoY).normalize()
      grupo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(eixoX.clone().normalize(), z.clone().cross(eixoX).normalize(), z))
      grupo.position.copy(centro)
      grupo.scale.setScalar(raio)
      malha.rotation.z = angulo - abertura
      material.opacity = opacidade
      grupo.visible = opacidade > 0.01
    },
    apagar(ms) {
      if (apagando) return
      apagando = true
      const de = material.opacity
      animar(
        ms,
        (u) => (material.opacity = de * (1 - u)),
        () => {
          grupo.removeFromParent()
          geometria.dispose()
          material.dispose()
        },
      )
    },
  }
}

/** Um ponto do rastro de luz (o oito da Dempsey Roll, a imagem que fica atrás do que passa rápido): acende e some. */
export function rastroDeBrilho(cena: THREE.Object3D, ponto: THREE.Vector3, cor: THREE.ColorRepresentation, tamanho: number, ms = 220) {
  const sprite = spriteDeBrilho(cor, tamanho, 0.8)
  sprite.position.copy(ponto)
  cena.add(sprite)
  animar(
    ms,
    (u) => {
      sprite.material.opacity = 0.8 * (1 - u)
      sprite.scale.setScalar(tamanho * (1 - 0.5 * u))
    },
    () => {
      sprite.removeFromParent()
      sprite.material.dispose()
    },
  )
}

/** O anel de impacto do anime: uma onda que abre no ponto do golpe, de frente pra \`direcao\` dele, e some. */
export function anelDeImpacto(cena: THREE.Object3D, ponto: THREE.Vector3, direcao: THREE.Vector3, cor: THREE.ColorRepresentation, tamanho: number, ms = 220) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.6), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 32), material)
  anel.position.copy(ponto)
  anel.lookAt(ponto.clone().add(direcao))
  cena.add(anel)
  animar(
    ms,
    (u) => {
      anel.scale.setScalar(tamanho * (0.25 + 1.1 * (1 - (1 - u) ** 2)))
      material.opacity = 0.9 * (1 - u)
    },
    () => {
      anel.removeFromParent()
      anel.geometry.dispose()
      material.dispose()
    },
  )
}

/** O estouro de riscos do anime no ponto do golpe: riscos finos saindo pra todo lado, rápidos, e somem. */
export function estouroDeRiscos(cena: THREE.Object3D, ponto: THREE.Vector3, quantos: number, comprimento: number, cor: THREE.ColorRepresentation, ms = 180) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).lerp(new THREE.Color(0xffffff), 0.7), transparent: true, opacity: 0.95, depthWrite: false })
  const riscos = Array.from({ length: quantos }, () => {
    const rumo = new THREE.Vector3().randomDirection()
    const risco = new THREE.Mesh(geometriaDaLinha, material)
    risco.lookAt(rumo)
    cena.add(risco)
    return { risco, rumo, comprimento: comprimento * (0.6 + Math.random() * 0.6) }
  })
  animar(
    ms,
    (u) => {
      for (const { risco, rumo, comprimento: c } of riscos) {
        const saida = 0.25 + u * 1.1
        risco.position.copy(ponto).addScaledVector(rumo, c * saida)
        risco.lookAt(risco.position.clone().add(rumo))
        risco.scale.set(0.006, 0.006, c * (1 - u * 0.6))
      }
      material.opacity = 0.95 * (1 - u)
    },
    () => {
      for (const { risco } of riscos) risco.removeFromParent()
      material.dispose()
    },
  )
}

/** Os respingos do rosto atingido (o suor do anime): gotas pequenas voando pra \`direcao\` do golpe e caindo. */
export function respingos(cena: THREE.Object3D, ponto: THREE.Vector3, direcao: THREE.Vector3, tamanho: number, ms = 420) {
  const material = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.9, depthWrite: false })
  const geometria = new THREE.SphereGeometry(tamanho, 6, 4)
  const gotas = Array.from({ length: 6 }, () => {
    const gota = new THREE.Mesh(geometria, material)
    gota.position.copy(ponto)
    cena.add(gota)
    const velocidade = direcao.clone().normalize().multiplyScalar(1.4 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9))
    return { gota, velocidade }
  })
  animar(
    ms,
    (u) => {
      const t = (u * ms) / 1000
      for (const { gota, velocidade } of gotas) gota.position.copy(ponto).addScaledVector(velocidade, t).add(new THREE.Vector3(0, -4.9 * t * t, 0))
      material.opacity = 0.9 * (1 - u)
    },
    () => {
      for (const { gota } of gotas) gota.removeFromParent()
      geometria.dispose()
      material.dispose()
    },
  )
}
