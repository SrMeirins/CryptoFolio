FROM node:20-alpine

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache wget

# Copiar package files primero (aprovecha cache de Docker)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
