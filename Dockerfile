FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    YOUTUBE_DL_SKIP_PYTHON_CHECK=1 \
    YOUTUBE_DL_DIR=/opt/yt-dlp

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential ca-certificates ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY scripts/fix-esm.js ./scripts/fix-esm.js
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund
COPY . .

ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]

