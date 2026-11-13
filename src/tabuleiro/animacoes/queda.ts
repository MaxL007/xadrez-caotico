import * as THREE from 'three'
import { voltarAoDescanso } from './gestos'
import { diferencaAngular } from './movimento'
import { mostrarEspadaRPG, novaSequenciaRPG, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'

// A peça capturada caindo, sendo arremessada e sumindo.

/** Duração da queda (tomba) e do afundamento+desaparecimento da peça capturada, depois do golpe. */
const DURACAO_QUEDA_MS = 500
const DURACAO_SUMIR_MS = 650
/** Quanto a peça derrubada desliza na direção do golpe (em casas). */
const DESLIZE_NOCAUTE = 0.45

/**
 * A peça capturada tomba pro chão e depois afunda no tabuleiro sumindo aos poucos — clona os
 * materiais antes (são compartilhados entre todas as peças da mesma facção/tipo) pra desvanecer só
 * essa peça sem afetar as outras que ainda estão em jogo. Quando `direcaoNocaute` é passado (golpe
 * de "derrubada"), a peça também desliza nessa direção enquanto cai, como se tivesse sido jogada
 * longe pelo golpe, em vez de só tombar no lugar.
 */
export function animarQuedaEDesaparecimento(
  mesh: THREE.Object3D,
  aoTerminar: () => void,
  direcaoNocaute?: { x: number; z: number },
  direcaoGolpe?: { x: number; z: number },
) {
  // a vítima podia estar no meio da recusa (quem joga clicou nela na vez da máquina)
  voltarAoDescanso(mesh)
  const definirOpacidade = prepararParaSumir(mesh)

  const yInicial = mesh.position.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const eixoQueda: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z'
  const sinalQueda = Math.random() < 0.5 ? 1 : -1
  const duracaoTotal = DURACAO_QUEDA_MS + DURACAO_SUMIR_MS
  const inicio = performance.now()

  // peça RPG: vira de frente pra quem golpeou (num instante — o golpe já acertou) e cai de verdade
  // com o clipe "Morte" (cai de costas, pra longe do atacante); só depois de estirada no chão é que
  // afunda e some aos poucos
  const morte = (mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined)?.Morte
  if (morte) {
    novaSequenciaRPG(mesh)
    mostrarEspadaRPG(mesh, false)
    const rumoInicial = mesh.rotation.y
    const giro = direcaoGolpe ? diferencaAngular(rumoInicial, Math.atan2(-direcaoGolpe.x, -direcaoGolpe.z)) : 0
    tocarClipeRPGUmaVez(mesh, 'Morte', { entrada: 0.12, voltarAoParado: false })
    const duracaoClipeMs = morte.getClip().duration * 1000
    const comecaASumir = duracaoClipeMs * 0.85
    const yBase = mesh.position.y
    const inicioMorte = performance.now()
    function passoMorte(agora: number) {
      const decorrido = agora - inicioMorte
      const tGiro = Math.min(1, decorrido / 140)
      mesh.rotation.y = rumoInicial + giro * tGiro * (2 - tGiro)
      if (decorrido > comecaASumir) {
        const tSumir = Math.min(1, (decorrido - comecaASumir) / DURACAO_SUMIR_MS)
        mesh.position.y = yBase - tSumir * 0.15
        definirOpacidade(1 - tSumir)
        if (tSumir >= 1) {
          aoTerminar()
          return
        }
      }
      requestAnimationFrame(passoMorte)
    }
    requestAnimationFrame(passoMorte)
    return
  }

  // derrubada: tomba PRA LONGE do golpe (gira em torno do eixo deitado perpendicular à direção — o topo
  // vai pra onde o golpe empurrou) e desliza nessa direção enquanto cai
  const comprimento = direcaoNocaute ? Math.hypot(direcaoNocaute.x, direcaoNocaute.z) : 0
  const nocaute = direcaoNocaute && comprimento > 1e-6 ? { x: direcaoNocaute.x / comprimento, z: direcaoNocaute.z / comprimento } : undefined
  const eixoNocaute = nocaute ? new THREE.Vector3(nocaute.z, 0, -nocaute.x) : undefined
  const rotacaoInicial = mesh.quaternion.clone()
  const giroNocaute = new THREE.Quaternion()

  function passo(agora: number) {
    const decorrido = agora - inicio
    const tQueda = Math.min(1, decorrido / DURACAO_QUEDA_MS)
    const quedaSuave = 1 - Math.pow(1 - tQueda, 3)
    if (nocaute && eixoNocaute) {
      giroNocaute.setFromAxisAngle(eixoNocaute, quedaSuave * (Math.PI / 2))
      mesh.quaternion.copy(giroNocaute).multiply(rotacaoInicial)
      mesh.position.x = posOriginal.x + nocaute.x * DESLIZE_NOCAUTE * quedaSuave
      mesh.position.z = posOriginal.z + nocaute.z * DESLIZE_NOCAUTE * quedaSuave
    } else {
      mesh.rotation[eixoQueda] = quedaSuave * (Math.PI / 2) * sinalQueda
    }

    if (decorrido > DURACAO_QUEDA_MS) {
      const tSumir = Math.min(1, (decorrido - DURACAO_QUEDA_MS) / DURACAO_SUMIR_MS)
      mesh.position.y = yInicial - tSumir * 0.35
      definirOpacidade(1 - tSumir)
    }

    if (decorrido < duracaoTotal) {
      requestAnimationFrame(passo)
    } else {
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

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

/** Distância (casas) e altura do arco de uma peça arremessada pelo cavalo. */
const DISTANCIA_ARREMESSO = 2.6
const ALTURA_ARREMESSO = 1.1
const DURACAO_ARREMESSO_MS = 950

/**
 * A peça atropelada pelo cavalo sai voando pra longe na `direcao` do golpe: arco alto, girando de
 * ponta-cabeça no ar (com o corpo "desmontando" pela animação de morte, se for RPG), quica ao bater
 * no chão (ou na mesa, se cair fora do tabuleiro) e some aos poucos.
 */
export function arremessarPeca(mesh: THREE.Object3D, direcao: { x: number; z: number }, aoTerminar: () => void) {
  const definirOpacidade = prepararParaSumir(mesh)
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  if (acoes?.Morte) {
    novaSequenciaRPG(mesh)
    mostrarEspadaRPG(mesh, false)
    tocarClipeRPGUmaVez(mesh, 'Morte', { entrada: 0.08, voltarAoParado: false })
  }
  const tamanho = Math.hypot(direcao.x, direcao.z) || 1
  const ux = direcao.x / tamanho
  const uz = direcao.z / tamanho
  const inicioPos = mesh.position.clone()
  const distancia = DISTANCIA_ARREMESSO * (0.85 + Math.random() * 0.3)
  const fim = new THREE.Vector3(inicioPos.x + ux * distancia, 0, inicioPos.z + uz * distancia)
  // fora do tabuleiro (moldura incluída) cai na mesa, mais embaixo
  const foraDoTabuleiro = Math.abs(fim.x) > 4.7 || Math.abs(fim.z) > 4.7
  const chao = foraDoTabuleiro ? -0.36 : inicioPos.y
  const eixoGiro = new THREE.Vector3(uz, 0, -ux)
  const giroBase = mesh.quaternion.clone()
  // uma volta inteira no ar; a peça RPG termina deitada pela própria animação de morte, a geométrica
  // gira mais um quarto de volta pra cair deitada
  const giroTotal = Math.PI * 2 + (acoes?.Morte ? 0 : Math.PI / 2)
  const inicio = performance.now()
  function passo(agora: number) {
    const decorrido = agora - inicio
    const t = Math.min(1, decorrido / DURACAO_ARREMESSO_MS)
    mesh.position.x = inicioPos.x + (fim.x - inicioPos.x) * t
    mesh.position.z = inicioPos.z + (fim.z - inicioPos.z) * t
    // arco: sobe até ALTURA_ARREMESSO e desce até o chão de onde cair
    mesh.position.y = inicioPos.y + (chao - inicioPos.y) * t + 4 * ALTURA_ARREMESSO * t * (1 - t)
    const giro = new THREE.Quaternion().setFromAxisAngle(eixoGiro, -giroTotal * (1 - Math.pow(1 - t, 1.6)))
    mesh.quaternion.copy(giro.multiply(giroBase))
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    // no chão: um quique pequeno e some
    const inicioChao = performance.now()
    function noChao(agoraChao: number) {
      const tc = Math.min(1, (agoraChao - inicioChao) / 900)
      mesh.position.y = chao + Math.abs(Math.sin(Math.min(1, tc * 3) * Math.PI)) * 0.08 * (1 - Math.min(1, tc * 3)) - Math.max(0, tc - 0.4) * 0.2
      if (tc > 0.35) definirOpacidade(1 - (tc - 0.35) / 0.65)
      if (tc < 1) requestAnimationFrame(noChao)
      else aoTerminar()
    }
    requestAnimationFrame(noChao)
  }
  requestAnimationFrame(passo)
}
