FROM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
