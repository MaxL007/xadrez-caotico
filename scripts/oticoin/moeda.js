// A óticoin em 3D: dourada, com o peão em relevo de um lado e o rei do outro, como no molde. Gira em volta do eixo de
// pé; cada quadro do giro vira uma imagem, e o site toca as imagens em sequência. Quem roda é scripts/gerar-oticoin.mjs.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const LADO = 128
const QUADROS = 32
const ESPESSURA = 0.09

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(LADO, LADO, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x000000, 0)

const cena = new THREE.Scene()
const gerador = new THREE.PMREMGenerator(renderer)
cena.environment = gerador.fromScene(new RoomEnvironment(), 0.04).texture
cena.environmentIntensity = 0.5
const luz = new THREE.DirectionalLight(0xfff1dc, 2.2)
luz.position.set(3, 2.5, 2)
cena.add(luz)
cena.add(new THREE.AmbientLight(0xffffff, 0.3))

const ouro = new THREE.MeshStandardMaterial({ color: 0xe8b93a, metalness: 1, roughness: 0.36 })
const ouroEscuro = new THREE.MeshStandardMaterial({ color: 0x9a6a1c, metalness: 1, roughness: 0.42 })

// o corpo da moeda: um disco com a borda alta dos dois lados, torneado em volta do eixo
const perfil = [
  [0, ESPESSURA / 2],
  [0.8, ESPESSURA / 2],
  [0.83, ESPESSURA / 2 + 0.03],
  [0.96, ESPESSURA / 2 + 0.03],
  [1, ESPESSURA / 2],
  [1, -ESPESSURA / 2],
  [0.96, -ESPESSURA / 2 - 0.03],
  [0.83, -ESPESSURA / 2 - 0.03],
  [0.8, -ESPESSURA / 2],
  [0, -ESPESSURA / 2],
].map(([r, y]) => new THREE.Vector2(r, y))
const disco = new THREE.LatheGeometry(perfil, 64)
disco.rotateX(Math.PI / 2)

// as figuras, desenhadas no plano e levantadas em relevo
function peao() {
  const cabeca = new THREE.Shape().absarc(0, 0.34, 0.14, 0, Math.PI * 2, false)
  const corpo = new THREE.Shape()
  corpo.moveTo(-0.1, 0.2)
  corpo.lineTo(0.1, 0.2)
  corpo.quadraticCurveTo(0.08, 0.05, 0.22, -0.3)
  corpo.lineTo(-0.22, -0.3)
  corpo.quadraticCurveTo(-0.08, 0.05, -0.1, 0.2)
  const gola = new THREE.Shape()
  gola.moveTo(-0.16, 0.2)
  gola.lineTo(0.16, 0.2)
  gola.lineTo(0.16, 0.14)
  gola.lineTo(-0.16, 0.14)
  const base = new THREE.Shape()
  base.moveTo(-0.32, -0.3)
  base.lineTo(0.32, -0.3)
  base.lineTo(0.32, -0.44)
  base.lineTo(-0.32, -0.44)
  return [cabeca, corpo, gola, base]
}

function rei() {
  const retangulo = (x0, y0, x1, y1) => {
    const forma = new THREE.Shape()
    forma.moveTo(x0, y0)
    forma.lineTo(x1, y0)
    forma.lineTo(x1, y1)
    forma.lineTo(x0, y1)
    return forma
  }
  const coroa = new THREE.Shape()
  coroa.moveTo(-0.2, 0.32)
  coroa.lineTo(0.2, 0.32)
  coroa.lineTo(0.15, 0.18)
  coroa.lineTo(-0.15, 0.18)
  const corpo = new THREE.Shape()
  corpo.moveTo(-0.12, 0.18)
  corpo.lineTo(0.12, 0.18)
  corpo.quadraticCurveTo(0.1, -0.05, 0.24, -0.3)
  corpo.lineTo(-0.24, -0.3)
  corpo.quadraticCurveTo(-0.1, -0.05, -0.12, 0.18)
  return [retangulo(-0.035, 0.32, 0.035, 0.56), retangulo(-0.1, 0.42, 0.1, 0.48), coroa, corpo, retangulo(-0.34, -0.3, 0.34, -0.45)]
}

