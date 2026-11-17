// A câmera do tabuleiro: a vista de lado do menu, o giro até o lado de quem joga (e de um lado pro outro quando a cor
// muda), as coordenadas que viram junto, o enquadramento que faz o tabuleiro caber em qualquer tela e o ajuste quando o
// espaço muda de tamanho.
import * as THREE from 'three'
import { tocarSom } from '../../som/sons'
import { diferencaAngular } from '../animacoes/movimento'
import { definirLadoDaCamera, ladoDaCamera, MEIA_LARGURA_TABULEIRO } from '../casas'
import type { CenaDoTabuleiro } from './montarCena'

/** Meia-volta do tabuleiro ao escolher a cor das peças. */
const GIRO_CAMERA_MS = 1400
/** Vista de lado do menu: mais baixa e mais perto que a do jogo, pra ver as peças de frente. */
const RAIO_CAMERA_MENU = 11.5
const INCLINACAO_CAMERA_MENU = 1.12

export interface PoseCamera {
  raio: number
  phi: number
  theta: number
}

export type VistaDaCamera = ReturnType<typeof criarVistaDaCamera>

export function criarVistaDaCamera(
  cena: CenaDoTabuleiro,
  opcoes: {
    /** O espaço do tabuleiro na página. */
    container: () => HTMLDivElement | null
    /** Arrastar pra girar só vale com a tela do jogo movimentável. */
    telaMovel: () => boolean
    /** Pixels de desenho por pixel da tela, pela qualidade escolhida. */
    resolucao: (largura: number, altura: number) => number
  },
) {
  const { scene, camera, renderer, controls, labelsGroup, INCLINACAO_CAMERA_JOGO } = cena
  /** As coordenadas do lado de quem está olhando, e de pé pra essa pessoa. */
  function virarCoordenadas(lado: 1 | -1) {
    labelsGroup.children.forEach((rotulo, i) => {
      if (i < 8) rotulo.position.z = 4.35 * lado
      else rotulo.position.x = -4.35 * lado
      rotulo.rotation.z = lado === 1 ? 0 : Math.PI
    })
  }

  // a câmera viaja em torno do tabuleiro: da vista de lado do menu até o lado de quem joga, e de um
  // lado pro outro quando a cor muda
  interface PoseCamera {
    raio: number
    phi: number
    theta: number
  }
  let giroCamera: { de: PoseCamera; para: PoseCamera; inicio: number; coordenadasViradas: boolean } | null = null
  let emMenu = true

  function poseAtualDaCamera(): PoseCamera {
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    return { raio: s.radius, phi: s.phi, theta: s.theta }
  }

  function colocarCamera(pose: PoseCamera) {
    camera.position.setFromSphericalCoords(pose.raio, pose.phi, pose.theta).add(controls.target)
  }

  /** Arrastar pra girar só vale na partida, e se a tela do jogo estiver como movimentável. */
  function liberarCamera() {
    if (!giroCamera) controls.enabled = !emMenu && opcoes.telaMovel()
  }

  function levarCameraPara(para: PoseCamera, instantaneo = false) {
    const de = poseAtualDaCamera()
    const distancia = Math.abs(diferencaAngular(de.theta, para.theta)) + Math.abs(de.phi - para.phi) + Math.abs(de.raio - para.raio)
    // quem pediu menos movimento no sistema vai direto pro fim
    if (instantaneo || distancia < 0.001 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      colocarCamera(para)
      virarCoordenadas(ladoDaCamera)
      giroCamera = null
      liberarCamera()
      return
    }
    tocarSom('giro')
    giroCamera = { de, para, inicio: performance.now(), coordenadasViradas: false }
    controls.enabled = false
  }

  function atualizarGiroCamera(agora: number) {
    if (!giroCamera) return
    const { de, para } = giroCamera
    const t = Math.min(1, (agora - giroCamera.inicio) / GIRO_CAMERA_MS)
    const suave = t * t * (3 - 2 * t)
    colocarCamera({
      raio: de.raio + (para.raio - de.raio) * suave,
      phi: de.phi + (para.phi - de.phi) * suave,
      theta: de.theta + diferencaAngular(de.theta, para.theta) * suave,
    })
    // na metade do giro o tabuleiro está de lado: é quando a troca das coordenadas menos aparece
    if (t >= 0.5 && !giroCamera.coordenadasViradas) {
      giroCamera.coordenadasViradas = true
      virarCoordenadas(ladoDaCamera)
    }
    if (t >= 1) {
      giroCamera = null
      liberarCamera()
    }
  }

  /** A distância em que o tabuleiro cabe inteiro, olhando dessa inclinação e desse lado. */
  function raioQueEnquadra(phi: number, theta: number): number {
    const posicao = camera.position.clone()
    const orientacao = camera.quaternion.clone()
    colocarCamera({ raio: distanciaPadrao, phi, theta })
    camera.lookAt(controls.target)
    const raio = distanciaQueEnquadra()
    camera.position.copy(posicao)
    camera.quaternion.copy(orientacao)
    camera.updateMatrixWorld()
    return raio
  }

  /** Põe a câmera do lado da cor da pessoa. Na troca de partida, mantém a inclinação e o zoom que ela
   * escolheu; vindo do menu, volta pra vista de jogo. */
  function virarCameraPara(lado: 1 | -1) {
    const atual = poseAtualDaCamera()
    const vemDoMenu = emMenu
    emMenu = false
    definirLadoDaCamera(lado)
    const theta = lado === 1 ? 0 : Math.PI
    if (vemDoMenu) distanciaAutomatica = raioQueEnquadra(INCLINACAO_CAMERA_JOGO, theta)
    levarCameraPara({ raio: vemDoMenu ? distanciaAutomatica : atual.raio, phi: vemDoMenu ? INCLINACAO_CAMERA_JOGO : atual.phi, theta })
  }

  /** Vista da tela inicial: de lado, com as brancas de um lado e as pretas do outro, em qualquer tela. Na tela em
   * pé a câmera recua até o tabuleiro caber na largura, e os botões ficam embaixo dele. */
  function irParaVistaDoMenu(instantaneo = false) {
    emMenu = true
    definirLadoDaCamera(1)
    levarCameraPara(
      { raio: Math.max(RAIO_CAMERA_MENU, raioQueEnquadra(INCLINACAO_CAMERA_MENU, Math.PI / 2)), phi: INCLINACAO_CAMERA_MENU, theta: Math.PI / 2 },
      instantaneo,
    )
  }

  // distância da câmera que o enquadramento automático escolheu por último — se o jogador não mexeu
  // no zoom desde então, a próxima mudança de tamanho pode reajustar (aproximar ou afastar)
  const distanciaPadrao = camera.position.distanceTo(controls.target)
  let distanciaAutomatica = distanciaPadrao

  /** Menor distância (a partir da padrão) em que o tabuleiro inteiro cabe na tela — numa tela em pé
   * (celular) a câmera precisa ir mais pra trás pra caber a largura. */
  function distanciaQueEnquadra(): number {
    const direcao = camera.position.clone().sub(controls.target).normalize()
    const cantos = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * MEIA_LARGURA_TABULEIRO, 0, sz * MEIA_LARGURA_TABULEIRO)))
    const original = camera.position.clone()
    let distancia = distanciaPadrao
    for (; distancia < 90; distancia += 0.5) {
      camera.position.copy(controls.target).addScaledVector(direcao, distancia)
      camera.updateMatrixWorld()
      if (cantos.every((c) => {
        const p = c.clone().project(camera)
        return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.97
      })) break
    }
    camera.position.copy(original)
    camera.updateMatrixWorld()
    return distancia
  }

  function onResize() {
    const el = opcoes.container()
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
    camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(opcoes.resolucao(el.clientWidth, el.clientHeight))
    renderer.setSize(el.clientWidth, el.clientHeight, false)
    const atual = camera.position.distanceTo(controls.target)
    const necessaria = distanciaQueEnquadra()
    if (emMenu) {
      irParaVistaDoMenu(true)
    } else if (giroCamera && Math.abs(giroCamera.para.raio - distanciaAutomatica) < 0.01) {
      // o menu ocupa a tela toda e a partida não: o giro que sai dele foi calculado no formato antigo
      distanciaAutomatica = raioQueEnquadra(giroCamera.para.phi, giroCamera.para.theta)
      giroCamera.para = { ...giroCamera.para, raio: distanciaAutomatica }
    } else if (atual < necessaria - 0.01 || Math.abs(atual - distanciaAutomatica) < 0.01) {
      // só mexe na câmera se o tabuleiro não cabe, ou se a distância ainda é a que o enquadramento
      // pôs (o jogador não deu zoom desde então)
      const direcao = camera.position.clone().sub(controls.target).normalize()
      camera.position.copy(controls.target).addScaledVector(direcao, necessaria)
      distanciaAutomatica = necessaria
    }
    controls.maxDistance = Math.max(20, necessaria * 1.3)
    // a névoa acompanha a distância: de longe o tabuleiro não some
    const fog = scene.fog as THREE.Fog
    fog.near = Math.max(11, necessaria - 2.5)
    fog.far = Math.max(55, necessaria + 41.5)
  }

  return {
    poseAtualDaCamera,
    colocarCamera,
    liberarCamera,
    atualizarGiroCamera,
    virarCameraPara,
    irParaVistaDoMenu,
    distanciaQueEnquadra,
    onResize,
    emMenu: () => emMenu,
    girando: () => giroCamera !== null,
  }
}
