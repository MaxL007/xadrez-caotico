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
/** Na luta, a câmera nunca chega mais perto que isto (pedido do usuário: o campo de visão da habilidade maior), e o
 * golpe ocupa só o miolo da tela: até onde os pontos dele podem ir, de -1 a 1 em cada direção. O resto é o tabuleiro
 * em volta, pra ver de onde a peça veio e pra onde a vítima vai. */
const DISTANCIA_MINIMA_DA_LUTA = 5.2
const FOLGA_DA_LUTA = { lados: 0.66, cima: 0.55, baixo: 0.6 }

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

  /** A prévia da Loja: a câmera sai da tela inicial pra vista de jogo do lado `theta` (o tabuleiro inteiro, como numa
   * partida), e a captura faz o resto, com a câmera da luta de sempre: chega perto junto com quem ataca e abre com o voo
   * da vítima (pedido do usuário, 27/11: antes a câmera já ia de perto até a captura, o zoom antes do golpe, e não
   * sobrava nada pra acompanhar). A volta é `irParaVistaDoMenu`. Devolve quantos ms a câmera leva pra chegar. */
  function irParaAcao(theta: number): number {
    desfazerAproximacao()
    emMenu = false
    definirLadoDaCamera(1)
    levarCameraPara({ raio: raioQueEnquadra(INCLINACAO_CAMERA_JOGO, theta), phi: INCLINACAO_CAMERA_JOGO, theta })
    return giroCamera ? GIRO_CAMERA_MS : 0
  }

  // --- a câmera na luta ("o golpe que pesa"): na captura, chega um pouco mais perto de onde a luta acontece (mais
  // quanto mais pesa o golpe) e volta sozinha no fim; no xeque, encosta um instante no rei ameaçado. Se a pessoa mexe
  // na câmera no meio, ela fica onde a pessoa deixou
  interface PontoDeVista {
    alvo: THREE.Vector3
    pose: PoseCamera
  }
  interface Aproximacao {
    /** De onde a câmera saiu: é pra lá que ela volta (o centro, o giro e o zoom de antes). */
    antes: PontoDeVista
    de: PontoDeVista
    para: PontoDeVista
    inicio: number
    duracao: number
    voltando: boolean
    /** Acompanhando uma peça: de `para` até `perto`, conforme `progresso` (0 a 1). Na chegada de quem ataca, `para` é o
     * caminho inteiro e `perto` só o golpe; no voo da vítima, `para` é o golpe e `perto` o voo inteiro (ou a vista de
     * antes, quando ela sai do tabuleiro). */
    acompanhar?: { perto: PontoDeVista; progresso: () => number }
  }
  const CHEGA_MS = 650
  const VOLTA_MS = 900
  let aproximacao: Aproximacao | null = null
  let voltaDoRei: number | undefined
  const RECENTRA_MS = 450
  controls.addEventListener('start', () => {
    // a pessoa pegou a câmera: ela manda no giro e no zoom, mas o centro volta pro lugar (no celular todo toque conta
    // como pegar a câmera, e o centro ficava preso perto da luta, com o tabuleiro torto até na tela inicial)
    if (aproximacao) recentrar = { de: controls.target.clone(), para: aproximacao.antes.alvo.clone(), inicio: performance.now() }
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

  const pontoDeVistaAtual = (): PontoDeVista => ({ alvo: controls.target.clone(), pose: poseAtualDaCamera() })

  function irAte(para: PontoDeVista, duracao: number, voltando: boolean) {
    const de = pontoDeVistaAtual()
    const antes = aproximacao?.antes ?? { alvo: de.alvo.clone(), pose: { ...de.pose } }
    aproximacao = { antes, de, para, inicio: performance.now(), duracao, voltando }
  }

  /** Leva o centro uma `fracao` do caminho até `ponto` (e até a altura dele, com `naAltura`) e a distância pra
   * `fatorDoRaio` da de antes, olhando do mesmo lado; volta com `voltarDaLuta`. */
  function focar(ponto: THREE.Vector3, fracao: number, fatorDoRaio: number, naAltura: boolean, ms = CHEGA_MS) {
    if (emMenu || giroCamera || menosMovimento()) return
    window.clearTimeout(voltaDoRei)
    recentrar = null
    const antes = aproximacao?.antes ?? pontoDeVistaAtual()
    const alvo = antes.alvo.clone().lerp(new THREE.Vector3(ponto.x, naAltura ? ponto.y : antes.alvo.y, ponto.z), fracao)
    irAte({ alvo, pose: { ...antes.pose, raio: Math.max(controls.minDistance, antes.pose.raio * fatorDoRaio) } }, ms, false)
  }

  /**
   * O golpe inteiro à vista (pedido do usuário: a câmera de antes só chegava um pouco mais perto, do mesmo lado, e a
   * habilidade ficava atrás das outras peças ou fora da tela). Entre os pontos de vista em volta da luta (de lado pra
   * linha `rumo` entre as duas peças e girando dali, de quatro alturas), fica o que olha mais de lado (uma peça não
   * tampa a outra), com menos peças no caminho e girando menos a câmera; a distância é a menor em que todos os pontos
   * cabem na tela, com folga pros botões. Vale ver só as duas peças: devolve as `obstaculos` (as outras peças) que
   * ainda ficam no caminho, pra esmaecer.
   */
  function enquadrarLuta(
    pontosDoGolpe: THREE.Vector3[],
    rumo: THREE.Vector3,
    obstaculos: THREE.Object3D[],
    comeco?: { pontos: THREE.Vector3[]; progresso: () => number },
  ): THREE.Object3D[] {
    if (emMenu || giroCamera || menosMovimento() || pontosDoGolpe.length === 0) return []
    window.clearTimeout(voltaDoRei)
    recentrar = null
    const antes = aproximacao?.antes ?? pontoDeVistaAtual()
    // quem ataca ainda vai até a vítima: o ponto de vista é escolhido pro caminho inteiro (de onde ela sai até o golpe),
    // e a câmera vai fechando no golpe conforme ela chega (pedido do usuário)
    const pontos = comeco ? [...pontosDoGolpe, ...comeco.pontos] : pontosDoGolpe
    const centroDe = (pts: THREE.Vector3[]) => {
      const centro = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3())
      centro.y = THREE.MathUtils.clamp(centro.y, 0.3, 0.8)
      return centro
    }
    let alvo = centroDe(pontos)
    // a linha da luta, no chão: o ponto de vista de lado olha atravessado pra ela
    const linha = new THREE.Vector3(rumo.x, 0, rumo.z)
    const temLinha = linha.lengthSq() > 1e-6
    if (temLinha) linha.normalize()
    const deLado = temLinha ? Math.atan2(linha.x, linha.z) + Math.PI / 2 : antes.pose.theta
    const teste = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far)
    const posicao = new THREE.Vector3()
    /** A menor distância em que todos os pontos ficam dentro da tela, com folga. */
    const raioQueCabe = (phi: number, theta: number, pts = pontos) => {
      for (let raio = DISTANCIA_MINIMA_DA_LUTA; raio < 24; raio += 0.2) {
        posicao.setFromSphericalCoords(raio, phi, theta).add(alvo)
        teste.position.copy(posicao)
        teste.lookAt(alvo)
        teste.updateMatrixWorld()
        // a folga: os botões em cima e a situação embaixo
        if (pts.every((p) => {
          const naTela = p.clone().project(teste)
          return naTela.z < 1 && Math.abs(naTela.x) <= FOLGA_DA_LUTA.lados && naTela.y <= FOLGA_DA_LUTA.cima && naTela.y >= -FOLGA_DA_LUTA.baixo
        })) return raio
      }
      return 22
    }
    /** As outras peças que cortam alguma linha de visão (da câmera a cada ponto), e quantas linhas ficam cortadas. */
    const tampam = (de: THREE.Vector3) => {
      const pecas = new Set<THREE.Object3D>()
      let linhas = 0
      const linhaDeVisao = new THREE.Line3()
      const maisPerto = new THREE.Vector3()
      for (const p of pontos) {
        linhaDeVisao.set(de, p)
        let cortada = false
        for (const peca of obstaculos) {
          if (!peca.visible) continue
          for (const altura of [0.3, 0.7]) {
            const corpo = new THREE.Vector3(peca.position.x, altura * peca.scale.y, peca.position.z)
            const u = linhaDeVisao.closestPointToPointParameter(corpo, true)
            if (u > 0.04 && u < 0.97 && linhaDeVisao.at(u, maisPerto).distanceTo(corpo) < 0.26 * peca.scale.x) {
              pecas.add(peca)
              cortada = true
              break
            }
          }
        }
        if (cortada) linhas++
      }
      return { pecas: [...pecas], linhas }
    }
    let melhor: { pose: PoseCamera; nota: number; tampam: THREE.Object3D[] } | null = null
    for (const lado of [0, Math.PI]) {
      for (const giro of [0, -0.35, 0.35, -0.7, 0.7]) {
        const theta = deLado + lado + giro
        for (const elevacao of [30, 42, 54, 66]) {
          const phi = THREE.MathUtils.degToRad(90 - elevacao)
          const raio = raioQueCabe(phi, theta)
          posicao.setFromSphericalCoords(raio, phi, theta).add(alvo)
          // olhando ao longo da linha da luta, uma peça tampa a outra: o de lado vale mais que tudo. Depois, as peças
          // no caminho (esmaecem, mas é melhor nem precisar), girar a câmera pra longe de onde ela estava, subir demais
          // e ficar longe
          const olhar = new THREE.Vector3(alvo.x - posicao.x, 0, alvo.z - posicao.z).normalize()
          const aoLongo = temLinha ? Math.abs(olhar.dot(linha)) : 0
          const noCaminho = tampam(posicao)
          const nota = 6 * aoLongo + 2.5 * noCaminho.linhas + 0.8 * noCaminho.pecas.length + 0.9 * Math.abs(diferencaAngular(antes.pose.theta, theta)) + 0.025 * (elevacao - 30) + 0.08 * raio
          if (!melhor || nota < melhor.nota) melhor = { pose: { raio: Math.max(controls.minDistance, raio), phi, theta }, nota, tampam: noCaminho.pecas }
        }
      }
    }
    if (!melhor) return []
    const giroDaCamera = Math.abs(diferencaAngular(poseAtualDaCamera().theta, melhor.pose.theta))
    // com quem ataca ainda longe, a câmera só gira pro lado da luta e centra o caminho: não chega mais perto do que já
    // estava. A aproximação toda vem do andar da peça (antes ela dava um zoom de uma vez, até a distância mínima da luta,
    // e só depois acompanhava; parada esperando a peça sair, ficava no zoom: bug visto pelo usuário)
    // (26/11) e, de novo (27/11), a troca do centro pro lugar da luta: com a mesma distância do centro, a câmera andava na
    // direção da luta e chegava uns 16% mais perto com quem ataca ainda parado, virando ou guardando a katana. Agora ela
    // fica pelo menos tão longe da luta quanto já estava
    if (comeco) melhor.pose.raio = Math.max(melhor.pose.raio, poseAtualDaCamera().raio, camera.position.distanceTo(alvo))
    // e na altura de agora: descer pra altura da luta já fazia a peça parecer maior (a de baixo vê o corpo inteiro). A
    // altura também muda só com o andar de quem ataca
    const longe: PontoDeVista = { alvo: alvo.clone(), pose: comeco ? { ...melhor.pose, phi: poseAtualDaCamera().phi } : melhor.pose }
    irAte(longe, CHEGA_MS + 260 * giroDaCamera, false)
    if (comeco && aproximacao) {
      // o golpe sozinho, do mesmo lado e na mesma altura: é onde a câmera chega quando quem ataca chega
      alvo = centroDe(pontosDoGolpe)
      const raio = Math.max(controls.minDistance, raioQueCabe(melhor.pose.phi, melhor.pose.theta, pontosDoGolpe))
      aproximacao.acompanhar = { perto: { alvo: alvo.clone(), pose: { ...melhor.pose, raio } }, progresso: comeco.progresso }
    }
    return melhor.tampam
  }

  /**
   * A vítima foi arremessada (pedido do usuário): a câmera abre conforme ela voa, a mesma mecânica da chegada de quem
   * ataca, ao contrário. Do golpe ela vai até o enquadramento do voo inteiro (do golpe até onde a vítima cai); se a
   * vítima sai do tabuleiro, até a vista de antes da luta, chegando lá quando ela passa da beira. `progresso` é o quanto
   * do voo já foi (0 a 1).
   */
  function acompanharVoo(ateOnde: THREE.Vector3, progresso: () => number, praFora: boolean) {
    if (!aproximacao || aproximacao.voltando || emMenu || giroCamera || menosMovimento()) return
    window.clearTimeout(voltaDoRei)
    const agora = pontoDeVistaAtual()
    let destino: PontoDeVista
    if (praFora) destino = { alvo: aproximacao.antes.alvo.clone(), pose: { ...aproximacao.antes.pose } }
    else {
      // o voo inteiro à vista, do mesmo lado: o centro entre o golpe e a queda, longe o bastante pros dois caberem
      const alvo = agora.alvo.clone().lerp(new THREE.Vector3(ateOnde.x, agora.alvo.y, ateOnde.z), 0.5)
      const teste = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far)
      const posicao = new THREE.Vector3()
      const pontos = [agora.alvo.clone(), ateOnde.clone().setY(0.05), ateOnde.clone().setY(0.6)]
      // e abre de verdade (bug visto pelo usuário, 27/11): antes só se afastava se a queda não coubesse na tela, e quase
      // sempre cabia, então a câmera ficava parada no golpe. Agora vai pelo menos até a metade do caminho de volta à
      // distância de antes da luta, a mesma mecânica da chegada de quem ataca, ao contrário
      const posicaoDeAntes = new THREE.Vector3().setFromSphericalCoords(aproximacao.antes.pose.raio, aproximacao.antes.pose.phi, aproximacao.antes.pose.theta).add(aproximacao.antes.alvo)
      const metadeDaVolta = agora.pose.raio + 0.5 * Math.max(0, posicaoDeAntes.distanceTo(alvo) - agora.pose.raio)
      let raio = agora.pose.raio
      for (; raio < 22; raio += 0.2) {
        posicao.setFromSphericalCoords(raio, agora.pose.phi, agora.pose.theta).add(alvo)
        teste.position.copy(posicao)
        teste.lookAt(alvo)
        teste.updateMatrixWorld()
        if (pontos.every((p) => {
          const naTela = p.clone().project(teste)
          return naTela.z < 1 && Math.abs(naTela.x) <= FOLGA_DA_LUTA.lados && naTela.y <= FOLGA_DA_LUTA.cima && naTela.y >= -FOLGA_DA_LUTA.baixo
        })) break
      }
      destino = { alvo, pose: { ...agora.pose, raio: Math.max(raio, Math.min(metadeDaVolta, controls.maxDistance)) } }
    }
    // parte de onde a câmera está (sem tranco) e abre só com o voo
    aproximacao = { antes: aproximacao.antes, de: agora, para: agora, inicio: performance.now(), duracao: 1, voltando: false, acompanhar: { perto: destino, progresso } }
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
    irAte({ alvo: aproximacao.antes.alvo.clone(), pose: { ...aproximacao.antes.pose } }, VOLTA_MS + 200 * Math.abs(diferencaAngular(poseAtualDaCamera().theta, aproximacao.antes.pose.theta)), true)
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
    controls.target.copy(aproximacao.antes.alvo)
    colocarCamera(aproximacao.antes.pose)
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
    const { de, acompanhar } = aproximacao
    let { para } = aproximacao
    if (acompanhar && !aproximacao.voltando) {
      // acompanhando quem ataca: do caminho inteiro até o golpe, conforme ela chega perto da vítima
      const p = THREE.MathUtils.clamp(acompanhar.progresso(), 0, 1)
      const k = p * p * (3 - 2 * p)
      const { perto } = acompanhar
      para = {
        alvo: para.alvo.clone().lerp(perto.alvo, k),
        pose: {
          raio: para.pose.raio + (perto.pose.raio - para.pose.raio) * k,
          phi: para.pose.phi + (perto.pose.phi - para.pose.phi) * k,
          theta: para.pose.theta + diferencaAngular(para.pose.theta, perto.pose.theta) * k,
        },
      }
    }
    const t = Math.min(1, (agora - aproximacao.inicio) / aproximacao.duracao)
    const suave = t * t * (3 - 2 * t)
    controls.target.copy(de.alvo).lerp(para.alvo, suave)
    colocarCamera({
      raio: de.pose.raio + (para.pose.raio - de.pose.raio) * suave,
      phi: de.pose.phi + (para.pose.phi - de.pose.phi) * suave,
      theta: de.pose.theta + diferencaAngular(de.pose.theta, para.pose.theta) * suave,
    })
    camera.lookAt(controls.target)
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
    enquadrarLuta,
    acompanharVoo,
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
