import * as THREE from 'three'
import { mostrarEspadaRPG, novaSequenciaRPG, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'

// A peça capturada sendo arremessada (pelo cavalo) e sumindo. A queda dos golpes simples, jogada pela força do golpe,
// fica em combate/nocaute.ts.

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
