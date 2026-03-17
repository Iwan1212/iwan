FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY knowledge/ ./knowledge/

USER node

CMD ["node", "src/index.js"]
