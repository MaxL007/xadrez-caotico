import * as THREE from 'three'

// As casas do tabuleiro: onde fica cada uma no 3D, a câmera, o contorno das peças geométricas e as texturas de madeira e das letras.

export const COR_SELECIONADA = 0x2a9d5f
export const COR_DESTINO = 0x2a78d6
/** Casa do Rei em xeque. */
export const COR_XEQUE = 0xe53935
/** Meia largura do tabuleiro com a moldura e as coordenadas — o que a câmera precisa enquadrar. */
export const MEIA_LARGURA_TABULEIRO = 4.6

/** Celular (em pé, ou deitado com a tela baixa): ao começar uma partida o tabuleiro vai pra tela cheia. */
export function ehCelular(): boolean {
  return window.matchMedia?.('(max-width: 767px), (pointer: coarse) and (max-height: 500px)').matches ?? false
}

export function squareToPos(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { x: file - 3.5, z: 3.5 - rank }
}

// mesma posição da câmera de baixo (ver camera.position.set, olhando pra origem) — replicada aqui
// só pra alimentar a compensação de perspectiva abaixo, sem dependência circular com o efeito que
// monta a cena
const CAMERA_Y = 9.5
const CAMERA_Z = 10
// altura do "centro visual" de uma peça acima do chão (a peça tem ~0,9 de altura, mas o volume
// visível se concentra um pouco acima da metade) — medido por diferença de pixels contra o
// tabuleiro vazio, não chutado
const ALTURA_VISUAL_PECA = 0.55
/** De que lado do tabuleiro a câmera fica: 1 = das brancas, -1 = das pretas (ver virarCameraPara). */
export let ladoDaCamera: 1 | -1 = 1
/** Muda o lado da câmera (quem importa lê `ladoDaCamera`, mas só daqui ele muda). */
export function definirLadoDaCamera(lado: 1 | -1) {
  ladoDaCamera = lado
}

/**
 * Posição X/Z de uma peça na casa, com uma pequena correção de perspectiva no eixo X: a câmera vê o
 * tabuleiro de um ângulo e a peça tem altura, então toda peça alta (não só o peão — torre, cavalo,
 * o que for) parece "inclinada" pra fora do eixo central da câmera; quanto mais longe da coluna do
 * meio e mais perto da câmera, mais forte. A conta desloca a peça pra dentro, o suficiente pra que
 * o centro visual (ALTURA_VISUAL_PECA acima do chão) projete na mesma coluna da tela que o centro
 * da casa. Só o X muda — a profundidade (Z) fica exata, senão o pé da peça sairia da casa. Vale pra
 * câmera inicial; se o jogador girar o tabuleiro, o desvio volta a aparecer, só que pequeno.
 */
export function squareToPosPeca(square: string): { x: number; z: number } {
  const { x, z } = squareToPos(square)
  const profundidadeCasa = CAMERA_Y * CAMERA_Y + CAMERA_Z * (CAMERA_Z - z * ladoDaCamera)
  const fator = (CAMERA_Y * ALTURA_VISUAL_PECA) / profundidadeCasa
  return { x: x * (1 - fator), z }
}

// ---------------------------------------------------------------------------
// Contorno preto das peças geométricas (usadas só se o modelo RPG do tipo não carregar) — a
// técnica clássica do "casco invertido": um clone da mesma peça, ligeiramente maior e renderizado
// só por dentro/atrás. As peças RPG (o visual HD) não têm contorno.
// ---------------------------------------------------------------------------
const COR_CONTORNO = 0x1a1410
const materialContorno = new THREE.MeshBasicMaterial({ color: COR_CONTORNO, side: THREE.BackSide })

export function criarContorno(geo: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, materialContorno)
  mesh.scale.setScalar(1.06)
  return mesh
}

/** Desenha um texto curto num canvas pra usar como textura — usado nas coordenadas (a-h, 1-8) na
 * moldura do tabuleiro: dourado com uma sombra leve, em alta resolução (nítido mesmo de perto). */
