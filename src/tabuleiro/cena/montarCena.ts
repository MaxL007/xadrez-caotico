// A cena 3D do tabuleiro: o desenho (renderer), a câmera e o controle de órbita, as luzes, a mesa, a moldura, as casas
// de madeira, as coordenadas e os grupos onde entram as peças e os destaques. Só monta: quem mexe em tudo isso é o
// ChessBoard3D (e os módulos de câmera, lances e partida).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { QualidadeXadrez } from '../../jogo/configXadrez'
import { COR_XEQUE, criarTexturaMadeira, criarTexturaTexto, definirLadoDaCamera, LETRAS_COLUNAS, materialMadeira, squareToPos } from '../casas'

const LARGURA_FULL_HD = 1920
const ALTURA_FULL_HD = 1080

export interface Qualidade {
  /** Quantos pixels de desenho por pixel da tela, pro tamanho do tabuleiro na tela. */
  resolucao: (largura: number, altura: number) => number
  /** Tamanho do mapa de sombras; 0, sem sombras. */
  sombras: number
  /** Teto de quadros por segundo; 0, o que a tela der. */
  quadrosPorSegundo: number
  /** Antisserrilhado e o filtro que deixa a madeira nítida de longe. Valem ao abrir o jogo. */
  acabamento: boolean
}

/** O que cada qualidade do jogo muda. */
export const QUALIDADES: Record<QualidadeXadrez, Qualidade> = {
  // a leve, pra celular e computador fracos: abaixo da resolução da tela, sem sombras, sem antisserrilhado e a 30
  // quadros por segundo. A imagem fica mais simples, mas o aparelho aguenta
  baixa: { resolucao: () => Math.min(window.devicePixelRatio || 1, 1.25) * 0.8, sombras: 0, quadrosPorSegundo: 30, acabamento: false },
  // o padrão: até 1,6 vez a tela (no celular, que tem tela densa, bem menos que Full HD), com sombras médias e nunca
  // abaixo da resolução da tela no computador
  media: {
    resolucao: (largura, altura) => Math.max(Math.min(window.devicePixelRatio || 1, 1), Math.min(pixelRatioParaFullHD(largura, altura), 2) * 0.8),
    sombras: 1024,
    quadrosPorSegundo: 0,
    acabamento: true,
  },
  // a mais bonita, como sempre foi: no mínimo Full HD, com as sombras grandes
  alta: { resolucao: (largura, altura) => pixelRatioParaFullHD(largura, altura), sombras: 2048, quadrosPorSegundo: 0, acabamento: true },
}

/** Calcula o pixel ratio necessário pra garantir que o canvas renderize em pelo menos Full HD (1920x1080), mesmo quando o card exibido na tela é menor — limitado a 3x pra não sobrecarregar a GPU em telas muito pequenas. */
function pixelRatioParaFullHD(larguraCss: number, alturaCss: number): number {
  const dpr = window.devicePixelRatio || 1
  const fatorParaFullHD = Math.max(LARGURA_FULL_HD / Math.max(larguraCss, 1), ALTURA_FULL_HD / Math.max(alturaCss, 1))
  return Math.min(Math.max(dpr, fatorParaFullHD), 3)
}

export type CenaDoTabuleiro = ReturnType<typeof montarCena>

