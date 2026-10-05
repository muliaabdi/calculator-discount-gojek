FROM nginx:alpine

LABEL maintainer="BagiPromo Team"
LABEL description="Kalkulator Diskon Gojek/Food Delivery Web App"

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy web files
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY favicon.svg favicon.ico favicon-16.png favicon-32.png favicon-192.png apple-touch-icon.png logo.svg robots.txt sitemap.xml /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
