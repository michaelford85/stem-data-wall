# ---------------------------------------------------------------------------
# App image for stem-data-wall (Node.js + Express + Socket.IO).
# Multi-arch: builds on arm64 (Raspberry Pi 5) and amd64 (laptop) from the
# same official node image. No network is needed at RUNTIME — all browser
# assets are vendored into public/vendor.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim

# Small init so Ctrl-C / docker stop reaps the node process cleanly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json ./
# Use npm install (no lockfile committed) but keep it reproducible-ish.
RUN npm install --omit=dev && npm cache clean --force

# Copy the rest of the application.
COPY server ./server
COPY db ./db
COPY public ./public
# content/ and media/ are bind-mounted in docker-compose so they can be edited
# live, but we also copy them so the image works on its own.
COPY content ./content
COPY media ./media

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/index.js"]
