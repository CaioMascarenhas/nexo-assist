FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --workspace apps/agent
COPY apps/agent apps/agent
USER node
EXPOSE 4111
CMD ["npm", "run", "start", "--workspace", "apps/agent"]
