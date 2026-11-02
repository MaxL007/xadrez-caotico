// Foto de perfil importada do aparelho. Roda aqui, não no servidor: recorta no meio, reduz e volta a salvar
// como JPEG, o que também deixa pra trás os dados que a câmera grava no arquivo, como o lugar da foto.

const LADO_DA_FOTO = 256
const MAXIMO_BASE64 = 60 * 1024

/** Devolve a imagem em base64. Falha se o navegador não conseguir abrir o arquivo. */
export async function prepararFoto(arquivo: File): Promise<string> {
  const imagem = await createImageBitmap(arquivo)
  const lado = Math.min(imagem.width, imagem.height)
  const quadro = document.createElement('canvas')
  quadro.width = quadro.height = LADO_DA_FOTO
  const contexto = quadro.getContext('2d')
  if (!contexto) throw new Error('sem-canvas')
  // JPEG não tem transparência: o que era transparente fica da cor do painel, não preto
  contexto.fillStyle = '#2a1c10'
  contexto.fillRect(0, 0, LADO_DA_FOTO, LADO_DA_FOTO)
  contexto.drawImage(imagem, (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado, 0, 0, LADO_DA_FOTO, LADO_DA_FOTO)
  imagem.close()

  let base64 = ''
  for (const qualidade of [0.85, 0.7, 0.5]) {
    base64 = quadro.toDataURL('image/jpeg', qualidade).split(',')[1]
    if (base64.length <= MAXIMO_BASE64) break
  }
  return base64
}
