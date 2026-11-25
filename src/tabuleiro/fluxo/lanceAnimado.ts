// O lance animado: a peça anda da casa de origem até a de destino; numa captura, a luta vem antes (golpe corpo a corpo,
// à distância, a arma de cada peça, o atropelo do cavalo, a luta sem arma) e a vítima cai e some (en passant também).
// No roque a torre anda junto, e a promoção tem a cerimônia dela. Só anima e aplica o lance no motor: o resto (texto de
// situação, relógio, máquina, sala) fica com quem chama.
import * as THREE from 'three'
import { Chess, type Square } from 'chess.js'
import { RelogioDeXadrez } from '../../jogo/relogio'
import { afundarPelaGravidade, convocarCristal, cortarAoMeio, rachadurasNoTabuleiro, soltarOCavalo, tornadoDaLua, tremerTabuleiro } from '../combate/efeitosDasArmas'
import { distanciaDaLuta, type GolpeSemArma, lutarSemArma, sortearGolpeSemArma } from '../combate/lutaSemArma'
import { tocarSom } from '../../som/sons'
import { type PartidaXadrez } from '../../dados/xadrezRepo'
import { type Peca } from '../../conta/personalizacao'
import { animarAscensao, animarPetalas, virarSuave } from '../animacoes/cerimonias'
import { estocarComLanca, paradaDaLanca } from '../combate/lancaDoCavalo'
import { cavaloChegaEMontam, daMontaria, desfazerEquipamentos, doCavaleiro, encaixarEquipamentos, esconderPartes, partesVestidas, peaoCavaleiro } from '../animacoes/promocao'
import { animarComemoracao, voltarAoDescanso } from '../animacoes/gestos'
import { animarPosicao, animarPosicaoRPG, deslocarRPG, pararRPG, pecaSaltaRPG, rumoEntre, virarRPG } from '../animacoes/movimento'
import { prepararParaSumir } from '../animacoes/queda'
import { anelDeImpacto, estouroDeRiscos, faisca, respingos } from '../combate/efeitosDeAnime'
import { nocautear, sacudir } from '../combate/nocaute'
import { massaDaPeca } from '../sensacao/realismo'
import { congelar } from '../sensacao/relogioDoJogo'
import { squareToPosPeca } from '../casas'
import { ALCANCE_GOLPE, animarAtaqueEspada, animarImpacto, CHANCE_HONRA_SAMURAI, DISTANCIA_REVERENCIA, type EstiloAtaque } from '../combate/golpes'
import { alcanceDaMaca, ARMAS_DA_TORRE, baterComMarreta, cairDaMaca, esmagarPeca, MACA_ERGUIDA_ATE_MS, MARRETA_PANCADA_MS, ondaDaMarretada, pancadaNoPeito, poeiraDaPancada, prenderPeloPeito, soltarDaMaca } from '../combate/marreta'
import { lancarOndaDoRei, lancarPoderDoBispo, lancarRaioDaDama } from '../combate/poderes'
import { CAPTURAS, type CapturaComHabilidade } from '../combate/habilidades'
import { HABILIDADES, habilidadesQuePodem } from '../../conta/habilidades'
import { antecipar, areaDaLuta, continuarDoGolpe, depoisDoCongelamento, pesoDoGolpe, sentirImpacto, type SensacaoDaPartida, tomDaTroca } from '../sensacao/golpeQuePesa'
import { materiaisDaPeca, materiaisPorFaccao, materialCoroa } from '../pecas/materiais'
import { type EspadaRPG, guardarEspadaRPG, modelosRPG, mostrarEspadaRPG, novaSequenciaRPG, sacarEspadaRPG, sequenciaRPGValida, tocarClipeRPGUmaVez, tocarGolpeRPG } from '../pecas/modelosRPG'
import { armaDoPeaoNoTabuleiro, escolhasDaCor } from '../pecas/vestimenta'
import type { Andamento } from './andamento'
import type { CenaDoTabuleiro } from '../cena/montarCena'

export interface DependenciasDoLance {
  cena: Pick<CenaDoTabuleiro, 'scene' | 'piecesGroup'>
  pieceMeshBySquare: Map<string, THREE.Group>
  chessRef: { current: Chess }
  partidaAtualRef: { current: PartidaXadrez | null }
  relogioRef: { current: RelogioDeXadrez | null }
  andamento: Andamento
  sincronizarPecas: (recriar?: boolean, porParteEm?: string) => void
  salvarProgresso: () => void
  pecasAliadasProximas: (square: Square, cor: 'w' | 'b', raio: number) => { square: Square; mesh: THREE.Group }[]
  /** Desconta o tempo de quem tem a vez (e acaba a partida se zerou). */
  andarRelogioDaPartida: () => unknown
  setHistorico: (lances: string[]) => void
  /** A câmera, a borda e o ambiente acompanhando a captura ("o golpe que pesa"). */
  sensacao: SensacaoDaPartida
}

/** A habilidade especial com que a peça captura, ou null: equipada pelo dono dela (quem joga ou, na partida contra
 * outra pessoa, o adversário), desta peça, e com a arma que ela pede na mão (o servidor só deixa equipar quem comprou).
 * A escolhida vem do clique de quem joga ou, no lance do adversário, do servidor. */
function habilidadeDaCaptura(atacante: THREE.Object3D, tipo: string, cor: 'w' | 'b', ehRPG: boolean, arma: string, escolhida?: string): string | null {
  if (!ehRPG) return null
  const naMao = tipo === 'p' ? (armaDoPeaoNoTabuleiro(atacante) ?? 'nenhuma') : arma
  const podem = habilidadesQuePodem(escolhasDaCor(cor)[tipo] ?? {}, tipo, naMao)
  // a escolhida na hora da captura; sem escolha (um bloco só, ou a prévia), a do primeiro bloco que pode
  if (escolhida && podem.includes(escolhida)) return escolhida
  return podem[0] ?? null
}

