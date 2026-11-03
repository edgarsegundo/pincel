#!/bin/bash
set -eo pipefail   # sem -u de propósito: o nvm.sh usa variáveis não definidas

# Publica o Pincel em https://pincel.ea.tv.br (rodar NA VPS, dentro do repositório).
#
#   1. build do app (Vite) e rsync para /var/www/pincel.ea.tv.br — o nginx serve direto do
#      host por bind mount (ver reverse-proxy-config/docker-compose.yml), sem container.
#   2. (re)cria o container do proxy do JEV (pincel_proxy) na rede do nginx.
#   3. recarrega o nginx e faz um teste de fumaça no site publicado.
#
# Uso:    ./rebuild.sh [ref]
#   ref   tag ou branch opcional (git fetch + checkout). Sem ela, publica o que está no disco.
#
# Variáveis (todas opcionais):
#   SKIP_TESTS=1    pula typecheck + testes unitários
#   SKIP_PROXY=1    publica só o site (não mexe no container do proxy)
#   DOMAIN=...      padrão pincel.ea.tv.br
#   DEPLOY_DIR=...  padrão /var/www/$DOMAIN
#   NGINX_CONTAINER=...  padrão "nginx"
#   SUDO=           (vazio) para não usar sudo quando o usuário já é dono do DEPLOY_DIR
#
# Primeira vez? Veja o checklist impresso no fim (DNS, certificado, bind mount, .env.production).

DOMAIN="${DOMAIN:-pincel.ea.tv.br}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/${DOMAIN}}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx}"
SUDO="${SUDO-sudo}"
WARNINGS=0

cd "$(dirname "$0")"

say()  { echo "▶ $*"; }
warn() { echo "⚠️  $*"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo "❌ $*" >&2; exit 1; }

# ---------------------------------------------------------------- Node
# O Vite e o proxy exigem Node >= 22. Em vez de trocar o default do nvm (afetaria outros
# projetos Node do host), usamos a versão do .nvmrc só dentro deste script.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm install "$(cat .nvmrc)" >/dev/null
    nvm use "$(cat .nvmrc)" >/dev/null
fi
command -v node >/dev/null || fail "node não encontrado (instale o nvm ou o Node 22)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $(node -v) é antigo: precisa de >= 22."
command -v rsync >/dev/null || fail "rsync não encontrado."

# ---------------------------------------------------------------- Código
REF="${1:-}"
if [ -n "$REF" ]; then
    say "Buscando o remoto e fazendo checkout de '$REF'..."
    git fetch origin --tags
    git checkout "$REF"
    # Se for um branch (não uma tag), traz as últimas mudanças sem criar merge.
    if git show-ref --verify --quiet "refs/heads/$REF"; then
        git pull --ff-only origin "$REF"
    fi
fi
say "Publicando versão: $(git describe --always --dirty 2>/dev/null || echo 'sem git')"

# npm ci sempre: garante node_modules em sincronia com o package-lock.json.
say "Instalando dependências (npm ci)..."
npm ci --no-audit --no-fund

if [ "${SKIP_TESTS:-0}" != "1" ]; then
    say "Typecheck e testes unitários (SKIP_TESTS=1 para pular)..."
    npm run typecheck
    npx vitest run
fi

# ---------------------------------------------------------------- Build
# VITE_AI_ENDPOINT é lido no BUILD: sem ele a ajuda da IA fica desligada em produção.
# O caminho é relativo: o nginx encaminha /api/shape para o container pincel_proxy (mesma origem, sem CORS).
say "Build (tsc + vite + orçamento de tamanho)..."
VITE_AI_ENDPOINT=/api/shape npm run build
[ -f dist/index.html ] || fail "dist/index.html não foi gerado."
[ -f dist/sw.js ] || fail "dist/sw.js não foi gerado (PWA offline quebraria)."

# ---------------------------------------------------------------- Publicação do site
say "Publicando dist/ em ${DEPLOY_DIR}..."
$SUDO mkdir -p "$DEPLOY_DIR"
# --delete remove do destino os arquivos do build anterior (o Vite troca o hash dos nomes a cada build);
# --delay-updates troca todos de uma vez no fim, para o navegador não ver index.html novo com assets velhos.
$SUDO rsync -a --delete --delay-updates dist/ "$DEPLOY_DIR/"
say "Site publicado em ${DEPLOY_DIR}."

if command -v docker >/dev/null && docker inspect "$NGINX_CONTAINER" >/dev/null 2>&1; then
    if ! docker inspect -f '{{range .Mounts}}{{println .Destination}}{{end}}' "$NGINX_CONTAINER" | grep -qx "$DEPLOY_DIR"; then
        warn "O container '$NGINX_CONTAINER' NÃO monta $DEPLOY_DIR. Adicione em reverse-proxy-config/docker-compose.yml:
        - ${DEPLOY_DIR}:${DEPLOY_DIR}:ro
     e recrie o nginx (docker compose up -d nginx)."
    fi
fi

