// A câmera do tabuleiro: a vista de lado do menu, o giro até o lado de quem joga (e de um lado pro outro quando a cor
// muda), as coordenadas que viram junto, o enquadramento que faz o tabuleiro caber em qualquer tela e o ajuste quando o
// espaço muda de tamanho.
import * as THREE from 'three'
import { tocarSom } from '../../som/sons'
import { diferencaAngular } from '../animacoes/movimento'
import { definirLadoDaCamera, ladoDaCamera, MEIA_LARGURA_TABULEIRO } from '../casas'
import type { CenaDoTabuleiro } from './montarCena'
import { menosMovimento } from '../sensacao/golpeQuePesa'

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
  let giroCamera: { de: PoseCamera; para: PoseCamera; alvoDe: THREE.Vector3; alvoPara: THREE.Vector3; inicio: number; coordenadasViradas: boolean } | null = null
  let emMenu = true
  /** O meio do tabuleiro, na altura do corpo das peças: a tela inicial e a partida nova sempre olham pra cá, mesmo que a
   * pessoa tenha arrastado o tabuleiro com dois dedos ou que a câmera da luta tenha ficado no meio do caminho. */
  const CENTRO = controls.target.clone()
  /** O centro voltando pra onde estava antes da luta, sem mexer no giro nem no zoom de quem pegou a câmera. */
  let recentrar: { de: THREE.Vector3; para: THREE.Vector3; inicio: number } | null = null

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

  /** Leva a câmera até a pose `para`, olhando pra `alvo` (o meio do tabuleiro, fora a prévia da Loja). */
  function levarCameraPara(para: PoseCamera, instantaneo = false, alvo = CENTRO) {
    const de = poseAtualDaCamera()
    const alvoDe = controls.target.clone()
    const distancia = Math.abs(diferencaAngular(de.theta, para.theta)) + Math.abs(de.phi - para.phi) + Math.abs(de.raio - para.raio) + alvoDe.distanceTo(alvo)
    recentrar = null
    // quem pediu menos movimento no sistema vai direto pro fim
    if (instantaneo || distancia < 0.001 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      controls.target.copy(alvo)
      colocarCamera(para)
      virarCoordenadas(ladoDaCamera)
      giroCamera = null
      liberarCamera()
      return
    }
    tocarSom('giro')
    giroCamera = { de, para, alvoDe, alvoPara: alvo.clone(), inicio: performance.now(), coordenadasViradas: false }
    controls.enabled = false
  }

  function atualizarGiroCamera(agora: number) {
    if (!giroCamera) return
    const { de, para } = giroCamera
    const t = Math.min(1, (agora - giroCamera.inicio) / GIRO_CAMERA_MS)
    const suave = t * t * (3 - 2 * t)
    // o centro volta pro meio do tabuleiro junto com o giro
    controls.target.copy(giroCamera.alvoDe).lerp(giroCamera.alvoPara, suave)
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

  /** A distância em que o tabuleiro cabe inteiro, olhando dessa inclinação e desse lado, com o centro no meio dele. */
  function raioQueEnquadra(phi: number, theta: number): number {
    const posicao = camera.position.clone()
    const orientacao = camera.quaternion.clone()
    const alvo = controls.target.clone()
    controls.target.copy(CENTRO)
    colocarCamera({ raio: distanciaPadrao, phi, theta })
    camera.lookAt(controls.target)
    const raio = distanciaQueEnquadra()
    controls.target.copy(alvo)
    camera.position.copy(posicao)
    camera.quaternion.copy(orientacao)
    camera.updateMatrixWorld()
    return raio
  }

  /** Põe a câmera do lado da cor da pessoa. Na troca de partida, mantém a inclinação e o zoom que ela
   * escolheu; vindo do menu, volta pra vista de jogo. */
  function virarCameraPara(lado: 1 | -1) {
    desfazerAproximacao()
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
    desfazerAproximacao()
    emMenu = true
    definirLadoDaCamera(1)
    levarCameraPara(
      { raio: Math.max(RAIO_CAMERA_MENU, raioQueEnquadra(INCLINACAO_CAMERA_MENU, Math.PI / 2)), phi: INCLINACAO_CAMERA_MENU, theta: Math.PI / 2 },
      instantaneo,
    )
  }

  /** A prévia da Loja: a câmera sai da tela inicial e vem de perto até `ponto` (onde a captura acontece), de lado e
   * um pouco de cima; a volta é `irParaVistaDoMenu`. Devolve quantos ms a câmera leva pra chegar. */
  function irParaAcao(ponto: THREE.Vector3, theta: number, raio = 4.4): number {
    desfazerAproximacao()
    emMenu = false
    definirLadoDaCamera(1)
    levarCameraPara({ raio, phi: THREE.MathUtils.degToRad(57), theta }, false, ponto)
    return giroCamera ? GIRO_CAMERA_MS : 0
  }

  // --- a câmera na luta ("o golpe que pesa"): na captura, chega um pouco mais perto de onde a luta acontece (mais
  // quanto mais pesa o golpe) e volta sozinha no fim; no xeque, encosta um instante no rei ameaçado. Se a pessoa mexe
  // na câmera no meio, ela fica onde a pessoa deixou
  interface Aproximacao {
    /** De onde a câmera saiu: é pra lá que ela volta. */
    alvoAntes: THREE.Vector3
    raioAntes: number
    de: { alvo: THREE.Vector3; raio: number }
    para: { alvo: THREE.Vector3; raio: number }
    inicio: number
    duracao: number
    voltando: boolean
  }
  const CHEGA_MS = 650
  const VOLTA_MS = 900
  let aproximacao: Aproximacao | null = null
  let voltaDoRei: number | undefined
  const RECENTRA_MS = 450
  controls.addEventListener('start', () => {
    // a pessoa pegou a câmera: ela manda no giro e no zoom, mas o centro volta pro lugar (no celular todo toque conta
    // como pegar a câmera, e o centro ficava preso perto da luta, com o tabuleiro torto até na tela inicial)
    if (aproximacao) recentrar = { de: controls.target.clone(), para: aproximacao.alvoAntes.clone(), inicio: performance.now() }
    aproximacao = null
    window.clearTimeout(voltaDoRei)
  })
  function atualizarRecentrar(agora: number) {
    if (!recentrar) return
    const t = Math.min(1, (agora - recentrar.inicio) / RECENTRA_MS)
    const suave = t * t * (3 - 2 * t)
    const antes = controls.target.clone()
    controls.target.copy(recentrar.de).lerp(recentrar.para, suave)
    // a câmera anda junto com o centro: o tabuleiro desliza de volta sem girar
    camera.position.add(controls.target.clone().sub(antes))
    if (t >= 1) recentrar = null
  }

  function irAte(para: { alvo: THREE.Vector3; raio: number }, duracao: number, voltando: boolean) {
    const de = { alvo: controls.target.clone(), raio: camera.position.distanceTo(controls.target) }
    const alvoAntes = aproximacao?.alvoAntes ?? de.alvo.clone()
    const raioAntes = aproximacao?.raioAntes ?? de.raio
    aproximacao = { alvoAntes, raioAntes, de, para, inicio: performance.now(), duracao, voltando }
  }

  /** Leva o centro uma `fracao` do caminho até `ponto` (e até a altura dele, com `naAltura`) e a distância pra
   * `fatorDoRaio` da de antes; volta com `voltarDaLuta`. */
  function focar(ponto: THREE.Vector3, fracao: number, fatorDoRaio: number, naAltura: boolean, ms = CHEGA_MS) {
    if (emMenu || giroCamera || menosMovimento()) return
    window.clearTimeout(voltaDoRei)
    recentrar = null
    const alvoAntes = aproximacao?.alvoAntes ?? controls.target.clone()
    const raioAntes = aproximacao?.raioAntes ?? camera.position.distanceTo(controls.target)
    const alvo = alvoAntes.clone().lerp(new THREE.Vector3(ponto.x, naAltura ? ponto.y : alvoAntes.y, ponto.z), fracao)
    irAte({ alvo, raio: Math.max(controls.minDistance, raioAntes * fatorDoRaio) }, ms, false)
  }

  /** A captura começou em `ponto`: a câmera chega perto (`peso` de 0 a 1). */
  function aproximarDaLuta(ponto: THREE.Vector3, peso: number) {
    focar(ponto, 0.3 + 0.2 * peso, 0.9 - 0.12 * peso, false)
  }

  /** A ascensão: o foco todo na peça, bem de perto, na altura do corpo dela. */
  function focarNaPeca(ponto: THREE.Vector3) {
    focar(ponto, 0.95, 0.4, true, 900)
  }

  /** A luta acabou: a câmera volta pra onde estava. */
  function voltarDaLuta() {
    window.clearTimeout(voltaDoRei)
    if (!aproximacao) return
    irAte({ alvo: aproximacao.alvoAntes.clone(), raio: aproximacao.raioAntes }, VOLTA_MS, true)
  }

  /** Xeque no rei de quem joga: a câmera encosta de leve nele e volta. Durante uma luta, fica onde está. */
  function encostarNoRei(ponto: THREE.Vector3) {
    if (aproximacao && !aproximacao.voltando) return
    aproximarDaLuta(ponto, 0)
    if (!aproximacao) return
    voltaDoRei = window.setTimeout(voltarDaLuta, CHEGA_MS + 500)
  }

  /** Desfaz na hora a aproximação da luta (indo pro menu ou trocando de partida no meio dela). */
  function desfazerAproximacao() {
    window.clearTimeout(voltaDoRei)
    if (!aproximacao) return
    const direcao = camera.position.clone().sub(controls.target).normalize()
    controls.target.copy(aproximacao.alvoAntes)
    camera.position.copy(controls.target).addScaledVector(direcao, aproximacao.raioAntes)
    aproximacao = null
  }

  // o soco da câmera (efeitos de anime): o campo de visão fecha ou abre de uma vez e volta devagar
  const campoDeVisao = camera.fov
  let soco: { graus: number; inicio: number; ms: number } | null = null
  function socoNaCamera(graus: number, ms: number) {
    if (emMenu || menosMovimento()) return
    soco = { graus, inicio: performance.now(), ms }
  }
  function atualizarSoco(agora: number) {
    if (!soco) return
    const u = (agora - soco.inicio) / soco.ms
    if (u >= 1) {
      soco = null
      camera.fov = campoDeVisao
    } else camera.fov = campoDeVisao + soco.graus * (u < 0.12 ? u / 0.12 : (1 - (u - 0.12) / 0.88) ** 2)
    camera.updateProjectionMatrix()
  }

  function atualizarAproximacao(agora: number) {
    atualizarSoco(agora)
    atualizarRecentrar(agora)
    if (!aproximacao) return
    if (giroCamera || emMenu) {
      // o giro (tela inicial, partida nova) já leva o centro de volta pro meio
      aproximacao = null
      return
    }
    const { de, para } = aproximacao
    const t = Math.min(1, (agora - aproximacao.inicio) / aproximacao.duracao)
    const suave = t * t * (3 - 2 * t)
    const direcao = camera.position.clone().sub(controls.target).normalize()
    controls.target.copy(de.alvo).lerp(para.alvo, suave)
    camera.position.copy(controls.target).addScaledVector(direcao, de.raio + (para.raio - de.raio) * suave)
    if (t >= 1 && aproximacao.voltando) aproximacao = null
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
    atualizarAproximacao,
    aproximarDaLuta,
    focarNaPeca,
    voltarDaLuta,
    socoNaCamera,
    encostarNoRei,
    virarCameraPara,
    irParaVistaDoMenu,
    irParaAcao,
    distanciaQueEnquadra,
    onResize,
    emMenu: () => emMenu,
    girando: () => giroCamera !== null,
  }
}
