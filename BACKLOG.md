# Backlog do Pincel

Atualizado em 03/11/2026. Estado atual: MVP (M0–M6) pronto e a 1ª capacidade da v2 (IA para formas ambíguas) implementada, **ainda não testada com o JEV real**. Detalhes técnicos na spec (`Spec MVP – Whiteboard Hands-free Leve.md`).

Legenda: 👤 depende de você · 🤖 posso fazer sozinho (é só pedir) · ⏱ tempo estimado

---

## 1. Fazer primeiro (quando estiver em casa)

### 1.1 ✅ (feito em 03/11/2026) Ligar e calibrar a IA com o JEV real ⏱ 15 min

É o passo que destrava a v2. Hoje só foi testado com um JEV simulado.

- [x] Copiar `.env.example` para `.env.local` e preencher `TYPESAFE_API_KEY=` (o arquivo é ignorado pelo git; a chave nunca vai ao navegador).
- [x] `npm run jev:models` — confirma se o modelo padrão `jev-1.13.0` (o do projeto emprego) ainda existe. Se não, defina `JEV_MODEL=` no `.env.local` com um da lista.
- [x] `npm run jev:calibrate` — chama o JEV de verdade com ~160 traços rotulados e imprime: matriz de confusão, tabela de limiares (precisão × cobertura), tokens, custo e latência. Use `JEV_N=60` para mais traços por classe.
- [x] Resultado (240 traços, JEV real `jev-1.13.0`, 0 erros, 100% precisão, p50 206 ms, ≈US$0,01): limiares ajustados para `aiThreshold` 0,60 / `aiDeliberate` 0,50. O modelo `jev-1.13.0` não aparece em `/v1/models` (só `jev-latest`/`jev-preview`) mas responde. Recalibrar com traços reais (1.3). Plano original:
  - 🤖 ajusto `aiThreshold` (hoje 0,70) e `aiDeliberate` (hoje 0,60);
  - 🤖 reescrevo os textos das perguntas em `server/jev.ts` se a precisão ficar abaixo de 97% (lembre de subir `PROMPT_VERSION`);
  - 🤖 corrijo qualquer diferença entre o formato real da API e o que a documentação diz (a única coisa que ficou sem validar).
- [ ] `npm run dev`, desenhar um retângulo bem torto e soltar. A IA deve converter em segundo plano em < 300 ms. Se aparecer um ponto azul pulsando e nada acontecer, o proxy está sem chave ou o modelo não existe (veja o terminal do `npm run dev`).

### 1.2 ✅ (feito em 03/11/2026) Testar à mão o "feeling" do MVP ⏱ 20 min

Nada disso foi usado por uma pessoa de verdade ainda (só por testes automáticos).

- [ ] `npm run dev` e desenhar: círculo, retângulo, triângulo, linha, letras, rabiscos.
- [ ] O tempo de segurar (400 ms) está bom? Muito rápido ou lento? (Ajustável em Configurações → Avançado.)
- [ ] A animação de conversão (180 ms) agrada?
- [ ] Ao soltar, converte formas demais ou de menos?
- [ ] Digitar sobre uma forma (rótulo) e fora dela (texto) é natural?
- [ ] Rabiscar para apagar apaga sem querer em algum caso?
- [ ] Anotar o que incomoda e me mandar: eu ajusto limiares e tempos.

### 1.3 ✅ Treinamento do reconhecimento (virou recurso do app)

Decidido em 03/11/2026: o Pincel nasce com os limiares padrão e **não exige** gravar traços. Quem sentir imprecisão calibra no próprio app: **Configurações → Avançado → "Treinar o reconhecimento de formas…"**.

- [x] Tela de treinamento dentro do app (carregada só ao abrir, ≈2,5 KB gzip), calibração local por forma, comparação antes/depois, "Ativar calibração" e "Voltar ao padrão", exportar/importar JSON. Tudo fica no aparelho.
- [x] Trava: só libera a ativação com ≥ 20 exemplos de "Não é forma" e ≥ 5 de alguma forma (sem isso a calibração poderia piorar o app).
- [ ] 👤 (opcional, quando quiser) Experimentar a tela com o seu jeito de desenhar e dizer se a explicação e o resultado ficaram claros.
- [ ] 🤖 Se você exportar um JSON, posso usá-lo para ajustar os limiares **padrão** de todos os usuários.

### 1.4 👤 Primeira publicação em https://lousa.ea.tv.br ⏱ 30 min

O `rebuild.sh` foi testado num clone limpo (npm ci, 67 testes, build e rsync), **mas não na VPS**, e o container do proxy **não foi construído** (o Docker local estava desligado). Por isso a primeira execução pede atenção.

