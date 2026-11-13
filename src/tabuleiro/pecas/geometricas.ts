import * as THREE from 'three'
import { criarContorno } from '../casas'
import { geoCaboEspada, geoGuardaEspada, geoLaminaEspada, materialCaboEspada, materialDaParte, materialLaminaEspada } from './materiais'

// As peças geométricas (o boneco de madeira, usado só se o modelo RPG do tipo não carregar): as partes de cada tipo, braços e pernas, a escala e a espada do peão.

// ---------------------------------------------------------------------------
// Peças-personagem — dois exércitos com visual distinto (Reino, claro/azul, x
// Horda, escuro/vermelho), em vez das peças geométricas clássicas. Cada peça é
// montada com formas simples (corpo, cabeça, elmo/capuz, acessório) só que com
// um "papel" por parte (armadura / detalhe / coroa / brilho) que decide qual
// material usar — a geometria em si é montada uma única vez por tipo e
// reaproveitada pra sempre, então trocar de facção não recria nada.
// ---------------------------------------------------------------------------
export type Papel = 'armadura' | 'detalhe' | 'coroa' | 'brilho'

interface ParteGeom {
  geo: THREE.BufferGeometry
  x?: number
  y: number
  z?: number
  rotX?: number
  rotY?: number
  rotZ?: number
  papel: Papel
}

const geometriasPorTipo = new Map<string, ParteGeom[]>()

