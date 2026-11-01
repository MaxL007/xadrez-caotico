// A senha nunca sai do aparelho: daqui vai só uma chave derivada dela. A conta é lenta de propósito
// (600 mil rodadas, o recomendado pela OWASP pra PBKDF2-SHA256): é isso que torna caro testar senhas.
// O servidor completa a proteção com um segredo dele (ver worker/src/conta.ts).

const RODADAS = 600000

/** Igual a `nomeDeBusca` do servidor: "Ána" e "ana" são o mesmo nome. */
export function nomeDeBusca(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
}

export async function derivarChave(nome: string, senha: string): Promise<string> {
  const codificador = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', codificador.encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: RODADAS, salt: codificador.encode(`xadrez-caotico:v1:${nomeDeBusca(nome)}`) },
    base,
    256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}
