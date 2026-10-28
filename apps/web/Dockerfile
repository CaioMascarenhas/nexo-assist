FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build --workspace apps/web
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "apps/web"]
