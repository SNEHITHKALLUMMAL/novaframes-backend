# API server image. Does NOT include ffmpeg or Python — the API process
# never runs an adapter's generate() call itself (Phase 1 architecture:
# inference is the worker's job, in a separate process/container — see
# Dockerfile.worker). Registering adapters at startup (Phase 20) only
# instantiates their JS classes; it doesn't invoke ffmpeg/Python until a
# job actually reaches generate(), which happens in the worker container.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/storage && chown -R app:app /app
USER app

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
