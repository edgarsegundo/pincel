# Proxy do JEV do Pincel (o site em si é estático e vai direto para o nginx; ver rebuild.sh).
# Não tem dependências npm: o Node 22 executa o TypeScript de server/ direto.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
ENV NODE_ENV=production PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/standalone.ts"]