- [ ] **Achado:** não encontrei o arquivo de nginx do pincel em nenhum projeto desta máquina (o `reverse-proxy-config` está limpo). Se você o criou na VPS (provável, via `create_ssl.sh`), compare com `deploy/nginx/lousa.ea.tv.br.conf`. O `create_ssl.sh` gera `root /var/www/[INSERT-YOUR-REPO-NAME]` e **não** inclui o location `/api/shape` nem o `sw.js` sem cache.
- [ ] DNS: registro A de `lousa.ea.tv.br` para o IP da VPS (o `ea.tv.br` já aponta para o Shlink; o subdomínio precisa do seu próprio registro).
- [ ] Certificado: `./create_ssl.sh` (ou `--only-certificate`) no `reverse-proxy-config`, para `lousa.ea.tv.br`.
- [ ] No `reverse-proxy-config/docker-compose.yml`, em `nginx.volumes`, acrescentar `- /var/www/lousa.ea.tv.br:/var/www/lousa.ea.tv.br:ro` e recriar o nginx (`docker compose up -d nginx`).
- [ ] No `sites/lousa.ea.tv.br.conf`: conferir os 4 pontos do cabeçalho do arquivo de referência (root, `index.html`/`sw.js` sem cache, `location = /api/shape`, `X-Forwarded-For $remote_addr`).
- [ ] Na VPS: clonar o repositório em `~/Repos/pincel`, criar `.env.production` com `TYPESAFE_API_KEY=...` (e `JEV_MODEL`, se precisar) e rodar `./rebuild.sh`.
- [ ] O script termina com um teste de fumaça; qualquer ⚠️ diz o que falta. Me mande a saída se algo falhar.
- [ ] Depois do 1º deploy: abrir o site, desenhar um retângulo torto e conferir o ponto "analisando" (a IA depende da chave e do modelo; veja 1.1).
- [ ] 🤖 Posso rodar o build da imagem localmente quando você ligar o Docker (`colima start`) para validar o `Dockerfile` antes da VPS.

---

## 2. Decisões de produto (👤 só você pode tomar)

- [ ] **Seta automática:** uma linha que liga duas formas deve ganhar seta no fim sozinha? Hoje não ganha (a seta se define na barra de contexto). Com seta automática, fluxogramas ficam mais rápidos; sem, diagramas sem direção ficam mais limpos.
- [ ] **Marca:** ícone e cor de acento definitivos. Os atuais são provisórios (quadrado azul com uma pincelada). Afeta os tokens de cor, o ícone do PWA e o `manifest`. Quando decidir, 🤖 troco tudo.
- [x] **Hospedagem:** decidido (VPS atrás do nginx do `reverse-proxy-config`, em `https://lousa.ea.tv.br`). `rebuild.sh`, `Dockerfile`, `docker-compose.yml` e `deploy/nginx/lousa.ea.tv.br.conf` já existem; falta o checklist da seção 1.4.
- [x] **Losango na IA** (03/11/2026): feito, por ser o símbolo de decisão dos fluxogramas. Calibração com o JEV real (300 traços, `shape-v3`): losango 60/60, precisão 99,1% e cobertura 92% nos limiares atuais (0,60 / 0,50), latência p50 215 ms. O losango exige encaixe local ≥ 0,70 (círculos muito trêmulos às vezes parecem losango ao JEV).
- [ ] **Quais outras formas a IA reconhece?** Linha, estrela, seta, coração... Cada uma é uma entrada em `server/jev.ts` + uma linha em `src/recognition/ai/shapes.ts`.
- [ ] **Ajuda da IA ligada por padrão?** Hoje sim (se houver proxy configurado). Alternativa: desligada até o usuário ativar nas configurações.

---

## 3. Medições e testes que faltam

### Em outros navegadores e dispositivos (👤 testar à mão; 🤖 corrijo o que aparecer)

- [ ] **Safari (macOS):** desenho, pinça do trackpad (o Safari usa eventos de gesto, ainda **não tratados**; no Chrome/Firefox funciona), PWA, fonte.
- [ ] **Firefox:** desenho, texto, rótulos, exportar PNG.
- [ ] **Teclas mortas e acentos:** digitar `´` + `a` (á), `~` + `o` (õ), `^` + `e` (ê) em texto e rótulo. Os testes automáticos usam inserção direta de texto, que não exercita teclas mortas de verdade.
- [ ] **Mouse com roda comum** (não só trackpad): pan com a roda, zoom com Cmd/Ctrl+roda.
- [ ] **Tela retina e monitor de 120 Hz:** a latência do traço e a fluidez.
- [ ] 🤖 Posso adicionar Safari (WebKit) e Firefox à suíte automática do Playwright (`npx playwright install webkit firefox`) para pegar regressões básicas.

### Metas de desempenho ainda não medidas

- [ ] **Abertura até poder desenhar:** meta ≤ 500 ms sem cache e ≤ 200 ms com cache do PWA. 🤖 meço com Playwright.
- [ ] **60 fps constantes ao desenhar** (120 em telas ProMotion). 🤖 meço com o trace de desempenho do Chromium.
- [ ] **Latência da IA ponta a ponta:** meta < 300 ms do soltar até a forma aparecer (depende do JEV real; sai da calibração do item 1.1).