const relevo = { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 16 }

const moeda = new THREE.Group()
moeda.add(new THREE.Mesh(disco, ouro))
const frente = new THREE.Mesh(new THREE.ExtrudeGeometry(peao(), relevo), ouroEscuro)
frente.position.z = ESPESSURA / 2 - 0.005
moeda.add(frente)
const verso = new THREE.Mesh(new THREE.ExtrudeGeometry(rei(), relevo), ouroEscuro)
verso.rotation.y = Math.PI
verso.position.z = -ESPESSURA / 2 + 0.005
moeda.add(verso)
// um anel fino de pontos na borda, dos dois lados
for (const lado of [1, -1]) {
  for (let i = 0; i < 28; i++) {
    const angulo = (i / 28) * Math.PI * 2
    const ponto = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), ouroEscuro)
    ponto.position.set(Math.cos(angulo) * 0.72, Math.sin(angulo) * 0.72, (lado * ESPESSURA) / 2)
    moeda.add(ponto)
  }
}
// inclinada, pra face de frente não espelhar a luz direto na câmera
moeda.rotation.x = -0.32
cena.add(moeda)

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
camera.position.set(0, 0, 4.3)
camera.lookAt(0, 0, 0)

const quadros = []
for (let i = 0; i < QUADROS; i++) {
  moeda.rotation.y = (i / QUADROS) * Math.PI * 2
  renderer.render(cena, camera)
  quadros.push(renderer.domElement.toDataURL('image/png'))
}

// a fileira de quadros numa imagem só, que o site anda de quadro em quadro
const folha = document.createElement('canvas')
folha.width = LADO * QUADROS
folha.height = LADO
const contexto = folha.getContext('2d')
for (const [i, url] of quadros.entries()) {
  const imagem = new Image()
  imagem.src = url
  await imagem.decode()
  contexto.drawImage(imagem, i * LADO, 0)
  const miniatura = new Image()
  miniatura.src = url
  document.getElementById('folha').append(miniatura)
}
// a óticoin também é a logo do jogo: o lado do peão em alta, pros ícones do aplicativo e do site
const ALTA = 512
renderer.setSize(ALTA, ALTA, false)
moeda.rotation.y = 0
renderer.render(cena, camera)
const logo = new Image()
logo.src = renderer.domElement.toDataURL('image/png')
await logo.decode()

/** A moeda num quadrado de `lado`, ocupando `parte` dele, sobre o fundo do jogo (ou transparente). */
function icone(lado, parte, comFundo) {
  const tela = document.createElement('canvas')
  tela.width = lado
  tela.height = lado
  const c = tela.getContext('2d')
  if (comFundo) {
    const fundo = c.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado * 0.72)
    fundo.addColorStop(0, '#3a2614')
    fundo.addColorStop(1, '#1c120a')
    c.fillStyle = fundo
    c.fillRect(0, 0, lado, lado)
  }
  c.imageSmoothingQuality = 'high'
  // a moeda ocupa uns 87% da largura do quadro renderizado; inclinada, um pouco mais da altura
  const tamanho = (lado * parte) / 0.87
  c.drawImage(logo, (lado - tamanho) / 2, (lado - tamanho) / 2, tamanho, tamanho)
  return tela.toDataURL('image/png')
}

window.__oticoin = {
  giro: folha.toDataURL('image/webp', 0.92),
  peao: quadros[0],
  rei: quadros[QUADROS / 2],
  icones: {
    // o normal, sem fundo: aba do navegador, janela no computador e a abertura do aplicativo
    'icone-192.png': icone(192, 0.86, false),
    'icone-512.png': icone(512, 0.86, false),
    // o do Android, que recorta em círculo ou gota: a moeda dentro da zona segura, com o fundo inteiro
    'icone-mascara-512.png': icone(512, 0.64, true),
    // o do iPhone, que não aceita transparência e arredonda os cantos
    'apple-touch-icon.png': icone(180, 0.78, true),
    'favicon-64.png': icone(64, 0.9, false),
  },
}
