# Akcelport CMS image. Build from the repository root so the site build script, templates and public assets are included:
#   docker build -f cms/Dockerfile -t akcelport-cms .
# (docker-compose.yml does this for you.)
FROM node:22-alpine AS build
WORKDIR /app/cms
COPY cms/package.json cms/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY cms/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# The website itself (zero dependencies): build script, templates, styles, fonts and the seed content.
COPY package.json README.md ./
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY public/ ./public/
COPY content/ ./content/
# The CMS with its production dependencies and the built admin UI.
COPY --from=build /app/cms/node_modules ./cms/node_modules
COPY --from=build /app/cms/dist ./cms/dist
COPY cms/package.json cms/tsconfig.json cms/tsconfig.server.json ./cms/
COPY cms/server ./cms/server
COPY cms/shared ./cms/shared
RUN mkdir -p /data/media /data/publish && chown -R node:node /data /app
USER node
WORKDIR /app/cms
ENV PORT=3000 SITE_PORT=4174 MEDIA_DIR=/data/media PUBLISH_DIR=/data/publish SITE_ROOT=/app
EXPOSE 3000 4174
VOLUME ["/data/media", "/data/publish"]
CMD ["npm", "start"]
