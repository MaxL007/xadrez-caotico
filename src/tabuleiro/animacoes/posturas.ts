import type * as THREE from 'three'
import { restaurarOssos, salvarOssos, type OssoSalvo } from '../pecas/ossos'

// Poses postas por cima do clipe da peça, osso por osso, a cada quadro (o peão montando no cavalo, por exemplo). É o
// mesmo jeito da luta sem arma: antes dos clipes o quadro desfaz a pose, pro clipe partir do que ele mesmo deixou, e
// depois deles guarda os ossos e posa de novo. Sem isso, o giro de um quadro somava no do seguinte.

interface Postura {
  peca: THREE.Object3D
  nomes: string[]
  ossos: OssoSalvo[]
  /** Posa a peça no instante `agora`; devolve false quando acabou. */
  posar: (agora: number) => boolean
}

const posturas = new Set<Postura>()

/** Começa a pose; devolve a função que a interrompe. */
export function adicionarPostura(peca: THREE.Object3D, nomes: string[], posar: (agora: number) => boolean): () => void {
  const postura: Postura = { peca, nomes, ossos: salvarOssos(peca, nomes), posar }
  posturas.add(postura)
  return () => {
    if (posturas.delete(postura)) restaurarOssos(postura.ossos)
  }
}

/** Antes dos clipes, a cada quadro. */
export function desfazerPosturas() {
  for (const p of posturas) restaurarOssos(p.ossos)
}

/** Depois dos clipes, a cada quadro: a pose precisa ser a última a mexer nos ossos. */
export function atualizarPosturas(agora: number) {
  for (const p of posturas) {
    if (!p.peca.parent) {
      posturas.delete(p)
      continue
    }
    p.ossos = salvarOssos(p.peca, p.nomes)
    if (!p.posar(agora)) {
      restaurarOssos(p.ossos)
      posturas.delete(p)
    }
  }
}
