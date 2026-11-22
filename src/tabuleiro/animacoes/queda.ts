import * as THREE from 'three'

// A peça capturada sumindo aos poucos. A queda dos golpes (e a do cavalo), jogada pela força do golpe, fica em
// combate/nocaute.ts.

/** Clona os materiais da peça (compartilhados entre todas da mesma facção/tipo) pra ela poder
 * sumir sozinha; devolve a função que muda a opacidade dela. */
export function prepararParaSumir(mesh: THREE.Object3D): (opacidade: number) => void {
  mesh.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const mat = obj.material
    if (Array.isArray(mat)) {
      obj.material = mat.map((m) => {
        const clone = m.clone()
        clone.transparent = true
        return clone
      })
    } else {
      const clone = mat.clone()
      clone.transparent = true
      obj.material = clone
    }
  })
  return (valor: number) => {
    mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => (m.opacity = valor))
      else mat.opacity = valor
    })
  }
}
