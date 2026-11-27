FROM node:26.13.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund
COPY backend backend
COPY frontend frontend
COPY database database
ENV API_ORIGIN=http://backend:4000 NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --no-audit --no-fund
FROM node:26.13.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/storage/documents && chown -R node:node /app/storage
USER node
EXPOSE 3000 4000
CMD ["npm","run","start","-w","frontend"]
