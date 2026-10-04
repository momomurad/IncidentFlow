FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_APP_MODE=user
ENV VITE_APP_MODE=${VITE_APP_MODE}
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=frontend
COPY frontend frontend
RUN npm run build --workspace=frontend
FROM nginx:stable-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