export function montarCena(container: HTMLDivElement, qualidade: QualidadeXadrez) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf5f0e6)
  // "far" bem além do maxDistance do controle de órbita (20) — antes os dois coincidiam, então
  // no zoom mais distante o tabuleiro chegava a ficar 100% da cor da névoa (basicamente
  // invisível); agora ele só vai desbotando um pouco, nunca sumindo, não importa a distância
  scene.fog = new THREE.Fog(0xf5f0e6, 11, 55)

  // câmera mais afastada e com FOV mais fechado que o normal — bem próxima e com campo de visão
  // largo deixava o tabuleiro com uma perspectiva exagerada, quase "olhando de raspão"
  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
  definirLadoDaCamera(1)
  camera.position.set(0, 9.5, 10)
  camera.lookAt(0, 0, 0)

  // o antisserrilhado só se escolhe ao criar o desenho: quem troca de ou pra baixa vê a diferença ao abrir o jogo de novo
  const qualidadeDeInicio = QUALIDADES[qualidade]
  const renderer = new THREE.WebGLRenderer({ antialias: qualidadeDeInicio.acabamento, powerPreference: 'high-performance' })
  renderer.setSize(container.clientWidth, container.clientHeight, false)
  // o desenho sempre preenche o espaço dele (CSS): com largura fixa em pixels ele impedia o espaço de
  // encolher (abrir o menu, sair da tela cheia) e o tabuleiro ficava descentralizado/cortado — só a
  // resolução interna acompanha o tamanho (onResize)
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
  renderer.setPixelRatio(qualidadeDeInicio.resolucao(container.clientWidth, container.clientHeight))
  renderer.shadowMap.enabled = true
  // o machado e a gravidade recortam a peça (metade de cima, o que já entrou no chão)
  renderer.localClippingEnabled = true
  // sombras suaves de verdade (borda esfumada, como a de uma luz real), em alta resolução
  renderer.shadowMap.type = THREE.VSMShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // visual "HD": tons cinematográficos (ACES), que seguram o brilho do metal e do verniz sem
  // estourar o branco
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  container.appendChild(renderer.domElement)
  const anisotropia = qualidadeDeInicio.acabamento ? renderer.capabilities.getMaxAnisotropy() : 1

  // reflexo de ambiente (um "estúdio" gerado na hora, sem imagem externa): é o que faz o metal das
  // armaduras, o ouro das coroas e o verniz do tabuleiro brilharem de verdade
  let reflexo: THREE.WebGLRenderTarget | null = null
  function gerarReflexoDoAmbiente() {
    const gerador = new THREE.PMREMGenerator(renderer)
    reflexo?.dispose()
    reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = reflexo.texture
    gerador.dispose()
  }
  gerarReflexoDoAmbiente()
  scene.environmentIntensity = 0.55
  // a placa de vídeo devolveu o contexto (aba voltou do segundo plano): o three.js reenvia as texturas
  // sozinho, mas o reflexo é desenhado na própria placa e precisa ser feito de novo
  renderer.domElement.addEventListener('webglcontextrestored', gerarReflexoDoAmbiente)

  const controls = new OrbitControls(camera, renderer.domElement)
  // o alvo fica na altura do corpo das peças (torso), não no chão do tabuleiro — senão o zoom
  // aproxima em direção a um ponto na casca do tabuleiro, e a peça (que tem altura) acaba saindo
  // por cima da tela bem antes da câmera "chegar" nela. Com o alvo na altura das peças, dá pra
  // aproximar de verdade até ficar cara a cara com uma peça, em vez de mergulhar no tabuleiro.
  controls.target.set(0, 0.4, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 2.2
  controls.maxDistance = 20
  controls.maxPolarAngle = Math.PI / 2 - 0.05
  controls.enabled = false
  const INCLINACAO_CAMERA_JOGO = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi

  // luz principal (com sombra suave), luz de preenchimento do lado oposto e uma luz de contorno
  // por trás, que destaca a silhueta das peças contra o fundo
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.3))
  const dirLight = new THREE.DirectionalLight(0xfff1dc, 2.4)
  dirLight.position.set(4, 10, 6)
  dirLight.castShadow = qualidadeDeInicio.sombras > 0
  dirLight.shadow.mapSize.setScalar(qualidadeDeInicio.sombras || 1024)
  dirLight.shadow.camera.left = -6.5
  dirLight.shadow.camera.right = 6.5
  dirLight.shadow.camera.top = 6.5
  dirLight.shadow.camera.bottom = -6.5
  dirLight.shadow.camera.near = 1
  dirLight.shadow.camera.far = 30
  dirLight.shadow.radius = 5
  dirLight.shadow.blurSamples = 12
  dirLight.shadow.bias = -0.0004
  dirLight.shadow.normalBias = 0.02
  scene.add(dirLight)
  const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.45)
  fillLight.position.set(-5, 6, -4)
  scene.add(fillLight)
  const luzContorno = new THREE.DirectionalLight(0xffe2b8, 0.7)
  luzContorno.position.set(0, 5, -9)
  scene.add(luzContorno)

  // madeiras: bordo claro (casas claras), nogueira (casas escuras), nogueira escura (moldura) e
  // a mesa embaixo
  const madeiraClara = criarTexturaMadeira([226, 201, 160], [190, 150, 102], 1.7)
  const madeiraEscura = criarTexturaMadeira([104, 62, 36], [58, 31, 16], 4.3)
  const madeiraMoldura = criarTexturaMadeira([70, 40, 22], [36, 19, 9], 7.9, 10)
  const madeiraMesa = criarTexturaMadeira([60, 40, 28], [40, 26, 18], 2.2, 34)

  // mesa embaixo do tabuleiro, recebendo a sombra dele e sumindo no fundo com a névoa
  madeiraMesa.repeat.set(6, 6)
  madeiraMesa.anisotropy = anisotropia
  const mesa = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: madeiraMesa, roughness: 0.7, metalness: 0 }),
  )
  mesa.rotation.x = -Math.PI / 2
  mesa.position.y = -0.36
  mesa.receiveShadow = true
  scene.add(mesa)

  // moldura: bloco de nogueira com quinas arredondadas embaixo das casas (aparece nos frisos entre
  // elas) e uma borda levemente elevada em volta, com um filete dourado na beira de dentro
  const materialMoldura = materialMadeira(madeiraMoldura, anisotropia)
  const base = new THREE.Mesh(new RoundedBoxGeometry(9.4, 0.34, 9.4, 4, 0.06), materialMoldura)
  base.position.y = -0.19
  base.receiveShadow = true
  base.castShadow = true
  scene.add(base)
  const bordaGeo = new RoundedBoxGeometry(9.4, 0.06, 0.7, 3, 0.02)
  const bordaLadoGeo = new RoundedBoxGeometry(0.7, 0.06, 8.0, 3, 0.02)
  const bordas: [THREE.BufferGeometry, number, number][] = [
    [bordaGeo, 0, 4.35],
    [bordaGeo, 0, -4.35],
    [bordaLadoGeo, 4.35, 0],
    [bordaLadoGeo, -4.35, 0],
  ]
  for (const [geo, x, z] of bordas) {
    const borda = new THREE.Mesh(geo, materialMoldura)
    borda.position.set(x, 0.01, z)
    borda.receiveShadow = true
    borda.castShadow = true
    scene.add(borda)
  }
  const materialFilete = new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 1, roughness: 0.25 })
  const fileteGeo = new THREE.BoxGeometry(8.06, 0.012, 0.03)
  for (let lado = 0; lado < 4; lado++) {
    const filete = new THREE.Mesh(fileteGeo, materialFilete)
    const angulo = (lado * Math.PI) / 2
    filete.rotation.y = angulo
    filete.position.set(Math.sin(angulo) * 4.03, 0.042, Math.cos(angulo) * 4.03)
    scene.add(filete)
  }

  // casas: madeira de verdade com verniz e quinas levemente arredondadas — entre uma casa e outra
  // fica um friso fino, como num tabuleiro de marchetaria. Cada casa usa um pedaço diferente da
  // textura (e metade delas com o veio girado), pra não parecerem carimbadas.
  const boardGroup = new THREE.Group()
  const squareMeshes: THREE.Mesh[] = []
  const squareGeo = new RoundedBoxGeometry(0.985, 0.1, 0.985, 3, 0.012)
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const square = `${String.fromCharCode(97 + f)}${r + 1}`
      const clara = (f + r) % 2 === 1
      const mat = materialMadeira(clara ? madeiraClara : madeiraEscura, anisotropia, {
        x: Math.random(),
        y: Math.random(),
        giro: (f + r) % 4 < 2 ? 0 : Math.PI / 2,
      })
      const mesh = new THREE.Mesh(squareGeo, mat)
      const { x, z } = squareToPos(square)
      mesh.position.set(x, -0.05, z)
      mesh.receiveShadow = true
      mesh.userData.square = square
      boardGroup.add(mesh)
      squareMeshes.push(mesh)
    }
  }
  scene.add(boardGroup)

  // coordenadas padrão do xadrez — colunas a-h na borda de trás (lado das brancas) e linhas 1-8
  // na borda esquerda, gravadas em dourado na moldura
  const labelsGroup = new THREE.Group()
  const labelGeo = new THREE.PlaneGeometry(0.36, 0.36)
  for (let f = 0; f < 8; f++) {
    const textura = criarTexturaTexto(LETRAS_COLUNAS[f])
    textura.anisotropy = anisotropia
    const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
    const mesh = new THREE.Mesh(labelGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    const { x } = squareToPos(`${LETRAS_COLUNAS[f]}1`)
    mesh.position.set(x, 0.045, 4.35)
    labelsGroup.add(mesh)
  }
  for (let r = 0; r < 8; r++) {
    const textura = criarTexturaTexto(String(r + 1))
    textura.anisotropy = anisotropia
    const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
    const mesh = new THREE.Mesh(labelGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    const { z } = squareToPos(`a${r + 1}`)
    mesh.position.set(-4.35, 0.045, z)
    labelsGroup.add(mesh)
  }
  scene.add(labelsGroup)

  const piecesGroup = new THREE.Group()
  scene.add(piecesGroup)
  const highlightGroup = new THREE.Group()
  scene.add(highlightGroup)

  // casa do Rei em xeque: vermelha (pulsando de leve), por cima da madeira e por baixo dos destaques
  // de seleção — fica até o xeque acabar
  const xequeMat = new THREE.MeshBasicMaterial({ color: COR_XEQUE, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
  const xequeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.97), xequeMat)
  xequeMesh.rotation.x = -Math.PI / 2
  xequeMesh.visible = false
  scene.add(xequeMesh)

  return {
    scene,
    camera,
    renderer,
    controls,
    INCLINACAO_CAMERA_JOGO,
    dirLight,
    squareMeshes,
    labelsGroup,
    piecesGroup,
    highlightGroup,
    xequeMesh,
    xequeMat,
    gerarReflexoDoAmbiente,
    descartarReflexo: () => reflexo?.dispose(),
  }
}
