// Só no desenvolvimento: os ganchos que os testes usam pra conferir o que está dentro do desenho 3D (casa em xeque,
// câmera, peças, relógio) e pra jogar sem clicar na tela (window.__xadrez).
import * as THREE from 'three'
import { Chess, type Square } from 'chess.js'
import { type LivroDeAberturas } from '../jogo/pgnBook'
import { type Dificuldade, escolherJogadaDaMaquina } from '../jogo/engine'
import { contarPartidas } from '../conta/conquistas'
import { RelogioDeXadrez, relogioNovo, type Ritmo } from '../jogo/relogio'
import { forcarGolpeSemArma, type GolpeSemArma } from './combate/lutaSemArma'
import { ambienteTocando, somDestravado } from '../som/sons'
import { type PartidaXadrez } from '../dados/xadrezRepo'
import { type EstadoDaSala } from '../dados/salaAoVivo'
import { diferencaAngular, rumoDeDescanso } from './animacoes/movimento'
import { squareToPos, squareToPosPeca } from './casas'
import { marretadas } from './combate/marreta'
import { mostrarEspadaRPG } from './pecas/modelosRPG'
import type { Andamento, PecaPromocao } from './fluxo/andamento'
import type { CenaDoTabuleiro } from './cena/montarCena'
import type { VistaDaCamera } from './cena/vistaDaCamera'
import { habilidadesIncompletas } from './combate/habilidades'
import { quantosCongelamentos } from './sensacao/relogioDoJogo'
import { estadoDoClimaDoSom } from '../som/sons'

/** Só nos testes: veste as peças de quem joga sem passar pela conta (as habilidades também). */
export let vestimentaDeTeste: Record<string, Record<string, string>> | null = null

type Ref<T> = { current: T }

export interface DependenciasDosTestes {
  cena: CenaDoTabuleiro
  vista: VistaDaCamera
  pieceMeshBySquare: Map<string, THREE.Group>
  andamento: Andamento
  chessRef: Ref<Chess>
  livroRef: Ref<LivroDeAberturas>
  partidaAtualRef: Ref<PartidaXadrez | null>
  corHumanoRef: Ref<'w' | 'b'>
  relogioRef: Ref<RelogioDeXadrez | null>
  vezDaMaquinaRef: Ref<boolean>
  salaRef: Ref<{ estado: EstadoDaSala | null } | null>
  resolverPromocaoRef: Ref<((peca: PecaPromocao | null) => void) | null>
  resolverHabilidadeRef: Ref<((id: string | null) => void) | null>
  carregarPgn: (pgn: string, cor: 'w' | 'b') => void
  sincronizarPecas: () => void
  tentarSelecionar: (casa: Square) => void
  tentarMover: (casa: Square) => void
}