export function geometriasDoTipo(tipo: string): ParteGeom[] {
  const existente = geometriasPorTipo.get(tipo)
  if (existente) return existente

  // Corpos bem mais esguios que a geração anterior (que lembrava um robozinho robusto) — visual
  // de "boneco de madeira" articulado, tipo manequim de desenho: tronco/quadril bem mais finos e
  // membros finos (ver geoPerna/geoBraco), mas ainda montado só com primitivas geométricas simples
  // (caixa/cilindro/esfera/cone), não linhas literais — mantém o "formato geométrico" original só
  // que mais magro. As alturas (Y) ficam quase todas iguais às da versão anterior; só as larguras/
  // profundidades (X/Z) e os afastamentos do centro (onde fica ombro, cetro, cajado etc.) encolhem.
  let partes: ParteGeom[] = []
  switch (tipo) {
    // peão — soldado raso, elmo simples com ponta (tronco acima do quadril/pernas articulados)
    case 'p':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.08, 0.025, 0.08), y: 0.4, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.055, 0.065, 0.2, 12), y: 0.48, papel: 'armadura' },
        // juntas esféricas nos ombros e quadris, bem mais largas que o membro fino que sai delas —
        // o visual de "boneco de brinquedo articulado" da foto de referência (bolinha grande na
        // dobradiça). Centralizadas exatamente no pivô do braço/perna (CONFIG_BRACO/PERNA_*), pra
        // o membro parecer emergir de dentro da esfera em vez de só encostar nela.
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: -0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: 0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: -0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: 0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.68, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.048, 0.1, 12), y: 0.785, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.06, 0.018, 0.018), y: 0.685, z: 0.078, papel: 'brilho' },
      ]
      break
    // torre — guardião pesado, ombreiras largas e "ameia" no topo (lembrando torre) — continua a
    // mais robusta do grupo (guarda a mesma proporção relativa às outras), só que agora fina o
    // bastante pra também deixar ver um fiapo das pernas por baixo, como as demais peças
    case 'r':
      partes = [
        { geo: new THREE.BoxGeometry(0.13, 0.09, 0.09), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.19, 0.22, 0.13), y: 0.5, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.195, 0.03, 0.135), y: 0.5, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: -0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: 0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.035, 0.035, 0.014), y: 0.56, z: 0.07, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.075, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.17, 0.07, 0.17), y: 0.8, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.02, 0.02), y: 0.705, z: 0.058, papel: 'brilho' },
      ]
      break
    // cavalo — literalmente um peão montado em cima de um cavalo: corpo/pescoço/cabeça/orelhas/
    // crina/rabo do cavalo por baixo, e um cavaleiro pequeno (mesma cara do peão — corpo, cabeça,
    // capacete pontudo) sentado no lombo. O tronco do cavalo fica mais estreito que a distância das
    // "patas" (o mesmo par de pernas articuladas de toda peça), então elas ficam visíveis do lado
    // de fora do corpo em vez de escondidas por dentro. Corpo/pescoço/cabeça mais esguios que antes,
    // acompanhando o resto do time, mas o comprimento (focinho, rabo) fica como estava.
    case 'n':
      partes = [
        // corpo do cavalo
        { geo: new THREE.BoxGeometry(0.09, 0.12, 0.4), y: 0.42, papel: 'armadura' },
        // manta de sela, sob o cavaleiro
        { geo: new THREE.BoxGeometry(0.1, 0.03, 0.22), y: 0.505, z: 0.03, papel: 'detalhe' },
        // pescoço, inclinado pra frente e pra cima
        { geo: new THREE.BoxGeometry(0.065, 0.24, 0.08), y: 0.54, z: -0.2, rotX: -0.5, papel: 'armadura' },
        // cabeça — focinho alongado
        { geo: new THREE.BoxGeometry(0.06, 0.075, 0.2), y: 0.65, z: -0.35, rotX: -0.15, papel: 'armadura' },
        // orelhas
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: -0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: 0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        // crina, ao longo do pescoço
        { geo: new THREE.BoxGeometry(0.02, 0.16, 0.12), y: 0.6, z: -0.13, rotX: -0.5, papel: 'detalhe' },
        // rabo
        { geo: new THREE.ConeGeometry(0.032, 0.22, 10), y: 0.42, z: 0.24, rotX: Math.PI * 0.55, papel: 'detalhe' },
        // cavaleiro — tronco pequeno sentado no lombo
        { geo: new THREE.CylinderGeometry(0.045, 0.052, 0.14, 10), y: 0.56, papel: 'armadura' },
        // capa curta do cavaleiro, esvoaçando pra trás
        { geo: new THREE.BoxGeometry(0.06, 0.16, 0.02), y: 0.58, z: 0.09, rotX: 0.25, papel: 'detalhe' },
        // cabeça do cavaleiro
        { geo: new THREE.SphereGeometry(0.055, 14, 10), y: 0.68, papel: 'armadura' },
        // capacete pontudo, igual ao do peão
        { geo: new THREE.ConeGeometry(0.032, 0.07, 12), y: 0.75, papel: 'detalhe' },
        // brilho dos olhos do cavaleiro
        { geo: new THREE.BoxGeometry(0.04, 0.013, 0.013), y: 0.685, z: 0.05, papel: 'brilho' },
      ]
      break
    // bispo — místico com chapéu pontudo e cajado
    case 'b':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.26, 14), y: 0.5, papel: 'detalhe' },
        // faixa/cíngulo na cintura da batina
        { geo: new THREE.TorusGeometry(0.056, 0.01, 8, 20), y: 0.45, rotX: Math.PI / 2, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.06, 0.3, 14), y: 0.94, papel: 'detalhe' },
        // faixa diagonal no peito
        { geo: new THREE.BoxGeometry(0.02, 0.22, 0.014), x: 0.03, y: 0.68, z: 0.045, rotZ: 0.5, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.013, 0.013, 0.46, 8), x: 0.1, y: 0.52, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.04, 12, 12), x: 0.1, y: 0.77, papel: 'brilho' },
      ]
      break
    // dama — elegante, coroa dourada com joia
    case 'q':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.28, 16), y: 0.5, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.16, 0.48, 0.03), y: 0.42, z: -0.08, rotX: 0.08, papel: 'detalhe' },
        // colar
        { geo: new THREE.TorusGeometry(0.05, 0.01, 8, 20), y: 0.63, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.72, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.06, 0.018, 10, 20), y: 0.85, rotX: Math.PI / 2, papel: 'coroa' },
        // pontas pequenas na coroa, além do topo com a joia
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: 0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: -0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), y: 0.915, papel: 'brilho' },
        // cetro — cabo com uma joia no topo, na mão
        { geo: new THREE.CylinderGeometry(0.011, 0.011, 0.36, 8), x: 0.1, y: 0.54, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), x: 0.1, y: 0.735, papel: 'coroa' },
      ]
      break
    // rei — o mais alto, coroa + cruz, capa
    case 'k':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.095, 0.3, 16), y: 0.51, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.17, 0.52, 0.032), y: 0.42, z: -0.085, rotX: 0.1, papel: 'detalhe' },
        // emblema no peito
        { geo: new THREE.BoxGeometry(0.032, 0.032, 0.013), y: 0.58, z: 0.065, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.088, 16, 12), y: 0.74, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.065, 0.02, 10, 20), y: 0.88, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.025, 0.15, 0.025), y: 0.99, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.075, 0.025, 0.025), y: 1.01, papel: 'coroa' },
        // cajado — cabo com uma cruz no topo, igual à da coroa, na mão
        { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8), x: 0.1, y: 0.53, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.022, 0.09, 0.022), x: 0.1, y: 0.8, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.055, 0.02, 0.02), x: 0.1, y: 0.815, papel: 'coroa' },
      ]
      break
  }
  geometriasPorTipo.set(tipo, partes)
  return partes
}