/** A katana que ficou na mão (um gesto com ela cortado no meio por um lance: quem a guardaria perdeu a vez) volta pra
 * bainha antes de a peça seguir sem ela (as habilidades, os socos, a reverência, o passo de sempre). `depois` roda com
 * ela guardada, ou na hora se já estava. Se a guarda não terminar (o clipe cortado), segue do mesmo jeito. */
function embainharAntes(peca: THREE.Object3D, depois: () => void) {
  const espada = peca.userData.espadaRPG as EspadaRPG | undefined
  if (!espada?.fora) {
    depois()
    return
  }
  let feito = false
  const seguir = () => {
    if (feito) return
    feito = true
    depois()
  }
  guardarEspadaRPG(peca, novaSequenciaRPG(peca), seguir)
  window.setTimeout(() => {
    if (feito) return
    mostrarEspadaRPG(peca, false)
    seguir()
  }, 1600)
}

export function criarLanceAnimado(dependencias: DependenciasDoLance) {
  const { cena, pieceMeshBySquare, chessRef, partidaAtualRef, relogioRef, andamento, sincronizarPecas, salvarProgresso, pecasAliadasProximas, andarRelogioDaPartida, setHistorico, sensacao } = dependencias
  const { scene, piecesGroup } = cena

  /**
   * Aplica um lance (SAN da máquina, ou {from,to} do clique do jogador) já animando a peça da
   * posição de origem até o destino; numa captura, o golpe (corpo a corpo, à distância ou o
   * atropelo do cavalo) vem antes, e a vítima cai e some (inclusive en passant). No roque a torre
   * anda junto com o rei. A promoção só assume a forma final ao ressincronizar no fim.
   */
  function executarLanceComAnimacao(
    entrada: string | { from: Square; to: Square; promotion?: string; habilidade?: string },
    aoTerminar: () => void,
  ) {
    const chess = chessRef.current
    let origem: Square | undefined
    let destino: Square | undefined

    if (typeof entrada === 'string') {
      const candidato = chess.moves({ verbose: true }).find((m) => m.san === entrada)
      if (candidato) {
        origem = candidato.from as Square
        destino = candidato.to as Square
      }
    } else {
      origem = entrada.from
      destino = entrada.to
    }

    const meshMovendo = origem ? pieceMeshBySquare.get(origem) : undefined

    // blitz: o tempo de quem joga corre até este instante; se zerou antes, o lance não sai
    if (relogioRef.current) {
      andarRelogioDaPartida()
      if (partidaAtualRef.current?.status === 'FINALIZADA') {
        aoTerminar()
        return
      }
    }

    // chess.js (v1.x) lança exceção pra um lance que não é mais válido na posição atual (ex: um
    // lance calculado antes de outro já ter sido aplicado nesse meio-tempo) — sem isso, essa
    // exceção ficava sem tratamento dentro do setTimeout assíncrono e travava a tela pra sempre
    // em "a máquina está pensando…", já que aoTerminar() nunca era chamado.
    let resultado: ReturnType<typeof chess.move> | null
    try {
      resultado =
        typeof entrada === 'string' ? chess.move(entrada) : chess.move({ ...entrada, promotion: entrada.promotion ?? 'q' })
    } catch {
      resultado = null
    }
    if (!resultado) {
      aoTerminar()
      return
    }

    // registra o lance assim que é aplicado no motor — atualiza a lista de "Lances" e salva no
    // servidor na hora, sem esperar a animação (que numa captura leva vários segundos) terminar.
    // Antes só acontecia no fim da animação: fechar a aba nesse meio-tempo perdia o último lance,
    // e a lista de lances ficava visivelmente atrasada em relação ao que já tinha acontecido.
    // Na blitz, quem jogou aperta o relógio: ganha o acréscimo, e o relógio para enquanto a peça anda
    relogioRef.current?.lance(resultado.color)
    // a troca: capturas seguidas, dos dois lados, sobem o tom; um lance sem captura zera
    andamento.capturasSeguidas = resultado.captured ? andamento.capturasSeguidas + 1 : 0
    setHistorico(chess.history())
    salvarProgresso()

    // a partir daqui o lance é desse tabuleiro: se outro entrar no meio (novo jogo, outra partida),
    // nada do que falta (chegada, captura, ajuste das peças, próximo lance) acontece mais
    const minhaGeracao = andamento.geracao
    const vigente = () => minhaGeracao === andamento.geracao
    andamento.lancesEmAndamento++
    const terminar = () => {
      if (!vigente()) return
      andamento.lancesEmAndamento = Math.max(0, andamento.lancesEmAndamento - 1)
      aoTerminar()
    }

    // daqui pra frente o lance e as casas não mudam mais (constantes pros callbacks das animações)
    const lance = resultado
    const casaOrigem = origem
    const casaDestino = destino

    /** A peça chegou: o mapa casa → peça passa a apontar pra ela na casa nova — ela é
     * reaproveitada no fim do lance (ver sincronizarPecas), não recriada. */
    function chegou(mesh: THREE.Group, de: Square, para: Square) {
      if (!vigente()) return
      if (pieceMeshBySquare.get(de) === mesh) pieceMeshBySquare.delete(de)
      pieceMeshBySquare.set(para, mesh)
    }

    // roque: a torre também anda até a casa dela, junto com o rei
    const linhaDoRoque = resultado.color === 'w' ? '1' : '8'
    const torreDe = resultado.isKingsideCastle()
      ? (`h${linhaDoRoque}` as Square)
      : resultado.isQueensideCastle()
        ? (`a${linhaDoRoque}` as Square)
        : undefined
    const torrePara = resultado.isKingsideCastle()
      ? (`f${linhaDoRoque}` as Square)
      : resultado.isQueensideCastle()
        ? (`d${linhaDoRoque}` as Square)
        : undefined

    /** A peça (e, no roque, a torre) anda de onde está agora até a casa de destino; no fim, o
     * tabuleiro se ajusta reaproveitando as peças. */
    function seguirParaDestino() {
      if (!vigente()) return
      if (!meshMovendo || !casaOrigem || !casaDestino) {
        sincronizarPecas()
        terminar()
        return
      }
      let pendentes = 1
      const terminouUma = () => {
        if (!vigente()) return
        pendentes--
        if (pendentes === 0) {
          sincronizarPecas()
          terminar()
        }
      }
      // de onde a peça está agora — numa captura corpo a corpo ela já está perto da vítima
      const de = { x: meshMovendo.position.x, z: meshMovendo.position.z }
      animarPosicao(meshMovendo, de, squareToPosPeca(casaDestino), () => {
        chegou(meshMovendo, casaOrigem, casaDestino)
        if (!lance.isPromotion()) {
          terminouUma()
          return
        }
        // promoção: a ascensão — a luz envolve o peão, o que ele veste se desfaz nela, ele levita e vira a peça
        // nova, que nasce sem os equipamentos: eles surgem em volta e voam até ela, e ela só fica completa quando o
        // último se encaixa. No cavalo, o peão continua peão, recebe o equipamento do cavaleiro, e um cavalo chega
        // a galope pra ele montar
        tocarSom('promocao')
        desfazerEquipamentos(meshMovendo, vigente)
        const tipoNovo = (lance.promotion ?? 'q') as Peca
        const corDoBrilho = materiaisPorFaccao[lance.color].brilho.color
        const escolhas = escolhasDaCor(lance.color)
        const vestidas = partesVestidas(tipoNovo, escolhas)
        const materiais = materiaisDaPeca(lance.color)
        const destino = squareToPosPeca(casaDestino)
        // o foco da ascensão: a câmera fecha na peça; no clarão a peça nova vira de frente pra câmera (as linhas de foco
        // do anime) e recebe os equipamentos olhando pra quem joga; no último encaixe, a pose: brilho e faísca, e ela
        // volta a olhar pra frente
        const corpoDaPeca = new THREE.Vector3(destino.x, 0.75, destino.z)
        sensacao.focarNaAscensao(corpoDaPeca)
        let focoSolto = false
        const soltarFoco = () => {
          if (focoSolto) return
          focoSolto = true
          sensacao.soltarFoco()
        }
        const olharPraCamera = (peca: THREE.Object3D) => {
          sensacao.linhasDeFoco(corpoDaPeca, 420)
          faisca(scene, corpoDaPeca.clone().setY(1.25), corDoBrilho, 0.9, 380)
          virarSuave(peca, sensacao.rumoDaCamera(peca.position), 450)
        }
        /** A pose do fim: o brilho na peça completa, um instante parada de frente, e volta a olhar pro rumo dela. */
        const poseFinal = (peca: THREE.Object3D, rumo: number, depois: () => void) => {
          if (!vigente()) {
            soltarFoco()
            depois()
            return
          }
          tocarSom('ascensao:pose')
          faisca(scene, corpoDaPeca, corDoBrilho, 1.3, 420)
          sensacao.linhasDeFoco(corpoDaPeca, 300)
          window.setTimeout(() => {
            soltarFoco()
            virarSuave(peca, rumo, 450, depois)
          }, 420)
        }
        if (tipoNovo === 'n' && modelosRPG.n && modelosRPG.p) {
          let cavalo: THREE.Group | undefined
          let peao: THREE.Group | null = null
          animarAscensao(
            scene,
            meshMovendo,
            corDoBrilho,
            () => {
              if (!vigente()) return undefined
              sincronizarPecas(false, casaDestino)
              cavalo = pieceMeshBySquare.get(casaDestino)
              peao = peaoCavaleiro(lance.color, escolhas.n ?? {}, materiais)
              if (!cavalo || !peao) return cavalo
              cavalo.visible = false
              peao.position.set(destino.x, 0.05, destino.z)
              esconderPartes(peao, doCavaleiro(vestidas))
              piecesGroup.add(peao)
              olharPraCamera(peao)
              return peao
            },
            () => {
              const peaoQueMonta = peao
              if (!vigente() || !cavalo || !peaoQueMonta) {
                soltarFoco()
                terminouUma()
                return
              }
              const cavaloDaCasa = cavalo
              encaixarEquipamentos({
                cena: scene,
                peca: peaoQueMonta,
                tipo: 'n',
                partes: doCavaleiro(vestidas),
                materiais,
                cor: corDoBrilho,
                continua: vigente,
                // a pose de frente pra câmera e, solto o foco (o cavalo vem de longe), o cavalo chega pra ele montar
                aoTerminar: () =>
                  poseFinal(peaoQueMonta, peaoQueMonta.rotation.y, () =>
                    cavaloChegaEMontam({
                      cena: scene,
                      cavalo: cavaloDaCasa,
                      peao: peaoQueMonta,
                      destino,
                      partesDaMontaria: daMontaria(vestidas),
                      materiais,
                      cor: corDoBrilho,
                      continua: vigente,
                      aoTerminar: terminouUma,
                    }),
                  ),
              })
            },
          )
          return
        }
        let pecaNova: THREE.Object3D | undefined
        let rumoDaPecaNova = 0
        animarAscensao(
          scene,
          meshMovendo,
          corDoBrilho,
          () => {
            if (!vigente()) return undefined
            sincronizarPecas(false, casaDestino)
            pecaNova = pieceMeshBySquare.get(casaDestino)
            if (pecaNova) {
              esconderPartes(pecaNova, vestidas, tipoNovo)
              rumoDaPecaNova = pecaNova.rotation.y
              olharPraCamera(pecaNova)
            }
            return pecaNova
          },
          () => {
            const completa = pecaNova
            if (!vigente() || !completa) {
              soltarFoco()
              terminouUma()
              return
            }
            encaixarEquipamentos({
              cena: scene,
              peca: completa,
              tipo: tipoNovo,
              partes: vestidas,
              materiais,
              cor: corDoBrilho,
              continua: vigente,
              aoTerminar: () => poseFinal(completa, rumoDaPecaNova, terminouUma),
            })
          },
        )
      })
      const torre = torreDe ? pieceMeshBySquare.get(torreDe) : undefined
      if (torre && torreDe && torrePara) {
        tocarSom('roque')
        pendentes++
        animarPosicao(torre, squareToPosPeca(torreDe), squareToPosPeca(torrePara), () => {
          chegou(torre, torreDe, torrePara)
          terminouUma()
        })
      }
    }

    // captura: golpe primeiro, só depois a vítima cai e some — o peão (geométrico ou RPG) e
    // qualquer peça RPG golpeiam; uma peça geométrica de outro tipo mantém a remoção direta. O
    // golpe só acontece aqui, na hora da captura
    const casaDaVitima = (resultado.isEnPassant() && casaOrigem && casaDestino ? `${casaDestino[0]}${casaOrigem[1]}` : casaDestino) as
      | Square
      | undefined
    const vitima = casaDaVitima ? pieceMeshBySquare.get(casaDaVitima) : undefined
    const golpeia = resultado.piece === 'p' || Boolean(meshMovendo?.userData.acoesRPG)
    // quem vai ser capturado não segura a katana (um gesto dele cortado pela captura)
    if (vitima) mostrarEspadaRPG(vitima, false)

    if (vitima && golpeia && meshMovendo && casaOrigem && casaDestino) {
      const atacante = meshMovendo
      const tipoAtacante = resultado.piece
      const ehRPG = Boolean(atacante.userData.acoesRPG)
      const corAtacante = resultado.color
      const posVitima = { x: vitima.position.x, z: vitima.position.z }

      // "o golpe que pesa": a câmera chega perto, a borda escurece e o ambiente abaixa enquanto dura a luta, mais quanto
      // mais pesa (a peça capturada e a arma); nas trocas seguidas, os golpes soam mais agudos
      const armaDoAtacante = (atacante.userData.arma as string | undefined) ?? 'nenhuma'
      const habilidade = habilidadeDaCaptura(atacante, tipoAtacante, corAtacante, ehRPG, armaDoAtacante, typeof entrada === 'string' ? undefined : entrada.habilidade)
      const tipoVitima = (vitima.userData.tipo as string | undefined) ?? 'p'
      const peso = pesoDoGolpe(tipoVitima, habilidade ?? armaDoAtacante)
      // de longe: a habilidade que não sai do lugar e os poderes (rei, dama e bispo com arma); o resto vai até a vítima.
      // Jogam a vítima pela força os golpes simples e a Dempsey Roll; as armas com efeito próprio, não
      const habilidadeDeLonge = habilidade ? HABILIDADES[habilidade].alcance === 'aDistancia' : false
      const deLonge = habilidade ? habilidadeDeLonge : ehRPG && armaDoAtacante !== 'nenhuma' && ['b', 'q', 'k'].includes(tipoAtacante)
      // o cavalo de lança vem a galope e para no alcance dela (pedido do usuário): espeta pelo peito, puxa, e a vítima cai
      const comLanca = tipoAtacante === 'n' && ehRPG && armaDoAtacante === 'lanca' && !habilidade
      const paradaDoCavalo = comLanca ? paradaDaLanca(atacante, vitima) : undefined
      const comEfeitoProprio =
        ['marreta', 'machado', 'maca', 'cetro', 'lua'].includes(armaDoAtacante) || habilidade === 'retalhamento' || habilidade === 'puxao' || habilidade === 'espiral' || comLanca
      sensacao.comecarLuta(
        areaDaLuta(atacante, vitima, deLonge, !comEfeitoProprio, { alto: habilidade === 'puxao', parada: paradaDoCavalo, praFora: habilidade === 'empurrao', espiral: habilidade === 'espiral' }),
        peso,
        tomDaTroca(andamento.capturasSeguidas),
      )
      let lutaAcabou = false
      /** O golpe acertou: congela um instante, treme e solta as vozes (`fator` multiplica o peso). Devolve os ms do
       * congelamento, que a queda da vítima espera. */
      const impacto = (fator = 1, tremer = true, grunhido = true) => sentirImpacto(scene, tipoAtacante, tipoVitima, peso * fator, tremer, grunhido)

      const removerVitima = () => {
        if (!vigente()) return
        if (!lutaAcabou) {
          lutaAcabou = true
          sensacao.terminarLuta()
        }
        vitima.removeFromParent()
        if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === vitima) pieceMeshBySquare.delete(casaDaVitima)
      }
      // peças aliadas da atacante que estejam por perto comemoram junto, numa versão curta da
      // comemoração de xeque-mate
      const comemorarAliadas = () => {
        let atraso = 0
        for (const aliada of pecasAliadasProximas(casaDestino, corAtacante, 2.2)) {
          if (aliada.mesh === atacante) continue
          animarComemoracao(aliada.mesh, atraso, 900)
          atraso += 80
        }
      }

      // o cavalo de lança: a vítima vê o cavalo vindo e vira pra ele; ele vem a galope até o alcance da lança, mira e
      // investe, a ponta entra no peito, ela fica presa tremendo, ele puxa a lança, e ela desaba pra frente e some
      // (lancaDoCavalo.ts e nocaute.ts)
      if (comLanca) {
        voltarAoDescanso(atacante)
        novaSequenciaRPG(atacante)
        const de = { x: atacante.position.x, z: atacante.position.z }
        const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
        const fracao = Math.max(0, (distancia - (paradaDoCavalo ?? 0.9)) / distancia)
        const ate = { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }
        virarSuave(vitima, rumoEntre(posVitima, de), 450)
        virarRPG(atacante, rumoEntre(de, posVitima), () => {
          if (!vigente()) return
          deslocarRPG(
            atacante,
            de,
            ate,
            () => {
              if (!vigente()) return
              pararRPG(atacante)
              const cor = materiaisPorFaccao[corAtacante].brilho.color
              estocarComLanca(atacante, vitima, vigente, {
                aoPerfurar: (ponta, rumo) => {
                  tocarSom('golpe:lanca')
                  tocarSom('lanca:perfura')
                  faisca(scene, ponta, 0xffffff, 0.4 * vitima.scale.x, 200)
                  anelDeImpacto(scene, ponta, rumo, cor, 0.22 * vitima.scale.x)
                  estouroDeRiscos(scene, ponta, 9, 0.14 * vitima.scale.x, cor)
                  respingos(scene, ponta, rumo, 0.009 * vitima.scale.x)
                  sensacao.linhasDeFoco(ponta, 260)
                  impacto()
                  comemorarAliadas()
                },
                aoPuxar: () => {
                  tocarSom('lanca:puxa')
                  // sem a lança segurando, o corpo desaba pra frente, pro lado do cavalo (que segura o tombo: cai ali)
                  sensacao.acompanharVoo(nocautear(
                    scene,
                    vitima,
                    {
                      direcao: { x: atacante.position.x - vitima.position.x, z: atacante.position.z - vitima.position.z },
                      forca: 0.3,
                      massaDeQuemBate: massaDaPeca('n'),
                      massaDaVitima: massaDaPeca(tipoVitima),
                      altura: 0.5,
                    },
                    piecesGroup.children,
                    vigente,
                    {
                      aoPousar: (onde, massa) => {
                        tocarSom(`queda:${tipoVitima}`)
                        animarImpacto(scene, onde.x, onde.z)
                        tremerTabuleiro(scene, 0.012 + 0.005 * massa, 200)
                      },
                      aoTerminar: () => {
                        removerVitima()
                        seguirParaDestino()
                      },
                    },
                  ))
                },
              })
            },
            true,
          )
        })
        return
      }

      // cavalo: salta até a casa e, ainda no ar, as patas da frente acertam o peito da vítima (que vira pra ele ao ver o
      // salto): a força do cavalo a joga longe, pela física das massas (nocaute.ts), e ele pousa na casa dela
      if (tipoAtacante === 'n' && ehRPG && pecaSaltaRPG(atacante)) {
        const de = { x: atacante.position.x, z: atacante.position.z }
        // o lance só termina com o cavalo pousado E a vítima já fora de cena — antes a vez passava
        // com ela ainda voando, e ficava uma peça a mais no tabuleiro até ela sumir
        let faltam = 2
        const umaParte = () => {
          if (!vigente()) return
          faltam--
          if (faltam === 0) {
            sincronizarPecas()
            terminar()
          }
        }
        const direcaoDoSalto = { x: posVitima.x - de.x, z: posVitima.z - de.z }
        virarSuave(vitima, rumoEntre(posVitima, de), 450)
        animarPosicaoRPG(
          atacante,
          de,
          squareToPosPeca(casaDestino),
          () => {
            if (!vigente()) return
            chegou(atacante, casaOrigem, casaDestino)
            umaParte()
          },
          undefined,
          {
            // a frente do cavalo (o peito e as patas dianteiras) encostando na frente da vítima
            distancia: 0.38 * atacante.scale.x + 0.1 * vitima.scale.x,
            aoAlcancar: () => {
              if (!vigente()) return
              tocarSom('golpe:n')
              tocarSom('voo:vitima')
              const rumo = new THREE.Vector3(direcaoDoSalto.x, 0, direcaoDoSalto.z).normalize()
              const peito = vitima.position.clone().add(new THREE.Vector3(0, 0.55 * vitima.scale.y, 0)).addScaledVector(rumo, -0.08 * vitima.scale.x)
              const praOndeVai = rumo.clone().setY(0.3).normalize()
              faisca(scene, peito, 0xffffff, 0.5 * vitima.scale.x)
              anelDeImpacto(scene, peito, praOndeVai, materiaisPorFaccao[corAtacante].brilho.color, 0.3 * vitima.scale.x, 260)
              animarImpacto(scene, posVitima.x, posVitima.z)
              impacto()
              const massaDaVitima = massaDaPeca(tipoVitima)
              sensacao.acompanharVoo(nocautear(
                scene,
                vitima,
                { direcao: direcaoDoSalto, forca: 1.9, massaDeQuemBate: massaDaPeca('n'), massaDaVitima, altura: 0.55 },
                piecesGroup.children,
                vigente,
                {
                  aoPousar: (onde, massa) => {
                    tocarSom(`queda:${tipoVitima}`)
                    animarImpacto(scene, onde.x, onde.z)
                    tremerTabuleiro(scene, 0.015 + 0.006 * massa, 220)
                  },
                  aoTerminar: () => {
                    removerVitima()
                    umaParte()
                  },
                },
              ))
              if (1.9 * Math.pow(massaDaPeca('n') / massaDaVitima, 0.35) > 1.2) sensacao.socoNaCamera(2.5, 280)
              comemorarAliadas()
            },
          },
        )
        return
      }

      // peão capturando peão: às vezes o derrotado se rende com a honra de um samurai — o vencedor
      // vai até ele com a katana guardada e se curva em respeito; o derrotado vira de frente pra
      // ele, ajoelha, faz uma reverência profunda e tomba pra frente, entre pétalas de cerejeira
      const acoesVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
      const acoesAtacante = atacante.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
      const derrotado = vitima
      const honra = () => {
        const vitima = derrotado
        novaSequenciaRPG(atacante)
        const de = { x: atacante.position.x, z: atacante.position.z }
        const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
        const parada = DISTANCIA_REVERENCIA * atacante.scale.x
        const fracao = Math.max(0, (distancia - parada) / distancia)
        const ate = { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }
        virarRPG(atacante, rumoEntre(de, posVitima), () =>
          deslocarRPG(atacante, de, ate, () => {
            pararRPG(atacante)
            tocarClipeRPGUmaVez(atacante, 'Reverencia', { entrada: 0.3, saida: 0.4 })
            novaSequenciaRPG(vitima)
            mostrarEspadaRPG(vitima, false)
            // quem luta de espada se despede com outro som: sino de capela e trompas, no lugar da flauta de bambu
            tocarSom(atacante.userData.arma === 'espada' ? 'honra:espada' : 'honra')
            animarPetalas(scene, vitima.position.clone(), 5200)
            virarRPG(vitima, rumoEntre(vitima.position, atacante.position), () =>
              tocarClipeRPGUmaVez(vitima, 'Sacrificio', {
                entrada: 0.3,
                voltarAoParado: false,
                aoTerminar: () => {
                  // caído, imóvel — some aos poucos, e o vencedor entra na casa
                  const definirOpacidade = prepararParaSumir(vitima)
                  const inicioSumir = performance.now()
                  const sumir = (agora: number) => {
                    const t = Math.min(1, (agora - inicioSumir) / 900)
                    definirOpacidade(1 - t)
                    if (t < 1) {
                      requestAnimationFrame(sumir)
                      return
                    }
                    removerVitima()
                    seguirParaDestino()
                  }
                  requestAnimationFrame(sumir)
                },
              }),
            )
          }),
        )
      }
      if (
        !habilidade &&
        tipoAtacante === 'p' &&
        vitima.userData.tipo === 'p' &&
        acoesVitima?.Sacrificio &&
        acoesAtacante?.Reverencia &&
        Math.random() < CHANCE_HONRA_SAMURAI
      ) {
        embainharAntes(atacante, () => vigente() && honra())
        return
      }

      // sorteia o estilo do golpe a cada captura, pra não ser sempre a mesma animação
      const estilo: EstiloAtaque = Math.random() < 0.5 ? 'corte' : 'derrubada'
      const senha = novaSequenciaRPG(atacante)
      // sem arma (toda peça começa assim), luta com o corpo: socos ou chute. O cavalo continua com as patas. Uma
      // habilidade equipada vem antes
      const semArma = ehRPG && tipoAtacante !== 'n' && armaDoAtacante === 'nenhuma' && !habilidade
      // com arma, rei, dama e bispo atacam à distância (cada arma com o seu poder); peão e torre vão até a
      // vítima e golpeiam com a arma
      const aDistancia = ehRPG && !semArma && (tipoAtacante === 'b' || tipoAtacante === 'q' || tipoAtacante === 'k')

      /** Vira pra vítima e vai até ficar a `alcance` dela; `depois` roda ao chegar. */
      const chegarPerto = (alcance: number, depois: () => void) => {
        const de = { x: atacante.position.x, z: atacante.position.z }
        const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
        virarRPG(atacante, rumoEntre(atacante.position, posVitima), () => {
          if (distancia <= alcance + 0.05) {
            depois()
            return
          }
          const fracao = (distancia - alcance) / distancia
          deslocarRPG(atacante, de, { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }, depois)
        })
      }

      // no instante em que o golpe acerta, a força joga a vítima (nocaute.ts: voa, gira, cai deitada e some) e as aliadas
      // por perto comemoram. `forca` 1 é um direto forte (a derrubada da espada passa disso, o corte fica abaixo);
      // `altura` é onde o golpe pega, de 0 (os pés) a 1 (a cabeça); `passoDepois`: quem bateu de perto dá um passo pra
      // trás depois do congelamento (a luta sem arma já tem o dela)
      const massaDeQuemBate = massaDaPeca(tipoAtacante)
      const massaDaVitima = massaDaPeca(tipoVitima)
      const acertar = (direcaoGolpe: { x: number; z: number }, forca = estilo === 'derrubada' ? 1.2 : 0.9, altura = 0.55, passoDepois = !aDistancia) => {
        animarImpacto(scene, posVitima.x, posVitima.z)
        faisca(scene, vitima.position.clone().add(new THREE.Vector3(0, altura * 0.85 * vitima.scale.y, 0)), 0xffffff, 0.5 * vitima.scale.x)
        // o corpo congela no instante do acerto, já na pose da pancada, e sai voando quando o tempo volta
        const ms = impacto()
        sensacao.acompanharVoo(nocautear(scene, vitima, { direcao: direcaoGolpe, forca, massaDeQuemBate, massaDaVitima, altura }, piecesGroup.children, vigente, {
          aoPousar: (onde, massa) => {
            tocarSom(`queda:${tipoVitima}`)
            animarImpacto(scene, onde.x, onde.z)
            tremerTabuleiro(scene, 0.015 + 0.006 * massa, 220)
          },
          aoTerminar: () => {
            removerVitima()
            seguirParaDestino()
          },
        }))
        if (passoDepois) depoisDoCongelamento(ms, () => vigente() && continuarDoGolpe(atacante, direcaoGolpe))
        // o golpe que arremessa longe: a câmera sente
        if (forca * Math.pow(massaDeQuemBate / massaDaVitima, 0.35) > 1.2) sensacao.socoNaCamera(2.5, 280)
        comemorarAliadas()
      }

      // a habilidade especial de quem equipou (o servidor só deixa equipar quem comprou; ver src/conta/habilidades.ts e
      // combate/habilidades.ts): a de longe não vai até a vítima, só vira pra ela; a de perto vai, como o golpe de sempre
      const comHabilidade = (): CapturaComHabilidade => ({
        cena: scene,
        atacante,
        vitima,
        corAtacante,
        posVitima,
        senha,
        vigente,
        fim: () => {
          removerVitima()
          seguirParaDestino()
        },
        comemorarAliadas,
        sentirImpacto: impacto,
        sensacao,
      })
      // as habilidades que não usam a katana (as de longe e as de mãos livres) e os socos começam com ela na bainha
      if (habilidade && HABILIDADES[habilidade].alcance === 'aDistancia') {
        voltarAoDescanso(atacante)
        embainharAntes(atacante, () =>
          vigente() &&
          virarRPG(atacante, rumoEntre(atacante.position, posVitima), () => {
            if (!vigente()) return
            pararRPG(atacante)
            CAPTURAS[habilidade](comHabilidade())
          }),
        )
        return
      }

      // a habilidade de mãos livres (a Dempsey Roll, o Espiral Absoluto): vai até a vítima sem sacar a arma, no alcance dos socos
      if (habilidade && HABILIDADES[habilidade].maosLivres) {
        voltarAoDescanso(atacante)
        embainharAntes(atacante, () =>
          vigente() &&
          chegarPerto(distanciaDaLuta('socos', atacante, vitima), () => {
            if (!vigente()) return
            pararRPG(atacante)
            antecipar(atacante, { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }, () => CAPTURAS[habilidade](comHabilidade()))
          }),
        )
        return
      }

      if (semArma) {
        const golpe: GolpeSemArma = sortearGolpeSemArma()
        voltarAoDescanso(atacante)
        // só outro jogo entrando no meio para a luta: um gesto que cai na peça não pode deixar a captura sem fim
        embainharAntes(atacante, () => vigente() && chegarPerto(distanciaDaLuta(golpe, atacante, vitima), () => {
          if (!vigente()) return
          pararRPG(atacante)
          const direcaoGolpe = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
          // o corpo recua um palmo antes do golpe
          antecipar(atacante, direcaoGolpe, () => lutarSemArma(atacante, vitima, golpe, vigente, {
            antes: () => {
              tocarSom(golpe === 'socos' ? 'soco:jab' : 'chute:ar')
              if (golpe !== 'socos') return
              // o jab pega no queixo: a cabeça vai pra trás e a vítima recua meio passo, tonta (não cai ainda)
              sacudir(vitima, direcaoGolpe, 1)
              faisca(scene, vitima.position.clone().add(new THREE.Vector3(0, 0.6 * vitima.scale.y, 0)), 0xffffff, 0.3 * vitima.scale.x, 180)
              congelar(35)
            },
            aoAcertar: () => {
              tocarSom(golpe === 'socos' ? 'soco' : 'chute')
              // o direto no queixo; o chute na barriga, mais forte, dobra o corpo
              acertar(direcaoGolpe, golpe === 'chute' ? 1.3 : 1.05, golpe === 'chute' ? 0.42 : 0.6, false)
            },
          }))
        }))
        return
      }

      const golpear = () => {
        // a habilidade de perto: o atacante já chegou na vítima com a arma na mão
        if (habilidade) {
          CAPTURAS[habilidade](comHabilidade())
          return
        }
        // a torre só bate de marreta (ou machado, ou maça) se tiver uma na mão; sem arma, golpeia como as outras
        if (tipoAtacante === 'r' && ehRPG && ARMAS_DA_TORRE.includes(atacante.userData.arma as string)) {
          pararRPG(atacante)
          tocarSom('marreta:ergue')
          const armaDaTorre = atacante.userData.arma as string
          const continua = () => vigente() && sequenciaRPGValida(atacante, senha)
          const fim = () => {
            removerVitima()
            seguirParaDestino()
          }
          if (armaDaTorre === 'machado') {
            // o machado corta a peça ao meio
            baterComMarreta(atacante, corAtacante, continua, () => {
              tocarSom('machado:corte')
              animarImpacto(scene, posVitima.x, posVitima.z)
              rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z, 0.9, 1300)
              tremerTabuleiro(scene, 0.06, 300)
              const direcaoDoCorte = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
              depoisDoCongelamento(impacto(1, false), () => {
                if (vigente()) cortarAoMeio(scene, vitima, direcaoDoCorte, fim)
              })
              comemorarAliadas()
            })
            return
          }
          if (armaDaTorre === 'maca') {
            // a maça: a peça fica presa nos espinhos pelo peito, a torre sacode e ela cai no tabuleiro. No cavalo, a
            // maça pega o cavaleiro, e o cavalo, solto, foge a galope pra fora do tabuleiro
            const acoesDaVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
            const galope = vitima.userData.tipo === 'n' ? acoesDaVitima?.Walk?.getClip() : undefined
            const maca = baterComMarreta(
              atacante,
              corAtacante,
              continua,
              () => {
                tocarSom('maca:espinhos')
                tocarSom('maca:sacode', (MACA_ERGUIDA_ATE_MS - MARRETA_PANCADA_MS) / 1000)
                animarImpacto(scene, posVitima.x, posVitima.z)
                tremerTabuleiro(scene, 0.08, 360)
                if (galope) {
                  tocarSom('fuga:n')
                  soltarOCavalo(scene, vitima, atacante.position, galope)
                }
                if (acoesDaVitima?.Morte) {
                  novaSequenciaRPG(vitima)
                  mostrarEspadaRPG(vitima, false)
                  tocarClipeRPGUmaVez(vitima, 'Morte', { entrada: 0.1, voltarAoParado: false })
                }
                // presa nos espinhos: vai junto com a cabeça da maça
                prenderPeloPeito(maca, vitima, atacante)
                impacto(1, false)
                comemorarAliadas()
              },
              () => {
                tocarSom('maca:solta')
                soltarDaMaca(maca)
                cairDaMaca(piecesGroup, vitima, fim)
              },
              pancadaNoPeito(atacante, vitima),
            )
            return
          }
          baterComMarreta(atacante, corAtacante, continua, () => {
            tocarSom('marreta:impacto')
            tocarSom('esmagado', 0.05)
            animarImpacto(scene, posVitima.x, posVitima.z)
            ondaDaMarretada(scene, posVitima.x, posVitima.z, materiaisPorFaccao[corAtacante].detalhe.color)
            // rachaduras de verdade na madeira e o tabuleiro inteiro tremendo
            rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z)
            poeiraDaPancada(scene, posVitima.x, posVitima.z)
            tremerTabuleiro(scene)
            depoisDoCongelamento(impacto(1, false), () => {
              if (vigente()) esmagarPeca(vitima, fim)
            })
            comemorarAliadas()
          })
          return
        }
        const direcaoGolpe = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
        const alvo = vitima.position.clone().add(new THREE.Vector3(0, 0.45 * vitima.scale.y, 0))
        const corPoder = materiaisPorFaccao[corAtacante].brilho.color
        const acerto = () => acertar(direcaoGolpe)
        // o poder sai no instante do golpe; o acerto (a queda da vítima) só quando ele chega nela
        const armaAtacante = atacante.userData.arma as string | undefined
        const fimDoPoder = () => {
          removerVitima()
          seguirParaDestino()
        }
        const noGolpe = () => {
          if (!aDistancia) {
            tocarSom(`golpe:${tipoAtacante}`)
            acerto()
          } else if (armaAtacante === 'cajado') {
            // o raio, como era o da rainha, saindo da mão do cajado
            tocarSom('raio:q')
            lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto, tipoAtacante === 'b' ? 'LeftHand' : 'RightHand')
          } else if (armaAtacante === 'cristal') {
            convocarCristal(scene, vitima, atacante.position.clone(), corPoder, () => tocarSom('cristal:convoca'), () => {
              tocarSom('cristal:quebra')
              acerto()
            })
          } else if (armaAtacante === 'cetro') {
            tocarSom('gravidade')
            afundarPelaGravidade(scene, vitima, corPoder, fimDoPoder)
            comemorarAliadas()
          } else if (armaAtacante === 'lua') {
            tocarSom('tornado')
            tornadoDaLua(scene, vitima, direcaoGolpe, corPoder, fimDoPoder)
            comemorarAliadas()
          } else if (tipoAtacante === 'b') {
            tocarSom('magia:b')
            lancarPoderDoBispo(scene, atacante, alvo, corPoder, () => {
              tocarSom('explosao:b')
              acerto()
            })
          } else if (tipoAtacante === 'q') {
            tocarSom('raio:q')
            lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto)
          } else {
            tocarSom('onda:k')
            lancarOndaDoRei(scene, atacante, alvo, materialCoroa.color, acerto)
          }
        }
        tocarGolpeRPG(atacante)
        animarAtaqueEspada(atacante, direcaoGolpe, estilo, noGolpe, () => {
          if (sequenciaRPGValida(atacante, senha)) guardarEspadaRPG(atacante, senha)
        })
      }
      // o peão RPG desembainha a espada primeiro (e vai até a vítima com ela na mão), golpeia e
      // guarda de volta — a espada entra na bainha antes de a vítima terminar de sumir
      // o som do saque cai no instante em que a lâmina deixa a bainha: o da katana, agudo; o da espada, mais grave
      const espadaDoPeao = atacante.userData.espadaRPG as EspadaRPG | undefined
      const armaDoPeao = atacante.userData.arma as string | undefined
      if (espadaDoPeao && !espadaDoPeao.fora && (armaDoPeao === 'katana' || armaDoPeao === 'espada')) {
        tocarSom(armaDoPeao === 'katana' ? 'katana:saca' : 'espada:saca', espadaDoPeao.segundoSaque)
      }
      sacarEspadaRPG(atacante, senha, () => {
        if (!ehRPG) {
          golpear()
          return
        }
        if (aDistancia) {
          virarRPG(atacante, rumoEntre(atacante.position, posVitima), golpear)
          return
        }
        // corpo a corpo: vira, vai até a vítima (para no alcance do golpe) e golpeia. A maça alcança mais longe: o cabo
        // e a bola inteiros ficam entre a torre e a vítima
        const comMaca = tipoAtacante === 'r' && armaDoAtacante === 'maca'
        chegarPerto(comMaca ? alcanceDaMaca(atacante, vitima) : (ALCANCE_GOLPE[tipoAtacante] ?? 0.55) * atacante.scale.x, () =>
          // o corpo recua um palmo antes do golpe
          antecipar(atacante, { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }, golpear),
        )
      })
      return
    }

    if (vitima) removerSemAnimacao(vitima)
    // o passo de sempre: a katana que ficou na mão volta pra bainha antes
    if (meshMovendo) embainharAntes(meshMovendo, () => vigente() && seguirParaDestino())
    else seguirParaDestino()

    function removerSemAnimacao(mesh: THREE.Group) {
      piecesGroup.remove(mesh)
      if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === mesh) pieceMeshBySquare.delete(casaDaVitima)
    }
  }

  return executarLanceComAnimacao
}
