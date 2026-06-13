FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

COPY . .
RUN npm run build && \
    # eliminar devDependencies del node_modules tras el build
    npm prune --omit=dev && \
    chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
