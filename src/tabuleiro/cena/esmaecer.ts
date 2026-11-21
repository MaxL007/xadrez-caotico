import * as THREE from 'three'

// As peças que tampam a luta ficam quase transparentes enquanto ela dura (pedido do usuário: ver o golpe inteiro, mesmo
// que só as duas peças apareçam). Os materiais são compartilhados entre as peças do mesmo tipo e cor, então cada peça
// esmaecida ganha cópias, e os originais voltam no fim.

const esmaecidas = new Map<THREE.Object3D, Map<THREE.Mesh, THREE.Material | THREE.Material[]>>()

export function esmaecer(pecas: THREE.Object3D[], opacidade = 0.2) {
  for (const peca of pecas) {
    if (esmaecidas.has(peca)) continue
    const originais = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    peca.traverse((objeto) => {
      const malha = objeto as THREE.Mesh
      if (!malha.isMesh) return
      originais.set(malha, malha.material)
      const copia = (material: THREE.Material) => {
        const c = material.clone()
        c.transparent = true
        c.opacity = opacidade * material.opacity
        c.depthWrite = false
        return c
      }
      malha.material = Array.isArray(malha.material) ? malha.material.map(copia) : copia(malha.material)
    })
    esmaecidas.set(peca, originais)
  }
}

/** As peças esmaecidas voltam ao normal (a luta acabou). */
export function desesmaecer() {
  for (const originais of esmaecidas.values()) {
    for (const [malha, material] of originais) {
      const copias = malha.material
      for (const c of Array.isArray(copias) ? copias : [copias]) c.dispose()
      malha.material = material
    }
  }
  esmaecidas.clear()
}

/** Só nos testes: quantas peças estão esmaecidas agora. */
export const quantasEsmaecidas = () => esmaecidas.size