// ---------------------------------------------------------------------------
// Braços e pernas — mesma geometria pra todas as peças, com o pivô na
// articulação (quadril/ombro) em vez do centro da peça, pra poder balançar
// como uma caminhada de verdade durante a animação do lance. Bem mais finos que antes — é a peça
// central do visual "boneco de madeira": membros claramente mais estreitos que antes, ainda
// cilíndricos (não viram linha), pendurados de um corpo igualmente mais fino (ver geometriasDoTipo).
// ---------------------------------------------------------------------------
const geoPerna = new THREE.CylinderGeometry(0.024, 0.03, 0.32, 10)
const geoBraco = new THREE.CylinderGeometry(0.019, 0.024, 0.26, 10)

interface ConfigMembro {
  geo: THREE.BufferGeometry
  comprimento: number
  pivotX: number
  pivotY: number
  papel: Papel
}

export const CONFIG_PERNA_ESQ: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: -0.04, pivotY: 0.32, papel: 'armadura' }
export const CONFIG_PERNA_DIR: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: 0.04, pivotY: 0.32, papel: 'armadura' }
export const CONFIG_BRACO_ESQ: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: -0.085, pivotY: 0.52, papel: 'armadura' }
export const CONFIG_BRACO_DIR: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: 0.085, pivotY: 0.52, papel: 'armadura' }

/** Escala geral por tipo — só pra dar hierarquia de tamanho (rei/dama maiores, torre mais robusta). */
export const ESCALA_POR_TIPO: Record<string, number> = { p: 1, n: 1, b: 1.05, r: 1.1, q: 1.08, k: 1.15 }
/** Ajuste extra só pros modelos RPG: o cavalo montado (cavaleiro sentado no cavalo) fica mais alto
 * e mais comprido que um boneco em pé — encolhido um pouco pra caber na casa sem destoar. */
export const ESCALA_MODELO_RPG: Record<string, number> = { n: 0.85 }

export interface MembrosPersonagem {
  pernaEsq: THREE.Group
  pernaDir: THREE.Group
  bracoEsq: THREE.Group
  bracoDir: THREE.Group
}

/** Pose de descanso de cada membro (rotation.x) — todas as peças ficam com os braços caídos por
 * padrão (o peão só empunha a espada durante o ataque, ver animarAtaqueEspada). A caminhada soma o
 * balanço em cima dessa base, em vez de partir sempre de zero. */
export interface PoseBaseMembros {
  pernaEsq: number
  pernaDir: number
  bracoEsq: number
  bracoDir: number
}
export const POSE_BASE_NEUTRA: PoseBaseMembros = { pernaEsq: 0, pernaDir: 0, bracoEsq: 0, bracoDir: 0 }

export function criarEspadaDoPeao(): THREE.Group {
  const espada = new THREE.Group()
  const partes: { geo: THREE.BufferGeometry; y: number; material: THREE.Material }[] = [
    { geo: geoCaboEspada, y: -0.035, material: materialCaboEspada },
    { geo: geoGuardaEspada, y: -0.07, material: materialCaboEspada },
    { geo: geoLaminaEspada, y: -0.2, material: materialLaminaEspada },
  ]
  for (const parte of partes) {
    const mesh = new THREE.Mesh(parte.geo, parte.material)
    mesh.position.y = parte.y
    mesh.castShadow = true
    espada.add(mesh)

    const contorno = criarContorno(parte.geo)
    contorno.position.y = parte.y
    espada.add(contorno)
  }
  return espada
}

/** Monta um braço ou perna: um grupo-pivô na articulação, com o membro pendurado abaixo dele — girar o pivô move o membro inteiro, como uma dobradiça. */
export function criarMembro(cfg: ConfigMembro, cor: 'w' | 'b'): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(cfg.pivotX, cfg.pivotY, 0)

  const mesh = new THREE.Mesh(cfg.geo, materialDaParte(cfg.papel, cor))
  mesh.position.y = -cfg.comprimento / 2
  mesh.castShadow = true
  pivot.add(mesh)

  const contorno = criarContorno(cfg.geo)
  contorno.position.y = -cfg.comprimento / 2
  pivot.add(contorno)

  return pivot
}
