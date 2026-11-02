import { enderecoDaFoto, type Jogador } from '../db/servidor'
import listas from './aparencia.json'

// O que dá pra usar no perfil. As listas ficam no JSON porque o servidor confere pelas mesmas.

export const AVATARES = listas.avatares
export const MOLDURAS = listas.molduras
const AVATAR_PADRAO = 'peao-brancas'

export const urlDoAvatar = (avatar: string) => `${import.meta.env.BASE_URL}avatares/${avatar}.webp`

export function imagemDoJogador({ idJogador, avatar }: Pick<Jogador, 'idJogador' | 'avatar'>): string {
  return avatar?.startsWith('foto:') ? enderecoDaFoto(idJogador, avatar.slice('foto:'.length)) : urlDoAvatar(avatar ?? AVATAR_PADRAO)
}

export const ANEL_DA_MOLDURA: Record<string, string> = {
  madeira: 'conic-gradient(from 210deg, #5b3a1e, #a8743f, #4a2d15, #8a5a2c, #5b3a1e)',
  bronze: 'conic-gradient(from 210deg, #7a4a21, #e0a96d, #8c5a2b, #f2c48d, #7a4a21)',
  prata: 'conic-gradient(from 210deg, #8d96a3, #f4f7fb, #7c8592, #dfe5ee, #8d96a3)',
  ouro: 'conic-gradient(from 210deg, #a67c1a, #ffe9a3, #b8891f, #f7d565, #a67c1a)',
  rubi: 'conic-gradient(from 210deg, #6b0f1a, #ff5a5f, #8a1523, #ff8a80, #6b0f1a)',
  safira: 'conic-gradient(from 210deg, #12306b, #5aa2ff, #173d87, #8fc2ff, #12306b)',
  real: 'conic-gradient(from 210deg, #a67c1a, #ffe9a3, #b8891f, #f7d565, #a67c1a)',
  caos: 'conic-gradient(#ff3d3d, #ffb300, #3dff8b, #3db8ff, #b43dff, #ff3d3d)',
}