---

## 4. Melhorias conhecidas do MVP (🤖 posso fazer)

Ordenadas por valor. Nenhuma bloqueia o uso.

- [ ] **Pinça do trackpad no Safari** (eventos `gesturestart/change/end`). ⏱ 1 h
- [ ] **Reconhecimento de setas desenhadas** (linha com um "V" no fim). O tipo já existe no modelo; falta o reconhecedor. ⏱ meio dia
- [ ] **Formas inclinadas** (retângulo/elipse/losango rotacionados): hoje ficam como traço livre. Exige campo de rotação nas formas, ajuste por componentes principais e desenho/hit-test rotacionados. ⏱ 1 dia
- [ ] **Guias visuais de conexão ao desenhar** (a forma "acende" quando uma linha se aproxima), além do aviso que já aparece depois da conversão. ⏱ 2 h
- [ ] **Arrastar uma ponta isolada de um conector** (hoje a linha toda se move ou se solta). ⏱ 3 h
- [ ] **Redimensionar e girar objetos** (alças de seleção). Hoje só mover. ⏱ 1–2 dias
- [ ] **Seleção por laço / retângulo** de vários objetos. ⏱ 3 h
- [ ] **Colar texto da área de transferência** do sistema (hoje o colar só funciona dentro do app). ⏱ 1 h
- [ ] **Salvar só o que mudou** (hoje o autosave copia o quadro inteiro: ~17 ms com 5.000 objetos, em ociosidade). Só importa em quadros enormes. ⏱ 3 h
- [ ] **Aviso em vez de recarga automática** quando sair versão nova do PWA (hoje recarrega e pode perder até 1 s de edição). ⏱ 1 h
- [ ] **Vários quadros locais** (lista de quadros). ⏱ 1 dia
- [ ] **Exportar SVG** e copiar como imagem. ⏱ 3 h
- [ ] **Elipses muito alongadas** têm curvas de 60–70° nas pontas; conferir na calibração se o JEV as distingue de retângulos arredondados. (Item de verificação, não de código.)
- [ ] Preencher `CLAUDE.md` (está vazio) com os comandos e a arquitetura, para sessões futuras começarem com contexto. ⏱ 15 min

---

## 5. Próximas capacidades da IA (v2 em diante)

Todas seguem o mesmo desenho já implementado: interface `AiProvider`, um passo no histórico, descarte de resposta obsoleta. Só vale começar depois do item 1.1.

- [ ] **Arrumar o quadro:** comando que alinha, distribui e iguala tamanhos de formas próximas. O JEV decide as relações (grupos, linhas, colunas); a geometria continua local (`beautify`). ⏱ 1–2 dias
- [ ] **Rabisco → diagrama:** entende um esboço (caixas + setas + rótulos) e gera um fluxograma limpo. Pergunta em aberto: o JEV consegue ler rótulos manuscritos só com características/pontos? Se não, avaliar enviar uma imagem pequena a um modelo de visão (exige o cabeçalho `TypeSafe-Danger-Zone-Images` e custa mais). ⏱ vários dias
- [ ] **Tinta → texto:** palavras escritas à mão viram texto digitado (mais útil com caneta/toque).
- [ ] **Comandos por voz/texto** ("desenhe um fluxograma de login", "deixe tudo azul"): hands-free literal.
- [ ] **Experimento:** enviar a imagem do traço (visão) em vez das características, e comparar custo, latência e acerto na calibração.

---

## 6. Futuro mais distante

Colaboração em tempo real, contas e quadros na nuvem, camadas, imagens importadas, caneta com pressão real e gestos de toque (dois dedos), agrupar objetos, tema de alto contraste, mais idiomas (o `i18n` está pronto; basta um arquivo novo em `src/i18n/`).

---

## Referência rápida

| Quero... | Comando |
| --- | --- |
| Rodar o app (com proxy da IA embutido) | `npm run dev` |
| Todos os testes unitários | `npx vitest run` |
| Testes no navegador (Chromium) | `npm run e2e` |
| Teste do PWA offline | `npm run e2e:pwa` |
| Build de produção (falha se o JS passar de 60 KB) | `npm run build` |
| Calibrar a IA com o JEV real | `npm run jev:calibrate` |
| Calibrar com JEV simulado (sem chave) | `npm run jev:calibrate:mock` |
| Listar modelos do JEV | `npm run jev:models` |
| Publicar na VPS (rodar lá) | `./rebuild.sh [tag-ou-branch]` |
| Rodar o proxy sem Docker | `npm run proxy` |
| Gerar o subset da fonte | `./scripts/subset-font.sh` |

Pastas importantes: `src/recognition/` (reconhecimento e IA), `src/shapes/` (uma forma por arquivo), `server/` (proxy do JEV), `src/settings/schema.ts` (todas as configurações), `e2e/` (testes no navegador).
