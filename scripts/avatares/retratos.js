// Retrato de cada peça do jogo, com os mesmos modelos e cores do tabuleiro. Quem roda isto é
// scripts/gerar-avatares.mjs, com o site de desenvolvimento no ar.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'

const LADO = 256
const PECAS = { peao: 'peao_rpg.glb', cavalo: 'cavalo_rpg.glb', bispo: 'bispo_rpg.glb', torre: 'torre_rpg.glb', dama: 'dama_rpg.glb', rei: 'rei_rpg.glb' }
// giro e aproximação de cada retrato: o cavaleiro vem montado e pede um pouco mais de distância
const ENQUADRAMENTO = { cavalo: { giro: 0.6, distancia: 1.35 } }
const PADRAO = { giro: 0.4, distancia: 1 }

const brilho = (cor) => new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1.4, roughness: 0.4 })
// as mesmas cores de materiaisPorFaccao em ChessBoard3D.tsx
const FACCOES = {
  brancas: {
    armadura: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.55, roughness: 0.3 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x2a4d8f, metalness: 0.1, roughness: 0.6 }),
    brilho: brilho(0x8fe3ff),
    fundo: ['#3b5a94', '#101a33'],
  },
  pretas: {
    armadura: new THREE.MeshStandardMaterial({ color: 0x2c2d33, metalness: 0.6, roughness: 0.32 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x8a2222, metalness: 0.1, roughness: 0.6 }),
    brilho: brilho(0xff7a5c),
    fundo: ['#8f3226', '#2a0d0a'],
  },
}
const coroa = new THREE.MeshStandardMaterial({ color: 0xe0b93d, metalness: 1, roughness: 0.22 })
const lamina = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, metalness: 1, roughness: 0.18 })
const caboKatana = new THREE.MeshStandardMaterial({ color: 0x1f2a44, metalness: 0.2, roughness: 0.7 })
const saya = new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.1, roughness: 0.22 })

function materialDa(nome, faccao) {
  if (nome === 'Detalhe') return faccao.detalhe
  if (nome === 'Coroa') return coroa
  if (nome === 'Brilho') return faccao.brilho
  if (nome === 'EspadaLamina') return lamina
  if (nome === 'EspadaCabo' || nome === 'CaboBainha') return caboKatana
  if (nome === 'BainhaKatana') return saya
  return faccao.armadura
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(LADO, LADO, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x000000, 0)

const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.9))
const principal = new THREE.DirectionalLight(0xfff1dc, 3)
principal.position.set(3, 5, 6)
scene.add(principal)
const preenchimento = new THREE.DirectionalLight(0xdfe8ff, 1)
preenchimento.position.set(-5, 2, 3)
scene.add(preenchimento)
const contorno = new THREE.DirectionalLight(0xffe2b8, 2)
contorno.position.set(0, 4, -6)
scene.add(contorno)

const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 100)
const loader = new GLTFLoader()

function montar(gltf, faccao) {
  const modelo = clonarComEsqueleto(gltf.scene)
  const malhas = []
  modelo.traverse((filho) => {
    if (filho instanceof THREE.SkinnedMesh) malhas.push(filho)
  })
  for (const malha of malhas) {
    const nome = malha.material?.name
    malha.material = materialDa(nome, faccao)
    malha.frustumCulled = false
    // no tabuleiro a espada fica guardada: só o cabo aparece
    if (nome === 'EspadaLamina' || nome === 'EspadaCabo') malha.visible = false
  }
  const mixer = new THREE.AnimationMixer(modelo)
  const parado = gltf.animations.find((clipe) => clipe.name === 'Parado')
  if (parado) mixer.clipAction(parado).play()
  mixer.update(1)
  modelo.updateWorldMatrix(true, true)
  return modelo
}

function posicaoDaCabeca(modelo) {
  let cabeca = null
  modelo.traverse((filho) => {
    if (filho.isBone && /head$/i.test(filho.name)) cabeca ??= filho
  })
  return cabeca.getWorldPosition(new THREE.Vector3())
}

function retrato(pecaNome, faccao, gltf) {
  const modelo = montar(gltf, faccao)
  scene.add(modelo)
  const { giro, distancia } = { ...PADRAO, ...ENQUADRAMENTO[pecaNome] }
  const cabeca = posicaoDaCabeca(modelo)
  const altura = cabeca.y
  // o osso da cabeça fica no pescoço: mirar nele pega a cabeça, o que vai em cima dela e os ombros
  const alvo = cabeca.clone().add(new THREE.Vector3(0, altura * 0.04, 0))
  const raio = altura * 2.3 * distancia
  camera.position.set(alvo.x + Math.sin(giro) * raio, alvo.y + altura * 0.08, alvo.z + Math.cos(giro) * raio)
  camera.lookAt(alvo)
  renderer.render(scene, camera)

  const quadro = document.createElement('canvas')
  quadro.width = quadro.height = LADO
  const contexto = quadro.getContext('2d')
  const fundo = contexto.createRadialGradient(LADO / 2, LADO * 0.42, LADO * 0.08, LADO / 2, LADO / 2, LADO * 0.72)
  fundo.addColorStop(0, faccao.fundo[0])
  fundo.addColorStop(1, faccao.fundo[1])
  contexto.fillStyle = fundo
  contexto.fillRect(0, 0, LADO, LADO)
  contexto.drawImage(renderer.domElement, 0, 0)
  scene.remove(modelo)
  return quadro.toDataURL('image/webp', 0.9)
}

const retratos = {}
for (const [nome, arquivo] of Object.entries(PECAS)) {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${arquivo}`)
  for (const [corNome, faccao] of Object.entries(FACCOES)) {
    const url = retrato(nome, faccao, gltf)
    retratos[`${nome}-${corNome}`] = url
    const imagem = new Image()
    imagem.src = url
    document.getElementById('folha').append(imagem)
  }
}
window.__retratos = retratos
