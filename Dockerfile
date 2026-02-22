# Stage 1: build React app
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: production server (no devDeps, no src)
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js .
COPY .env* ./
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.js"]
