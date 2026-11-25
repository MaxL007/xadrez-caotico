import * as THREE from 'three'
import { habilidadesDoCatalogo, HABILIDADES, textoDoNome, textoDoQueFaz } from '../../conta/habilidades'
import { NA_LOJA } from '../../conta/personalizacao'
import { tocarSom } from '../../som/sons'
import { existeTexto } from '../../textos/idiomas'
import { materiaisPorFaccao } from '../pecas/materiais'
import { clipesRPGComPrefixo, guardarEspadaRPG, mostrarEspadaRPG, novaSequenciaRPG, sequenciaRPGValida, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'
import { emblemaDaHabilidade } from '../pecas/emblemas'
import { depoisDoCongelamento, type SensacaoDaPartida } from '../sensacao/golpeQuePesa'
import { despedacar, rachadurasNoTabuleiro, rastroDeCorte, tremerTabuleiro } from './efeitosDasArmas'
import { massaDaPeca } from '../sensacao/realismo'
import { abrirCratera, afundarNaCratera } from './cratera'
import { anelDeImpacto, estouroDeRiscos, faisca, rastroDeBrilho, respingos } from './efeitosDeAnime'
import { dempseyRoll } from './dempseyRoll'
import { empurraoUniversal } from './empurraoUniversal'
import { espiralAbsoluto } from './espiralAbsoluto'
import { nocautear, sacudir } from './nocaute'
import { congelar } from '../sensacao/relogioDoJogo'
import { animarImpacto } from './golpes'
import { ondaDaMarretada, poeiraDaPancada } from './marreta'
import { puxaoUniversal } from './puxaoUniversal'

// A animação de cada habilidade especial na captura. O lance animado acha a habilidade de quem captura (equipada,
// comprada, com a arma certa na mão) e entrega aqui tudo o que a cena oferece; a habilidade chama `fim` quando a
// vítima já saiu do tabuleiro, e o atacante segue pra casa. O que cada uma é (peça, alcance, arma) fica em
// src/conta/habilidades.ts.

export interface CapturaComHabilidade {
  cena: THREE.Object3D
  atacante: THREE.Group
  vitima: THREE.Group
  corAtacante: 'w' | 'b'
  /** Onde a vítima estava no começo da captura. */
  posVitima: { x: number; z: number }
  /** A sequência de animação do atacante (o golpe para se outra começar). */
  senha: number
  /** Falso quando outro lance entrou no meio (novo jogo, outra partida): a habilidade larga tudo. */
  vigente: () => boolean
  /** A vítima saiu do tabuleiro: tira ela do mapa e leva o atacante até a casa. */
  fim: () => void
  comemorarAliadas: () => void
  /** O golpe acertou ("o golpe que pesa"): congela um instante, treme e solta as vozes; `fator` multiplica o peso da
   * captura, `tremer` falso quando a habilidade tem o tremor dela, `grunhido` falso quando quem ataca não grunhe (o
   * som da habilidade fala por ela). Devolve os ms do congelamento. */
  sentirImpacto: (fator?: number, tremer?: boolean, grunhido?: boolean) => number
  /** A câmera, o som e os efeitos de tela da partida (as linhas de foco, o quadro de impacto, o soco da câmera). */
  sensacao: SensacaoDaPartida
}

// --- o padrão de anime de toda habilidade (pedido do usuário: seguir um padrão) ---------------------------------------
// 1. o começo: o brilho de anime ("tiin") num ponto de quem ataca (os olhos, a palma, a lâmina);
// 2. o impulso, quando o golpe sai: o estalo, as linhas de foco e a câmera fechando um pouco;
// 3. o golpe que decide: o quadro de impacto (a tela em negativo), as linhas de foco, a faísca e a câmera abrindo.
// No meio, cada habilidade tem o que é dela; os efeitos ficam em efeitosDeAnime.ts e na SensacaoDaPartida.

const corDoBrilho = (c: CapturaComHabilidade) => materiaisPorFaccao[c.corAtacante].brilho.color

/** 1. O brilho de anime no começo. */
function brilhoDeAnime(c: CapturaComHabilidade, ponto: THREE.Vector3, tamanho = 0.32) {
  tocarSom('anime:brilho')
  faisca(c.cena, ponto, corDoBrilho(c), tamanho * c.atacante.scale.x, 300)
}

/** 2. O impulso: o golpe saindo. */
function impulsoDeAnime(c: CapturaComHabilidade, ponto: THREE.Vector3, tom = 1) {
  tocarSom('anime:estala', 0, tom)
  c.sensacao.linhasDeFoco(ponto, 220)
  c.sensacao.socoNaCamera(-4, 300)
}

/** 3. O golpe que decide. */
function impactoDeAnime(c: CapturaComHabilidade, ponto: THREE.Vector3) {
  c.sensacao.quadroDeImpacto(90)
  c.sensacao.linhasDeFoco(ponto, 320)
  c.sensacao.socoNaCamera(5, 420)
  faisca(c.cena, ponto, 0xffffff, 0.7 * c.vitima.scale.x, 260)
}

/** O meio do corpo de uma peça (no tamanho dela). */
const meioDo = (peca: THREE.Object3D, altura = 0.45) => peca.position.clone().add(new THREE.Vector3(0, altura * peca.scale.y, 0))

/** O retalhamento (peão de katana): o brilho na lâmina e um instante parado, uma série de cortes rápidos (cada um com o
 * rastro e a faísca) e, com a katana já na bainha, o golpe que decide: a peça se desfaz em pedaços. */
function retalhar(c: CapturaComHabilidade) {
  const cortes = 4
  let feitos = 0
  const corDoCorte = corDoBrilho(c)
  const proximo = () => {
    if (!c.vigente() || !sequenciaRPGValida(c.atacante, c.senha)) return
    if (feitos === cortes) {
      tocarSom('retalho:pedacos')
      impactoDeAnime(c, meioDo(c.vitima))
      const ms = c.sentirImpacto(1, true)
      depoisDoCongelamento(ms, () => {
        if (!c.vigente()) return
        despedacar(c.cena, c.vitima, c.fim)
      })
      c.comemorarAliadas()
      guardarEspadaRPG(c.atacante, c.senha)
      return
    }
    feitos++
    if (feitos === 1) impulsoDeAnime(c, meioDo(c.vitima))
    const golpes = clipesRPGComPrefixo(c.atacante, 'Attack')
    const tocou = golpes.length > 0 && tocarClipeRPGUmaVez(c.atacante, golpes[(feitos - 1) % golpes.length], { entrada: 0.06, voltarAoParado: false, velocidade: 2.3, aoTerminar: proximo })
    window.setTimeout(() => {
      if (!c.vigente()) return
      tocarSom('retalho:corte')
      rastroDeCorte(c.cena, c.vitima, corDoCorte)
      // a reação a cada corte: recua e cambaleia, um corte pra cada lado
      const rumo = Math.atan2(c.posVitima.x - c.atacante.position.x, c.posVitima.z - c.atacante.position.z) + (feitos % 2 === 0 ? 0.6 : -0.6)
      sacudir(c.vitima, { x: Math.sin(rumo), z: Math.cos(rumo) }, 0.9)
      faisca(c.cena, meioDo(c.vitima, 0.35 + 0.1 * feitos), corDoCorte, 0.35 * c.vitima.scale.x, 160)
    }, 170)
    if (!tocou) window.setTimeout(proximo, 300)
  }
  // o brilho na lâmina e o instante parado antes de o primeiro corte sair
  const lamina = c.atacante.getObjectByName('EspadaLamina')
  brilhoDeAnime(c, lamina ? lamina.getWorldPosition(new THREE.Vector3()) : meioDo(c.atacante, 0.62))
  window.setTimeout(proximo, 220)
}

/** O Puxão Universal (rainha), na mecânica do anime: a base de luta, o brilho e o impulso da mão; a peça vem voando até a
 * cabeça travar na mão, gira na hélice, para no alto e é batida no chão de costas. O chão racha e cede numa cratera do
 * tamanho do peso dela, e a peça, achatada deitada de peito pra cima, afunda até sumir (ver puxaoUniversal.ts,
 * cratera.ts e efeitosDeAnime.ts). */
function puxar(c: CapturaComHabilidade) {
  novaSequenciaRPG(c.vitima)
  mostrarEspadaRPG(c.vitima, false)
  tocarSom('puxao:chama')
  const cor = corDoBrilho(c)
  const tamanho = c.atacante.scale.x
  puxaoUniversal(c.atacante, c.vitima, c.cena, cor, c.vigente, {
    aoBrilhar: (mao) => brilhoDeAnime(c, mao),
    aoEmpurrar: (mao) => impulsoDeAnime(c, mao),
    aoPuxar: () => tocarSom('puxao:arrasta'),
    aoAgarrar: (mao) => {
      tocarSom('puxao:agarra')
      faisca(c.cena, mao, cor, 0.6 * tamanho)
    },
    aoGirar: () => tocarSom('puxao:gira'),
    aoBaixar: () => tocarSom('anime:estala', 0, 0.75),
    aoEsmagar: ({ meio, rumo, comprimento, meiaGrossura }) => {
      // a pancada pesa o que a peça pesa: rachaduras, tremor e cratera crescem com a massa dela
      const massa = massaDaPeca(c.vitima.userData.tipo)
      // o som que manda é o do Puxão (pedido do usuário): a pancada é dele, e a vítima geme uma vez só (o gemido sai do
      // sentirImpacto; sem o esmagado e sem o grunhido da rainha, que pareciam a vítima de novo)
      tocarSom('puxao:esmaga')
      impactoDeAnime(c, meio)
      animarImpacto(c.cena, meio.x, meio.z)
      ondaDaMarretada(c.cena, meio.x, meio.z, cor)
      // rentes ao tampo: no buraco aparece o fundo da cratera, não as rachaduras por cima dele
      rachadurasNoTabuleiro(c.cena, meio.x, meio.z, 1.1 + 0.09 * massa, 2200, 0.001)
      poeiraDaPancada(c.cena, meio.x, meio.z)
      tremerTabuleiro(c.cena, 0.1 + 0.013 * massa)
      const ms = c.sentirImpacto(1, false, false)
      depoisDoCongelamento(ms, () => {
        if (!c.vigente()) return
        // o chão cede, a peça achata deitada e afunda; o lance segue quando o chão já voltou (a rainha anda por cima)
        const cratera = abrirCratera(c.cena, c.vitima, meio, rumo, comprimento, massa)
        afundarNaCratera(c.vitima, cratera, meio, meiaGrossura, () => {
          window.setTimeout(() => cratera.fechar(() => c.vigente() && c.fim()), 220)
        })
      })
      c.comemorarAliadas()
    },
  })
}

/** A Dempsey Roll (peão, com os punhos): o brilho nos olhos na guarda, o oito com o rastro de luz e os ganchos (cada um
 * mais agudo, com faísca e um tranco curto), a parada brusca, a carga e o gancho final, que arremessa a vítima pela
 * força (ver dempseyRoll.ts e nocaute.ts). */
function dempsey(c: CapturaComHabilidade) {
  const cor = corDoBrilho(c)
  const tamanho = c.atacante.scale.x
  const tipoVitima = String(c.vitima.userData.tipo ?? 'p')
  dempseyRoll(c.atacante, c.vitima, c.vigente, {
    aoEntrar: (olhos) => brilhoDeAnime(c, olhos, 0.28),
    aoBalancar: () => tocarSom('dempsey:balanco'),
    // o rastro do oito: a cor da facção forte e mais demorado, pra ficar o desenho do ∞ no ar
    aoRolar: (cabeca) => rastroDeBrilho(c.cena, cabeca, cor, 0.3 * tamanho, 380),
    // o aquecimento acabou: o estalo e as linhas de foco marcam o começo dos ganchos
    aoComecarOsGanchos: (queixo) => impulsoDeAnime(c, queixo),
    aoGancho: (numero, queixo, direcao) => {
      tocarSom('dempsey:gancho', 0, 1 + 0.05 * numero)
      if (numero % 2 === 1) tocarSom(`dor:${tipoVitima}`, 0.03)
      // o impacto na cabeça: a faísca, o anel abrindo, o estouro de riscos e os respingos voando pra onde a cabeça vai
      const tamanhoDaVitima = c.vitima.scale.x
      faisca(c.cena, queixo, 0xffffff, 0.36 * tamanhoDaVitima, 170)
      anelDeImpacto(c.cena, queixo, direcao, cor, 0.2 * tamanhoDaVitima)
      estouroDeRiscos(c.cena, queixo, 7, 0.12 * tamanhoDaVitima, cor)
      respingos(c.cena, queixo, direcao, 0.008 * tamanhoDaVitima)
      c.sensacao.socoNaCamera(-1.2, 160)
      congelar(26 + 4 * numero)
    },
    aoParar: (queixo) => impulsoDeAnime(c, queixo, 0.8),
    aoCarregar: (punho) => brilhoDeAnime(c, punho, 0.45),
    aoGolpeFinal: (queixo, direcao) => {
      tocarSom('dempsey:final')
      impactoDeAnime(c, queixo)
      const praOndeVai = new THREE.Vector3(direcao.x, 0.35, direcao.z).normalize()
      anelDeImpacto(c.cena, queixo, praOndeVai, cor, 0.42 * c.vitima.scale.x, 300)
      estouroDeRiscos(c.cena, queixo, 12, 0.2 * c.vitima.scale.x, cor, 240)
      respingos(c.cena, queixo, praOndeVai, 0.011 * c.vitima.scale.x, 520)
      c.sentirImpacto(1.3, true)
      nocautear(
        c.cena,
        c.vitima,
        { direcao, forca: 2.2, massaDeQuemBate: massaDaPeca(c.atacante.userData.tipo), massaDaVitima: massaDaPeca(tipoVitima), altura: 0.65 },
        c.vitima.parent?.children ?? [],
        c.vigente,
        {
          aoPousar: (onde, massa) => {
            tocarSom(`queda:${tipoVitima}`)
            animarImpacto(c.cena, onde.x, onde.z)
            tremerTabuleiro(c.cena, 0.015 + 0.006 * massa, 220)
          },
          aoTerminar: c.fim,
        },
      )
      c.comemorarAliadas()
    },
  })
}

/** O Empurrão Universal (rainha, com as mãos; a ideia e o símbolo são do usuário): ela vai até a peça e, as duas no
 * mesmo lugar, recolhe as palmas e carrega a bolha de vento, que nasce entre elas e cresce até cobrir o corpo inteiro
 * dela, uma barreira que nada atravessa (o brilho, o ar sugado, as correntes de vento, a vítima empurrada pela parede);
 * as palmas saem de uma vez e a bolha se expande como uma onda (o impulso, a onda no chão e a poeira em volta da
 * rainha); a parede passa pela vítima (o golpe que decide) e ela voa alto, por cima de tudo, pra fora do tabuleiro (ver
 * empurraoUniversal.ts e nocaute.ts). */
function empurrar(c: CapturaComHabilidade) {
  const cor = corDoBrilho(c)
  const tipoVitima = String(c.vitima.userData.tipo ?? 'p')
  novaSequenciaRPG(c.vitima)
  mostrarEspadaRPG(c.vitima, false)
  empurraoUniversal(c.atacante, c.vitima, c.cena, cor, c.vigente, {
    aoBrilhar: (palmas) => brilhoDeAnime(c, palmas, 0.4),
    aoCarregar: () => tocarSom('empurrao:carrega'),
    aoEmpurrar: (palmas, centro) => {
      tocarSom('empurrao:solta')
      impulsoDeAnime(c, palmas)
      // a onda saindo da rainha pra todo lado: no chão e na poeira em volta dela
      ondaDaMarretada(c.cena, centro.x, centro.z, cor)
      poeiraDaPancada(c.cena, centro.x, centro.z)
      tremerTabuleiro(c.cena, 0.05, 260)
    },
    aoEstourar: (ponto) => {
      tocarSom('empurrao:estouro')
      impactoDeAnime(c, ponto)
      const direcao = { x: c.posVitima.x - c.atacante.position.x, z: c.posVitima.z - c.atacante.position.z }
      const praOndeVai = new THREE.Vector3(direcao.x, 0, direcao.z).normalize().setY(0.45).normalize()
      const tamanho = c.vitima.scale.x
      anelDeImpacto(c.cena, ponto, praOndeVai, cor, 0.5 * tamanho, 320)
      estouroDeRiscos(c.cena, ponto, 14, 0.24 * tamanho, cor, 260)
      c.sentirImpacto(1.2, false)
      nocautear(
        c.cena,
        c.vitima,
        { direcao, forca: 2.5, massaDeQuemBate: massaDaPeca('q'), massaDaVitima: massaDaPeca(tipoVitima), altura: 0.5, foraDoTabuleiro: true },
        [],
        c.vigente,
        {
          aoPousar: (onde, massa) => {
            tocarSom(`queda:${tipoVitima}`)
            animarImpacto(c.cena, onde.x, onde.z)
            tremerTabuleiro(c.cena, 0.01 + 0.004 * massa, 200)
          },
          aoTerminar: c.fim,
        },
      )
      c.comemorarAliadas()
    },
  })
}

/** O Espiral Absoluto (peão, com ou sem arma; a ideia e a descrição são do usuário): o pé acende, o chute pra cima no
 * queixo joga a vítima bem alto, o peão pula atrás e a agarra, os dois caem girando numa espiral e, perto do chão, o
 * peão solta e cai meio agachado enquanto a vítima bate de costas no chão, que cede numa cratera (ver
 * espiralAbsoluto.ts e cratera.ts). */
function espiral(c: CapturaComHabilidade) {
  const cor = corDoBrilho(c)
  const tamanho = c.vitima.scale.x
  const tipoVitima = String(c.vitima.userData.tipo ?? 'p')
  espiralAbsoluto(c.atacante, c.vitima, c.cena, c.vigente, {
    aoBrilhar: (pe) => brilhoDeAnime(c, pe, 0.3),
    aoChutar: (queixo, direcao) => {
      tocarSom('espiral:chute')
      tocarSom(`dor:${tipoVitima}`, 0.04)
      impulsoDeAnime(c, queixo)
      faisca(c.cena, queixo, 0xffffff, 0.4 * tamanho, 180)
      anelDeImpacto(c.cena, queixo, direcao, cor, 0.3 * tamanho, 260)
      estouroDeRiscos(c.cena, queixo, 9, 0.16 * tamanho, cor, 220)
      respingos(c.cena, queixo, direcao, 0.009 * tamanho)
      congelar(45)
    },
    aoSaltar: (pes) => {
      tocarSom('espiral:salta')
      poeiraDaPancada(c.cena, pes.x, pes.z)
    },
    aoAgarrar: (ponto) => {
      tocarSom('espiral:agarra')
      faisca(c.cena, ponto, cor, 0.45 * c.atacante.scale.x, 200)
    },
    aoComecarAEspiral: (ponto) => impulsoDeAnime(c, ponto, 0.85),
    aoGirar: (volta) => tocarSom('espiral:gira', 0, 1 + 0.04 * volta),
    // o rastro da espiral: a cor da facção, demorado, pra ficar o desenho do caminho no ar
    aoRastro: (ponto) => rastroDeBrilho(c.cena, ponto, cor, 0.26 * tamanho, 420),
    aoSoltar: () => tocarSom('anime:estala', 0, 0.75),
    aoColidir: ({ meio, rumo, comprimento, meiaGrossura }) => {
      // a pancada pesa o que a peça pesa, como no Puxão: rachaduras, tremor e cratera crescem com a massa dela
      const massa = massaDaPeca(tipoVitima)
      tocarSom('espiral:colide')
      impactoDeAnime(c, meio.clone().setY(0.1))
      animarImpacto(c.cena, meio.x, meio.z)
      ondaDaMarretada(c.cena, meio.x, meio.z, cor)
      rachadurasNoTabuleiro(c.cena, meio.x, meio.z, 1.1 + 0.09 * massa, 2200, 0.001)
      poeiraDaPancada(c.cena, meio.x, meio.z)
      tremerTabuleiro(c.cena, 0.1 + 0.013 * massa)
      const ms = c.sentirImpacto(1.3, false)
      depoisDoCongelamento(ms, () => {
        if (!c.vigente()) return
        const cratera = abrirCratera(c.cena, c.vitima, meio, rumo, comprimento, massa)
        afundarNaCratera(c.vitima, cratera, meio, meiaGrossura, () => {
          window.setTimeout(() => cratera.fechar(() => c.vigente() && c.fim()), 220)
        })
      })
      c.comemorarAliadas()
    },
    aoPousar: (onde) => {
      tocarSom('espiral:pouso')
      poeiraDaPancada(c.cena, onde.x, onde.z)
    },
  })
}

/** A captura de cada habilidade, pelo nome dela no catálogo. */
export const CAPTURAS: Record<string, (c: CapturaComHabilidade) => void> = { retalhamento: retalhar, puxao: puxar, dempsey, empurrao: empurrar, espiral }

/** O que falta em cada habilidade do catálogo: o cadastro, a peça certa, a animação, o símbolo, o preço na Loja e os
 * textos nos três idiomas. Vazio quando está tudo certo (o teste das armas confere). */
export function habilidadesIncompletas(): string[] {
  const faltas: string[] = []
  for (const { peca, id } of habilidadesDoCatalogo()) {
    const dados = HABILIDADES[id]
    if (!dados) faltas.push(`${id}: sem cadastro em src/conta/habilidades.ts`)
    else if (dados.peca !== peca) faltas.push(`${id}: o cadastro diz peça ${dados.peca}, o catálogo ${peca}`)
    if (!CAPTURAS[id]) faltas.push(`${id}: sem a captura em src/tabuleiro/combate/habilidades.ts`)
    if (!emblemaDaHabilidade(id)) faltas.push(`${id}: sem símbolo em src/tabuleiro/pecas/emblemas.ts`)
    if (NA_LOJA[peca]?.[`golpe:${id}`] === undefined) faltas.push(`${id}: sem preço na Loja (catálogo, loja.${peca})`)
    for (const chave of [textoDoNome(id), textoDoQueFaz(id)]) if (!existeTexto(chave)) faltas.push(`${id}: falta o texto ${chave}`)
  }
  return faltas
}
