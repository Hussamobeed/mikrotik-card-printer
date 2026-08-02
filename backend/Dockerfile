# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data/library && addgroup -S hersnnet && adduser -S hersnnet -G hersnnet \
    && chown -R hersnnet:hersnnet /app
USER hersnnet
EXPOSE 4000
CMD ["node", "dist/index.js"]
