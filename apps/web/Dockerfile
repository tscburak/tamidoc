# syntax=docker/dockerfile:1

# ---- Build stage: Vite production build ----
FROM node:22-alpine AS build
WORKDIR /app

# VITE_API_URL is relative so the browser hits the proxy origin
# (same-origin cookies). Passed in from docker-compose build args.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_TAMIDOC_EDITION=community
ENV VITE_TAMIDOC_EDITION=$VITE_TAMIDOC_EDITION

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runner stage: serve static dist with nginx ----
FROM nginx:1.27-alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
