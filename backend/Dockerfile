FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
# Instalar todas las deps (incluyendo devDependencies para ts-node-dev en Docker dev)
RUN npm ci --prefer-offline

COPY . .
RUN npm run build && chown -R node:node /app

USER node

EXPOSE 3001

# Producción: node dist/index.js
# En Docker dev se sobreescribe con ts-node-dev via docker-compose command
CMD ["node", "dist/index.js"]