// Os desenhos das texturas ficam na memória comum, não na placa de vídeo. No celular, a aba em segundo plano
// pode perder tudo o que estava na placa, e o tabuleiro e o fundo voltavam pretos.
export const DESENHO_NA_MEMORIA: CanvasRenderingContext2DSettings = { willReadFrequently: true }

export function criarTexturaTexto(texto: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  ctx.font = 'bold 170px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillText(texto, 134, 142)
  const dourado = ctx.createLinearGradient(0, 40, 0, 220)
  dourado.addColorStop(0, '#f7e3a1')
  dourado.addColorStop(0.5, '#d9ae4a')
  dourado.addColorStop(1, '#9c7428')
  ctx.fillStyle = dourado
  ctx.fillText(texto, 128, 136)
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.needsUpdate = true
  return textura
}

/**
 * Madeira desenhada num canvas (sem imagem externa): veios ondulados ao longo de um eixo, com
 * variação fina e um pouco de ruído — o mesmo desenho dá bordo claro, nogueira ou a mesa, só mudando
 * as cores. `semente` muda o desenho dos veios.
 */
export function criarTexturaMadeira(
  corBase: [number, number, number],
  corVeio: [number, number, number],
  semente: number,
  veios = 14,
  tamanho = 512,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = tamanho
  canvas.height = tamanho
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  const imagem = ctx.createImageData(tamanho, tamanho)
  const ruido = (x: number, y: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + semente * 37.719) * 43758.5453
    return v - Math.floor(v)
  }
  for (let y = 0; y < tamanho; y++) {
    const v = y / tamanho
    for (let x = 0; x < tamanho; x++) {
      const u = x / tamanho
      const onda =
        u * veios +
        0.45 * Math.sin(v * 6.283 + semente) +
        0.18 * Math.sin(v * 18.85 + semente * 2.3) +
        0.06 * Math.sin(u * 41 + v * 13 + semente * 5.1)
      const anel = Math.pow(0.5 + 0.5 * Math.sin(onda * 6.283), 3)
      const fibra = 0.5 + 0.5 * Math.sin(u * veios * 9.7 + 0.8 * Math.sin(v * 31 + semente))
      // manchas largas e suaves (a madeira nunca tem a mesma cor de ponta a ponta)
      const mancha = 0.5 + 0.5 * Math.sin(u * 3.1 + 1.7 * Math.sin(v * 2.3 + semente) + semente * 1.3)
      const t = Math.max(0, Math.min(1, anel * 0.32 + fibra * 0.1 + mancha * 0.22 + (ruido(x, y) - 0.5) * 0.08))
      const i = (y * tamanho + x) * 4
      imagem.data[i] = corBase[0] + (corVeio[0] - corBase[0]) * t
      imagem.data[i + 1] = corBase[1] + (corVeio[1] - corBase[1]) * t
      imagem.data[i + 2] = corBase[2] + (corVeio[2] - corBase[2]) * t
      imagem.data[i + 3] = 255
    }
  }
  ctx.putImageData(imagem, 0, 0)
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.wrapS = THREE.RepeatWrapping
  textura.wrapT = THREE.RepeatWrapping
  return textura
}

/** Material de madeira fosca (sem verniz nem reflexo — o brilho refletido nas casas atrapalhava ver
 * o jogo), a partir de uma textura base — cada casa usa um pedaço diferente dela
 * (deslocamento/giro), pra não parecerem carimbadas. */
export function materialMadeira(base: THREE.Texture, anisotropia: number, deslocamento?: { x: number; y: number; giro: number }) {
  const mapa = base.clone()
  mapa.anisotropy = anisotropia
  if (deslocamento) {
    mapa.offset.set(deslocamento.x, deslocamento.y)
    mapa.center.set(0.5, 0.5)
    mapa.rotation = deslocamento.giro
  }
  mapa.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.85, metalness: 0, envMapIntensity: 0.25 })
}

export const LETRAS_COLUNAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
