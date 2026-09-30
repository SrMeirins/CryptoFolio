FROM node:24.21.0-alpine3.24

WORKDIR /app

COPY package*.json ./
RUN npm ci && chown -R node:node /app

USER node

COPY --chown=node:node . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
