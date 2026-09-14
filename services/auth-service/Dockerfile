FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=3009
EXPOSE 3009

HEALTHCHECK --interval=15s --timeout=3s --retries=3   CMD wget -qO- http://localhost:3009/health || exit 1

CMD ["node", "server.js"]
