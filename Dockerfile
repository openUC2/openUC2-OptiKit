# Production build of the OptiKit frontend (WP-25: same-origin deployment).
# The output is a static bundle under /app/dist, built with vite base
# /configurator/ — the deploy compose in ../optikit-core/deploy copies it
# into the volume Caddy serves.

FROM node:22-alpine AS build
WORKDIR /app

# puppeteer is a devDependency used only by local scripts — skip its
# Chromium download inside the image build.
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Artifact-only stage: the deploy compose runs this image once to copy
# /app/dist into the shared frontend volume.
FROM alpine:3
COPY --from=build /app/dist /app/dist
CMD ["true"]
