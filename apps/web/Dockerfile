FROM node:24-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --workspace apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build --workspace apps/web
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "apps/web"]
