FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787
CMD ["node", "server/index.js"]
