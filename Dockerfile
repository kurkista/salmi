# Stage 1: build the frontend (vite → dist/)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
RUN npm run build

# Stage 2: runtime — server is plain Node (no build step), only prod deps
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY data/events.json ./data/events.json
COPY METHODOLOGY.md ./METHODOLOGY.md
COPY --from=build /app/dist ./dist
EXPOSE 8080
# 192 MB heap cap leaves headroom for the runtime on a 256 MB machine
CMD ["node", "--max-old-space-size=192", "server/index.js"]
