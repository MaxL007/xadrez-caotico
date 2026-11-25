// A criptografia das notificações (worker/src/push.ts), sem servidor nem navegador:
// - cifrar a mensagem do exemplo da RFC 8291 (apêndice A), com as chaves e o sal de lá, dá exatamente o resultado de lá;
// - o aparelho (a chave privada dele) decifra de volta o que o servidor cifrou com chaves sorteadas;
// - o JWT do VAPID se confere com a chave pública do servidor;
// - só os serviços de push conhecidos são aceitos como endereço.
// Rodar: node testes/testar-push.mjs (usa o esbuild do servidor; ESBUILD=<caminho> pra outro, como o esbuild-wasm)
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(raiz, 'worker', 'package.json'))
const esbuild = require(process.env.ESBUILD ?? 'esbuild')
const { outputFiles } = await esbuild.build({ entryPoints: [path.join(raiz, 'worker/src/push.ts')], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'error' })
const push = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

let falhas = 0
const conferir = (nome, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!ok) falhas++
}
const { subtle } = globalThis.crypto
const b64 = push.paraBase64Url
const de64 = push.deBase64Url

/** A chave EC P-256 de um exemplo: a privada (d) e a pública crua (65 bytes) viram um par da WebCrypto. */
async function parDeChaves(privada, publica, uso) {
  const crua = de64(publica)
  const jwk = { kty: 'EC', crv: 'P-256', d: privada, x: b64(crua.slice(1, 33)), y: b64(crua.slice(33, 65)), ext: true }
  const algoritmo = { name: uso, namedCurve: 'P-256' }
  return {
    privateKey: await subtle.importKey('jwk', jwk, algoritmo, true, uso === 'ECDH' ? ['deriveBits'] : ['sign']),
    publicKey: await subtle.importKey('raw', crua, algoritmo, true, uso === 'ECDH' ? [] : ['verify']),
  }
}

/** Decifra como o aparelho (RFC 8291, do lado de quem recebe). */
async function decifrar(corpo, privadaDoAparelho, publicaDoAparelho, segredo) {
  const sal = corpo.slice(0, 16)
  const tamanhoDaChave = corpo[20]
  const publicaDoServidor = corpo.slice(21, 21 + tamanhoDaChave)
  const cifrado = corpo.slice(21 + tamanhoDaChave)
  const servidor = await subtle.importKey('raw', publicaDoServidor, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: servidor }, privadaDoAparelho, 256))
  const hmac = async (chave, dados) => new Uint8Array(await subtle.sign('HMAC', await subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), dados))
  const hkdf = async (s, ikm, info, n) => (await hmac(await hmac(s, ikm), Buffer.concat([info, Buffer.from([1])]))).slice(0, n)
  const ikm = await hkdf(segredo, ecdh, Buffer.concat([Buffer.from('WebPush: info\0'), publicaDoAparelho, publicaDoServidor]), 32)
  const cek = await hkdf(sal, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sal, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
  const aes = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt'])
  const claro = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cifrado))
  return { texto: Buffer.from(claro.slice(0, claro.lastIndexOf(2))).toString(), registro: new DataView(corpo.buffer, corpo.byteOffset).getUint32(16) }
}

try {
  // =================== o exemplo da RFC 8291 (apêndice A) ===================
  const RFC = {
    mensagem: 'When I grow up, I want to be a watermelon',
    privadaDoAparelho: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    publicaDoAparelho: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    segredo: 'BTBZMqHH6r4Tts7J_aSIgg',
    privadaDoServidor: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    publicaDoServidor: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    sal: 'DGv6ra1nlYgDCS1FRnbzlw',
    resultado:
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  }
  const inscricao = { p256dh: RFC.publicaDoAparelho, auth: RFC.segredo }
  const servidor = await parDeChaves(RFC.privadaDoServidor, RFC.publicaDoServidor, 'ECDH')
  const doExemplo = await push.cifrar(Buffer.from(RFC.mensagem), inscricao, { chaveDoServidor: servidor, sal: de64(RFC.sal) })
  conferir('a mensagem do exemplo da RFC 8291 sai cifrada igual à da RFC', b64(doExemplo) === RFC.resultado, b64(doExemplo).slice(0, 40) + '…')

  // =================== o aparelho decifra o que o servidor cifrou ===================
  const aparelho = await parDeChaves(RFC.privadaDoAparelho, RFC.publicaDoAparelho, 'ECDH')
  const aviso = JSON.stringify({ titulo: 'Sua vez', texto: 'Bia jogou exd5', url: '/xadrez-caotico/?sala=ABC', etiqueta: 'sala-ABC' })
  const sorteado = await push.cifrar(Buffer.from(aviso), inscricao)
  const lido = await decifrar(sorteado, aparelho.privateKey, de64(RFC.publicaDoAparelho), de64(RFC.segredo))
  conferir('o aparelho decifra o aviso (com chave e sal sorteados)', lido.texto === aviso, lido.texto)
  conferir('o registro tem o tamanho de 4096', lido.registro === 4096, String(lido.registro))
  const outro = await push.cifrar(Buffer.from(aviso), inscricao)
  conferir('cada aviso sai cifrado diferente (chave e sal novos a cada um)', b64(outro) !== b64(sorteado))

  // =================== o VAPID ===================
  const assinatura = await parDeChaves(RFC.privadaDoServidor, RFC.publicaDoServidor, 'ECDSA')
  const jwk = await subtle.exportKey('jwk', assinatura.privateKey)
  const agora = Date.UTC(2026, 10, 25)
  const jwt = await push.jwtDoVapid('https://fcm.googleapis.com/fcm/send/abc', JSON.stringify(jwk), 'https://exemplo.test/', agora)
  const [cabeca, corpo, assinado] = jwt.split('.')
  const claims = JSON.parse(Buffer.from(de64(corpo)).toString())
  const valido = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, assinatura.publicKey, de64(assinado), Buffer.from(`${cabeca}.${corpo}`))
  conferir('o JWT do VAPID se confere com a chave pública do servidor', valido)
  conferir('o JWT vale pro serviço de push certo, por 12 horas, sem e-mail', claims.aud === 'https://fcm.googleapis.com' && claims.exp === agora / 1000 + 43200 && claims.sub === 'https://exemplo.test/', JSON.stringify(claims))

  // =================== os endereços aceitos ===================
  for (const [endpoint, esperado] of [
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://site-malicioso.example/coleta', false],
    ['https://fcm.googleapis.com.site-malicioso.example/x', false],
    [42, false],
  ]) {
    conferir(`endereço de push ${esperado ? 'aceito' : 'recusado'}: ${String(endpoint).slice(0, 48)}`, push.enderecoDePushValido(endpoint) === esperado)
  }
  conferir('sem as chaves (o simulador), nada é enviado', (await push.enviarAviso({ endpoint: 'https://fcm.googleapis.com/x', ...inscricao }, JSON.parse(aviso), {})) === 'sem-chaves')
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.stack ?? e.message)
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
