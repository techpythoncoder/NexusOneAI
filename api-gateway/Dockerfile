# API Gateway — Dockerfile
# Build context: this directory (api-gateway/)
# No external dependencies needed — pure Nginx

FROM nginx:1.25-alpine
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
