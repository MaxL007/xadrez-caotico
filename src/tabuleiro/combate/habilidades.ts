import * as THREE from 'three'
import { habilidadesDoCatalogo, HABILIDADES, textoDoNome, textoDoQueFaz } from '../../conta/habilidades'
import { NA_LOJA } from '../../conta/personalizacao'
import { tocarSom } from '../../som/sons'
import { existeTexto } from '../../textos/idiomas'
import { materiaisPorFaccao } from '../pecas/materiais'
import { clipesRPGComPrefixo, guardarEspadaRPG, mostrarEspadaRPG, novaSequenciaRPG, sequenciaRPGValida, tocarClipeRPGUmaVez } from '../pecas/modelosRPG'
import { emblemaDaHabilidade } from '../pecas/emblemas'
import { depoisDoCongelamento } from '../sensacao/golpeQuePesa'
import { despedacar, rachadurasNoTabuleiro, rastroDeCorte, tremerTabuleiro } from './efeitosDasArmas'
import { animarImpacto } from './golpes'
import { esmagarPeca, ondaDaMarretada, poeiraDaPancada } from './marreta'
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
}

/** O retalhamento (peão de katana): uma série de cortes rápidos, cada um com o rastro, e a peça se desfaz em pedaços. */
function retalhar(c: CapturaComHabilidade) {
  const cortes = 4
  let feitos = 0
  const corDoCorte = materiaisPorFaccao[c.corAtacante].brilho.color
  const proximo = () => {
    if (!c.vigente() || !sequenciaRPGValida(c.atacante, c.senha)) return
    if (feitos === cortes) {
      tocarSom('retalho:pedacos')
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
    const golpes = clipesRPGComPrefixo(c.atacante, 'Attack')
    const tocou = golpes.length > 0 && tocarClipeRPGUmaVez(c.atacante, golpes[(feitos - 1) % golpes.length], { entrada: 0.06, voltarAoParado: false, velocidade: 2.3, aoTerminar: proximo })
    window.setTimeout(() => {
      if (!c.vigente()) return
      tocarSom('retalho:corte')
      rastroDeCorte(c.cena, c.vitima, corDoCorte)
    }, 170)
    if (!tocou) window.setTimeout(proximo, 300)
  }
  proximo()
}

/** O Puxão Universal (rainha): a mão estendida puxa a peça pela gravidade até a cabeça parar na mão, e ela esmaga a peça
 * no chão (ver puxaoUniversal.ts). */
function puxar(c: CapturaComHabilidade) {
  novaSequenciaRPG(c.vitima)
  mostrarEspadaRPG(c.vitima, false)
  tocarSom('puxao:chama')
  const cor = materiaisPorFaccao[c.corAtacante].brilho.color
  puxaoUniversal(c.atacante, c.vitima, c.cena, cor, c.vigente, {
    aoPuxar: () => tocarSom('puxao:arrasta'),
    aoAgarrar: () => tocarSom('puxao:agarra'),
    aoEsmagar: (ponto) => {
      tocarSom('marreta:impacto')
      tocarSom('esmagado', 0.05)
      animarImpacto(c.cena, ponto.x, ponto.z)
      ondaDaMarretada(c.cena, ponto.x, ponto.z, cor)
      rachadurasNoTabuleiro(c.cena, ponto.x, ponto.z)
      poeiraDaPancada(c.cena, ponto.x, ponto.z)
      tremerTabuleiro(c.cena)
      const ms = c.sentirImpacto(1, false)
      depoisDoCongelamento(ms, () => {
        if (!c.vigente()) return
        esmagarPeca(c.vitima, c.fim)
      })
      c.comemorarAliadas()
    },
  })
}

/** A captura de cada habilidade, pelo nome dela no catálogo. */
export const CAPTURAS: Record<string, (c: CapturaComHabilidade) => void> = { retalhamento: retalhar, puxao: puxar }

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
