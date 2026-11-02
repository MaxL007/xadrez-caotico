# Xadrez Caótico

Xadrez 3D no navegador. As peças lutam de verdade a cada captura. Dá pra jogar contra a máquina, sem conta
nenhuma, ou criar uma conta gratuita, adicionar amigos pelo nome ou pelo ID e chamá-los pra uma partida amistosa.

## Como funciona

- **Site:** React, Vite e three.js, publicado no GitHub Pages.
- **Servidor** (`worker/`): Cloudflare Workers, com banco D1 para contas e partidas salvas e uma sala em
  Durable Object para cada partida entre duas pessoas. A sala é o árbitro: confere a vez e a legalidade de
  cada lance no servidor.
- **Senhas:** nunca saem do aparelho. O site deriva uma chave com 600 mil rodadas de PBKDF2 e o servidor
  guarda um HMAC dela com um segredo que fica só na Cloudflare.

## Desenvolvimento

```sh
npm install
cd worker && npm install && cd ..

# segredos locais do simulador (não vão pro git)
printf 'PIMENTA=qualquer-coisa-longa\nORIGENS=http://127.0.0.1:5184\nLIMITE_CONTAS=100000\n' > worker/.dev.vars
cd worker && npx wrangler d1 migrations apply xadrez-caotico --local && npm run dev   # simulador, porta 8787
npm run dev                                                                            # site, porta 5184
```

Testes, com os dois no ar:

```sh
node testes/testar-servidor.mjs    # contas, amigos, dados de cada pessoa e tentativas de trapaça
node testes/testar-online.mjs      # dois navegadores virando amigos e jogando uma partida inteira
node testes/testar-promocao.mjs    # promoção, marreta e tabuleiro virando
node testes/fotos-online.mjs       # fotos das telas, com o 3D ligado
```

## Publicação do servidor

```sh
cd worker
npx wrangler login
npx wrangler d1 create xadrez-caotico        # copie o database_id pro wrangler.toml
npx wrangler d1 migrations apply xadrez-caotico --remote
npx wrangler secret put PIMENTA              # um valor longo e aleatório. Trocar depois invalida as senhas
npx wrangler deploy
```

O endereço do servidor vai em `.env.production` (`VITE_API_URL`), e o site é publicado a cada envio pra `main`.

Servidor publicado: `https://xadrez-caotico.xadrez-caotico-servidor.workers.dev`. Para conferir a publicação de verdade:

```sh
API=https://xadrez-caotico.xadrez-caotico-servidor.workers.dev node testes/conferir-producao.mjs
API=https://xadrez-caotico.xadrez-caotico-servidor.workers.dev node testes/conferir-site-publicado.mjs
```

Os dois criam contas temporárias e as apagam no fim, e gastam o limite de 5 contas por hora do endereço.
