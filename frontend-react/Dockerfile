FROM node:22-alpine AS build

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
WORKDIR /build

COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend-react ./
ARG VITE_FIREFLY_API_BASE=/api
ENV VITE_FIREFLY_API_BASE=${VITE_FIREFLY_API_BASE}
RUN npm run build:web

FROM nginx:1.27-alpine

COPY deploy/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
