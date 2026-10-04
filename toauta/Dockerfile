# ToAuta production image: stock Directus 12.3.1 plus the car-images extension, built from source.
# Build context: this folder (toauta/). Dokploy builds it through toauta/docker-compose.yml.
# See toauta/README.md.

# The bundle is plain JavaScript, so the build stage's platform does not matter.
FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /ext
COPY extensions/directus-extension-display-car-images/package.json extensions/directus-extension-display-car-images/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY extensions/directus-extension-display-car-images/tsconfig.json extensions/directus-extension-display-car-images/postcss.config.mjs ./
COPY extensions/directus-extension-display-car-images/src ./src
RUN npm test && npm run build && test -s dist/app.js && test -s dist/api.js

# Official image, pinned by its multi-arch index digest (linux/amd64 and linux/arm64).
# Entrypoint, command and user (node) are inherited unchanged.
FROM directus/directus:12.3.1@sha256:8978edf633ae28aa31464bb71c55300c94d8bc771ff3727b5fac485173283869
COPY --from=build --chown=node:node /ext/package.json /directus/extensions/directus-extension-display-car-images/package.json
COPY --from=build --chown=node:node /ext/dist /directus/extensions/directus-extension-display-car-images/dist
