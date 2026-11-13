import * as THREE from 'three'
import type { MateriaisDaPeca } from './equipamentos'
import type { Papel } from './geometricas'

// Os materiais das peças por facção (brancas e pretas), o dourado da coroa e os da espada.

interface MateriaisFaccao {
  armadura: THREE.MeshStandardMaterial
  detalhe: THREE.MeshStandardMaterial
  brilho: THREE.MeshStandardMaterial
}

// Materiais "HD" (PBR, com o reflexo do ambiente — ver scene.environment): armadura de metal
// polido, detalhes em tecido/couro foscos, brilho que emite luz própria (olhos, joias, orbe).
// Reino (brancas) — armadura de aço claro, detalhes em azul-real, brilho ciano
// Horda (pretas) — armadura de aço escuro, detalhes em vermelho-sangue, brilho vermelho
function materialBrilho(cor: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1.4, roughness: 0.4 })
}
export const materiaisPorFaccao: Record<'w' | 'b', MateriaisFaccao> = {
  w: {
    armadura: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.55, roughness: 0.3 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x2a4d8f, metalness: 0.1, roughness: 0.6 }),
    brilho: materialBrilho(0x8fe3ff),
  },
  b: {
    armadura: new THREE.MeshStandardMaterial({ color: 0x2c2d33, metalness: 0.6, roughness: 0.32 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x8a2222, metalness: 0.1, roughness: 0.6 }),
    brilho: materialBrilho(0xff7a5c),
  },
}

export const materialCoroa = new THREE.MeshStandardMaterial({ color: 0xe0b93d, metalness: 1, roughness: 0.22 })

export function materialDaParte(papel: Papel, cor: 'w' | 'b'): THREE.Material {
  return papel === 'coroa' ? materialCoroa : materiaisPorFaccao[cor][papel]
}

// ---------------------------------------------------------------------------
// Espada do peão — mesmo aço/cabo pras duas facções (não segue o material por
// papel/cor), parentada no pivô da mão direita, pra balançar junto do braço
// tanto na caminhada durante o lance quanto na pose parada.
// ---------------------------------------------------------------------------
export const geoLaminaEspada = new THREE.BoxGeometry(0.032, 0.26, 0.065)
export const geoGuardaEspada = new THREE.BoxGeometry(0.1, 0.022, 0.022)
export const geoCaboEspada = new THREE.CylinderGeometry(0.014, 0.014, 0.075, 8)
export const materialLaminaEspada = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, metalness: 1, roughness: 0.18 })
// marrom-couro claro (não escuro) de propósito — precisa contrastar tanto com a armadura clara
// das brancas quanto com a armadura escura das pretas, senão some contra uma das duas facções
export const materialCaboEspada = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness: 0, roughness: 0.75 })
// katana do peão RPG: cabo (tsuka) e tsuba com a trama de seda escura, saya de laca preta brilhante
export const materialCaboKatana = new THREE.MeshStandardMaterial({ color: 0x1f2a44, metalness: 0.2, roughness: 0.7 })
export const materialSaya = new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.1, roughness: 0.22 })

export function materiaisDaPeca(cor: 'w' | 'b'): MateriaisDaPeca {
  const { armadura, detalhe, brilho } = materiaisPorFaccao[cor]
  return { armadura, detalhe, brilho, coroa: materialCoroa, lamina: materialLaminaEspada }
}
