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
import { faisca, rastroDeBrilho } from './efeitosDeAnime'
import { dempseyRoll } from './dempseyRoll'
import { nocautear } from './nocaute'
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
   * captura, `tremer` falso quando a habilidade tem o tremor dela. Devolve os ms do congelamento. */
  sentirImpacto: (fator?: number, tremer?: boolean) => number
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
      tocarSom('marreta:impacto')
      tocarSom('esmagado', 0.05)
      impactoDeAnime(c, meio)
      animarImpacto(c.cena, meio.x, meio.z)
      ondaDaMarretada(c.cena, meio.x, meio.z, cor)
      // rentes ao tampo: no buraco aparece o fundo da cratera, não as rachaduras por cima dele
      rachadurasNoTabuleiro(c.cena, meio.x, meio.z, 1.1 + 0.09 * massa, 2200, 0.001)
      poeiraDaPancada(c.cena, meio.x, meio.z)
      tremerTabuleiro(c.cena, 0.1 + 0.013 * massa)
      const ms = c.sentirImpacto(1, false)
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
    aoGancho: (numero, queixo) => {
      tocarSom('dempsey:gancho', 0, 1 + 0.05 * numero)
      if (numero % 2 === 1) tocarSom(`dor:${tipoVitima}`, 0.03)
      faisca(c.cena, queixo, 0xffffff, 0.32 * c.vitima.scale.x, 170)
      congelar(22 + 4 * numero)
    },
    aoParar: (queixo) => impulsoDeAnime(c, queixo, 0.8),
    aoCarregar: (punho) => brilhoDeAnime(c, punho, 0.45),
    aoGolpeFinal: (queixo, direcao) => {
      tocarSom('dempsey:final')
      impactoDeAnime(c, queixo)
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

/** A captura de cada habilidade, pelo nome dela no catálogo. */
export const CAPTURAS: Record<string, (c: CapturaComHabilidade) => void> = { retalhamento: retalhar, puxao: puxar, dempsey }

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
