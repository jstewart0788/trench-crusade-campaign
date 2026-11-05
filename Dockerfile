# Production image: the API serves the built web app and the rules data from one process.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/rules/package.json packages/rules/
COPY packages/tts/package.json packages/tts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps ./apps
COPY data/rules ./data/rules
COPY data/tts/models.json ./data/tts/models.json
COPY data/tts/model-picks.json ./data/tts/model-picks.json
RUN pnpm --filter @tc/rules build && pnpm --filter @tc/api build && pnpm --filter @tc/web build
RUN pnpm --filter @tc/api --prod deploy --legacy /out/api 2>/dev/null || pnpm --filter @tc/api --prod deploy /out/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 \
    RULES_DIR=/app/data/rules STATIC_DIR=/app/web DATABASE_FILE=/data/roster.sqlite RATE_LIMIT_PER_MINUTE=120
RUN useradd -r -u 10001 -s /usr/sbin/nologin tc && mkdir -p /app /data && chown tc:tc /data
WORKDIR /app
COPY --from=build /out/api ./apps/api
COPY --from=build /src/packages/rules/dist ./packages/rules/dist
COPY --from=build /src/packages/rules/package.json ./packages/rules/package.json
COPY --from=build /src/apps/web/dist ./web
COPY --from=build /src/data ./data
USER tc
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