# ---------------------------------------------------------------- Proxy do JEV
if [ "${SKIP_PROXY:-0}" != "1" ]; then
    command -v docker >/dev/null || fail "docker não encontrado (use SKIP_PROXY=1 para publicar só o site)."

    if [ ! -f .env.production ]; then
        warn ".env.production não existe: criando vazio. Sem TYPESAFE_API_KEY a IA fica desligada (o site funciona normalmente)."
        ( umask 077; : > .env.production )
    elif ! grep -q '^TYPESAFE_API_KEY=.\+' .env.production; then
        warn "TYPESAFE_API_KEY vazia em .env.production: a IA fica desligada até você preencher (o site funciona normalmente)."
    fi

    say "Construindo e subindo o container do proxy (pincel_proxy)..."
    docker compose up -d --build --force-recreate pincel_proxy

    say "Aguardando o proxy ficar saudável..."
    STATUS=""
    for _ in $(seq 1 30); do
        STATUS="$(docker inspect -f '{{.State.Health.Status}}' pincel_proxy 2>/dev/null || echo starting)"
        [ "$STATUS" = "healthy" ] && break
        sleep 1
    done
    if [ "$STATUS" = "healthy" ]; then
        say "Proxy saudável."
    else
        warn "Proxy não ficou saudável (status: $STATUS). Últimas linhas do log:"
        docker compose logs --tail 15 pincel_proxy || true
    fi
fi

# ---------------------------------------------------------------- nginx
if command -v docker >/dev/null && docker inspect "$NGINX_CONTAINER" >/dev/null 2>&1; then
    say "Validando e recarregando o nginx..."
    if docker exec "$NGINX_CONTAINER" nginx -t >/dev/null 2>&1; then
        docker exec "$NGINX_CONTAINER" nginx -s reload
    else
        warn "nginx -t falhou: configuração NÃO recarregada. Detalhe:"
        docker exec "$NGINX_CONTAINER" nginx -t 2>&1 | tail -5 || true
    fi
else
    warn "Container '$NGINX_CONTAINER' não encontrado: nginx não foi recarregado."
fi

# ---------------------------------------------------------------- Teste de fumaça
say "Testando https://${DOMAIN} ..."
# curl já imprime 000 quando a conexão falha; o '|| true' só impede o set -e de abortar.
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || true; }

CODE="$(http_code "https://${DOMAIN}/")"
[ "$CODE" = "200" ] && echo "   ✅ /                      200" || warn "/ respondeu $CODE (esperado 200). DNS, certificado ou nginx ainda não prontos?"

CODE="$(http_code "https://${DOMAIN}/manifest.webmanifest")"
[ "$CODE" = "200" ] && echo "   ✅ /manifest.webmanifest  200" || warn "/manifest.webmanifest respondeu $CODE."

SW_CACHE="$(curl -sI --max-time 10 "https://${DOMAIN}/sw.js" | tr -d '\r' | grep -i '^cache-control:' || true)"
if echo "$SW_CACHE" | grep -qi 'no-store'; then
    echo "   ✅ /sw.js                 sem cache"
else
    warn "/sw.js não está com 'Cache-Control: no-store' (${SW_CACHE:-sem cabeçalho}). O PWA pode ficar preso na versão antiga: ajuste o nginx."
fi

# 400 (corpo inválido) ou 503 (proxy sem chave) provam que o nginx alcança o proxy; 404/405/502 não.
CODE="$(http_code -X POST -H 'content-type: application/json' -d '{}' "https://${DOMAIN}/api/shape")"
case "$CODE" in
    400) echo "   ✅ /api/shape             proxy alcançado e configurado (400 para corpo vazio)" ;;
    503) warn "/api/shape alcançou o proxy, mas ele está SEM chave do JEV (503). Preencha TYPESAFE_API_KEY em .env.production e rode de novo." ;;
    *)   warn "/api/shape respondeu $CODE (esperado 400). O location do proxy está no nginx? O container pincel_proxy está na rede nginx-proxy-network?" ;;
esac

# ---------------------------------------------------------------- Resumo
echo
if [ "$WARNINGS" -eq 0 ]; then
    echo "✅ Pincel publicado: https://${DOMAIN}"
else
    echo "⚠️  Publicado com ${WARNINGS} aviso(s) — veja acima."
    cat <<EOF

Checklist da PRIMEIRA publicação:
  1. DNS: registro A de ${DOMAIN} apontando para o IP da VPS.
  2. Certificado: no reverse-proxy-config, ./create_ssl.sh (ou --only-certificate) para ${DOMAIN}.
  3. nginx: sites/${DOMAIN}.conf com root ${DEPLOY_DIR}, sw.js sem cache e o location /api/shape
     (referência pronta em deploy/nginx/pincel.ea.tv.br.conf) + o bind mount de ${DEPLOY_DIR} no docker-compose do nginx.
  4. Proxy: .env.production (neste diretório) com TYPESAFE_API_KEY=... e, se quiser, JEV_MODEL=...
EOF
fi
