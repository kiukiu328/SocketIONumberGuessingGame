FROM node:latest
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY server.js ./
COPY public ./public
COPY views ./views

EXPOSE 3000
CMD ["npm", "start"]