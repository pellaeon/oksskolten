FROM node:22-slim AS base

ENV TZ=UTC
RUN apt-get update -qq && apt-get install -y -qq ca-certificates curl tzdata \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS dev

WORKDIR /app

FROM deps AS build

COPY . .
RUN npm run build && npm run build:mrrss

FROM scratch AS export-spa

COPY --from=build /app/dist /dist
COPY --from=build /app/dist-mrrss /dist-mrrss

FROM deps AS build-server

COPY . .
RUN npm run build && npm run build:mrrss && npm run build:server

FROM base AS runtime

ARG GIT_COMMIT=unknown
ARG GIT_TAG=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_TAG=${GIT_TAG}
ENV BUILD_DATE=${BUILD_DATE}

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY migrations ./migrations

RUN addgroup --system app && adduser --system --ingroup app app \
 && mkdir -p /app/data && chown app:app /app/data
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["npx", "tsx", "--dns-result-order=ipv4first", "server/index.ts"]

FROM nginx:1.27-alpine AS runtime-frontend

COPY nginx/oksskolten.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM nginx:1.27-alpine AS runtime-mrrss-frontend

COPY nginx/oksskolten.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-mrrss /usr/share/nginx/html
EXPOSE 80

FROM base AS runtime-compiled

ARG GIT_COMMIT=unknown
ARG GIT_TAG=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_TAG=${GIT_TAG}
ENV BUILD_DATE=${BUILD_DATE}

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build-server /app/dist-server ./dist-server
COPY --from=build-server /app/dist ./dist-server/dist
COPY --from=build-server /app/migrations ./dist-server/migrations

RUN addgroup --system app && adduser --system --ingroup app app \
 && mkdir -p /app/data && chown app:app /app/data
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "--dns-result-order=ipv4first", "dist-server/server/index.js"]

FROM base AS runtime-compiled-api

ARG GIT_COMMIT=unknown
ARG GIT_TAG=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_TAG=${GIT_TAG}
ENV BUILD_DATE=${BUILD_DATE}

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build-server /app/dist-server ./dist-server
COPY --from=build-server /app/migrations ./dist-server/migrations

RUN addgroup --system app && adduser --system --ingroup app app \
 && mkdir -p /app/data && chown app:app /app/data
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "--dns-result-order=ipv4first", "dist-server/server/index.js"]
