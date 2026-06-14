FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install && chown -R node:node /app

USER node

COPY --chown=node:node . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
