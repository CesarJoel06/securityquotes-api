FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p data uploads generated

EXPOSE 3000

CMD ["npm", "start"]