export function instalarGanchosDeTeste(dependencias: DependenciasDosTestes) {
  const { vista, pieceMeshBySquare, andamento, chessRef, livroRef, partidaAtualRef, corHumanoRef, relogioRef, vezDaMaquinaRef, salaRef, resolverPromocaoRef, resolverHabilidadeRef, carregarPgn, sincronizarPecas, tentarSelecionar, tentarMover } = dependencias
  const { camera, controls, renderer, piecesGroup, xequeMesh, labelsGroup, dirLight } = dependencias.cena
  ;(window as unknown as { __xadrez?: object }).__xadrez = {
    casaEmXeque: () => (xequeMesh.visible ? (xequeMesh.userData.casa as string) : null),
    /** Veste as peças de quem joga como se fosse a escolha da conta. */
    vestirParaTeste: (escolhas: Record<string, Record<string, string>> | null) => {
      vestimentaDeTeste = escolhas
      sincronizarPecas()
    },
    /** A luta sem arma deixa de sortear e usa sempre esse golpe (null volta a sortear). */
    forcarGolpeSemArma: (golpe: GolpeSemArma | null) => forcarGolpeSemArma(golpe),
    /** O que as conquistas contam nessas partidas. */
    contarConquistas: (partidas: PartidaXadrez[]) => contarPartidas(partidas),
    /** As partes da personalização que a peça daquela casa está vestindo. */
    vestimentaDaCasa: (casa: string) => {
      const nomes: string[] = []
      pieceMeshBySquare.get(casa)?.traverse((filho) => {
        if (filho.name.startsWith('vestimenta:')) nomes.push(filho.name)
      })
      return nomes
    },
    /** As partes da katana do modelo que aparecem na peça da casa. */
    katanaDaCasa: (casa: string) => {
      const partes: string[] = []
      pieceMeshBySquare.get(casa)?.traverse((filho) => {
        const material = filho.userData.material as string | undefined
        if (filho.visible && material && ['EspadaLamina', 'EspadaCabo', 'CaboBainha', 'BainhaKatana'].includes(material)) partes.push(material)
      })
      return partes
    },
    distanciaCamera: () => camera.position.distanceTo(controls.target),
    /** Câmera perto de uma casa, pras fotos dos efeitos (theta em graus, 0 = do lado das brancas). */
    aproximarDaCasa: (casa: string, raio = 4.5, theta = 0, inclinacao = 55) => {
      const { x, z } = squareToPos(casa)
      controls.target.set(x, 0.5, z)
      vista.colocarCamera({ raio, phi: THREE.MathUtils.degToRad(inclinacao), theta: THREE.MathUtils.degToRad(theta) })
      camera.lookAt(controls.target)
      controls.update()
    },
    /** Lance ou máquina ainda em andamento. */
    ocupado: () => vezDaMaquinaRef.current || andamento.lancesEmAndamento > 0,
    /** Lado da câmera (z positivo = brancas perto da tela) e se ela ainda está girando. */
    camera: () => ({ z: camera.position.z, girando: vista.girando(), coordenadaA: labelsGroup.children[0].position.z, distancia: camera.position.distanceTo(controls.target), distanciaIdeal: vista.distanciaQueEnquadra(), centro: controls.target.toArray() }),
    /** Como se a pessoa encostasse na câmera (no celular, todo toque conta): o 'start' dos controles. */
    pegarCamera: () => controls.dispatchEvent({ type: 'start' }),
    /** Onde a casa aparece no tabuleiro, em pixels da janela. */
    casaNaTela: (casa: string) => {
      const { x, z } = squareToPos(casa)
      const p = new THREE.Vector3(x, 0, z).project(camera)
      const r = renderer.domElement.getBoundingClientRect()
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
    },
    /** O navegador já liberou o som, e o som ambiente está tocando? */
    estadoDoSom: () => ({ destravado: somDestravado(), ambiente: ambienteTocando() }),
    /** Câmera na vista da tela inicial, resolução do desenho e sombras: o que a configuração muda. */
    cena: () => ({ menu: vista.emMenu(), resolucao: renderer.getPixelRatio(), sombras: dirLight.castShadow, arrastavel: controls.enabled, theta: vista.poseAtualDaCamera().theta }),
    /** Golpes de marreta em andamento. */
    marretadas: () => marretadas.size,
    /** A vez já é da máquina: da peça da pessoa parar até o fim do lance dela. */
    vezDaMaquina: () => vezDaMaquinaRef.current,
    sala: () => salaRef.current?.estado ?? null,
    /** Cada peça do motor tem a sua peça 3D, do tipo/cor certos, na cena e no centro da casa — e nada sobrando. */
    problemasDoTabuleiro: () => {
      const problemas: string[] = []
      const casas = chessRef.current.board().flat().filter((c): c is NonNullable<typeof c> => !!c)
      for (const casa of casas) {
        const mesh = pieceMeshBySquare.get(casa.square)
        if (!mesh) {
          problemas.push(`sem peça 3D em ${casa.square}`)
          continue
        }
        if (mesh.userData.tipo !== casa.type || mesh.userData.cor !== casa.color) problemas.push(`peça errada em ${casa.square}`)
        if (mesh.parent !== piecesGroup) problemas.push(`peça de ${casa.square} fora da cena`)
        const alvo = squareToPosPeca(casa.square)
        const erro = Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z)
        if (erro > 0.12) problemas.push(`peça de ${casa.square} fora do lugar (${erro.toFixed(2)})`)
      }
      if (pieceMeshBySquare.size !== casas.length) problemas.push(`mapa com ${pieceMeshBySquare.size} peças, motor com ${casas.length}`)
      if (piecesGroup.children.length !== casas.length) problemas.push(`cena com ${piecesGroup.children.length} peças, motor com ${casas.length}`)
      return problemas
    },
    /** Clica numa casa como quem joga: seleciona a peça ou, fora da vez, faz ela recusar. */
    clicarCasa: (casa: string) => tentarSelecionar(casa as Square),
    /** Quanto a peça da casa está fora do centro dela e do giro de descanso. */
    descansoDaPeca: (casa: string) => {
      const mesh = pieceMeshBySquare.get(casa as Square)
      if (!mesh) return null
      const alvo = squareToPosPeca(casa as Square)
      return { distancia: Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z), giro: Math.abs(diferencaAngular(mesh.rotation.y, rumoDeDescanso(mesh))) }
    },
    /** Joga como o jogador (clique na peça e na casa). */
    jogar: (de: string, para: string) => {
      tentarSelecionar(de as Square)
      tentarMover(para as Square)
    },
    /** Responde a pergunta da promoção, como quem toca na peça. */
    escolherPromocao: (peca: PecaPromocao) => resolverPromocaoRef.current?.(peca),
    /** Escolhe a habilidade da captura, como quem toca no botão dela. */
    escolherHabilidade: (id: string) => resolverHabilidadeRef.current?.(id),
    /** A katana está na mão de alguma peça? (a que ficou fora, de um gesto cortado pelo lance) */
    katanasNaMao: () => piecesGroup.children.filter((peca) => (peca.userData.espadaRPG as { fora?: boolean } | undefined)?.fora).length,
    /** Tira a katana da bainha do peão da casa, como um gesto com ela que o lance cortou no meio. */
    sacarKatanaParaTeste: (casa: string) => {
      const peca = pieceMeshBySquare.get(casa)
      if (peca) mostrarEspadaRPG(peca, true)
    },
    /** As partes da personalização à vista na peça da casa (a da promoção, vestida parte por parte). */
    partesVisiveis: (casa: string) => {
      const partes = new Set<string>()
      pieceMeshBySquare.get(casa as Square)?.traverse((filho) => {
        if (typeof filho.userData.parte === 'string' && filho.visible) partes.add(filho.userData.parte)
      })
      return [...partes].sort()
    },
    lancesDoJogador: () => (chessRef.current.turn() === corHumanoRef.current ? chessRef.current.moves({ verbose: true }).map((m) => [m.from, m.to]) : []),
    fen: () => chessRef.current.fen(),
    /** O lance que a máquina dessa dificuldade escolhe na posição, sem mexer no tabuleiro. */
    lanceDaMaquina: (fen: string, dificuldade: Dificuldade) => escolherJogadaDaMaquina(new Chess(fen), livroRef.current, dificuldade),
    dificuldadeDaPartida: () => partidaAtualRef.current?.dificuldade ?? null,
    /** O que falta em cada habilidade do catálogo (vazio: tudo certo). */
    habilidadesIncompletas: () => habilidadesIncompletas(),
    /** "O golpe que pesa": quantas vezes o impacto congelou, o ambiente abafado e o tom dos golpes. */
    golpeQuePesa: () => ({ congelamentos: quantosCongelamentos(), ...estadoDoClimaDoSom() }),
    /** Começa uma partida de teste a partir de um PGN (não aparece nas partidas do jogador). */
    carregarTeste: (pgn: string, cor: 'w' | 'b', dificuldade?: PartidaXadrez['dificuldade'], ritmo?: Ritmo) => {
      const agora = Date.now()
      partidaAtualRef.current = {
        id: `teste-${agora}`,
        jogador: '__teste__',
        corJogador: cor,
        pgn,
        status: 'EM_ANDAMENTO',
        // a partida de teste conta como tendo bilhete: a taça mostra o prêmio como numa partida de verdade
        bilhete: true,
        criadaEm: agora,
        atualizadaEm: agora,
        ...(dificuldade ? { dificuldade } : {}),
        ...(ritmo ? { relogio: relogioNovo(ritmo) } : {}),
      }
      carregarPgn(pgn, cor)
    },
    /** O relógio da blitz: quanto resta a cada lado agora. */
    relogio: () => relogioRef.current?.salvo() ?? null,
    /** Muda o tempo que resta a um lado (pra testar o fim no tempo sem esperar minutos). */
    ajustarRelogio: (cor: 'w' | 'b', ms: number) => {
      if (relogioRef.current) relogioRef.current.restante[cor] = ms
    },
    /** A partida aberta, como está gravada. */
    partidaAtual: () => (partidaAtualRef.current ? { ...partidaAtualRef.current } : null),
  }
}
