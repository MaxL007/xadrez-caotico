import * as THREE from 'three'

// O expositor de equipamentos: um pedestal de madeira e ouro, com luz de vitrine, onde o equipamento aparece sozinho e
// girando. Serve aos quadrados da Personalização e aos cartões da Loja.

export interface Expositor {
  cena: THREE.Scene
  camera: THREE.PerspectiveCamera
}

/** A cena do expositor; o reflexo vem do renderizador de quem usa. */
export function criarExpositor(reflexo: THREE.Texture): Expositor {
  const cena = new THREE.Scene()
  cena.environment = reflexo
  cena.environmentIntensity = 0.7
  cena.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.9))
  const holofote = new THREE.DirectionalLight(0xfff1dc, 2.4)
  holofote.position.set(1.5, 3, 3)
  cena.add(holofote)
  const pedestal = new THREE.Group()
  const madeira = new THREE.MeshStandardMaterial({ color: 0x4a2d15, roughness: 0.55, metalness: 0.1 })
  const ouro = new THREE.MeshStandardMaterial({ color: 0xe0b93d, metalness: 1, roughness: 0.25 })
  pedestal.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.09, 32), madeira))
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.012, 8, 40), ouro)
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.045
  pedestal.add(aro)
  pedestal.position.y = -0.62
  cena.add(pedestal)
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20)
  camera.position.set(0, 0.3, 2.45)
  camera.lookAt(0, -0.12, 0)
  return { cena, camera }
}

/** Centraliza o equipamento e deixa ele do mesmo tamanho em todo expositor, num suporte que gira. */
export function noSuporte(equipamento: THREE.Object3D): THREE.Group {
  const suporte = new THREE.Group()
  suporte.add(equipamento)
  const caixa = new THREE.Box3().setFromObject(equipamento)
  const tamanho = caixa.getSize(new THREE.Vector3())
  equipamento.position.sub(caixa.getCenter(new THREE.Vector3()))
  suporte.scale.setScalar(1 / Math.max(tamanho.x, tamanho.y, tamanho.z, 0.001))
  return suporte
}

/** Desenha só esse equipamento do expositor no retângulo dado (em pixels de tela, a partir de baixo). */
export function desenharNoExpositor(
  renderer: THREE.WebGLRenderer,
  { cena, camera }: Expositor,
  equipamento: THREE.Object3D,
  todos: Iterable<THREE.Object3D>,
  [x, y, largura, altura]: [number, number, number, number],
) {
  for (const outro of todos) outro.visible = outro === equipamento
  camera.aspect = largura / altura
  camera.updateProjectionMatrix()
  renderer.setViewport(x, y, largura, altura)
  renderer.setScissor(x, y, largura, altura)
  renderer.render(cena, camera)
}
