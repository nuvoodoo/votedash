FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN apk add --no-cache unzip && npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY archive ./archive
COPY tools ./tools
EXPOSE 8080
CMD ["node", "server/app.js"]
