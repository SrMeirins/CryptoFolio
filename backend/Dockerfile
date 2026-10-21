FROM node:20.20.2-alpine3.23

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
# Instalar todas las deps (incluidas las devDependencies necesarias para compilar)
RUN npm ci --prefer-offline

COPY . .
RUN npm run build && chown -R node:node /app

USER node

EXPOSE 3001

# Producción: node dist/index.js
# En Docker dev se sobreescribe con tsx watch vía el command de docker-compose
CMD ["node", "dist/index.js"]
