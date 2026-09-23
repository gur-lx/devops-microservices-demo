FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY docs.html /usr/share/nginx/html/docs.html
COPY style.css /usr/share/nginx/html/style.css
COPY docs.css /usr/share/nginx/html/docs.css
COPY app.js /usr/share/nginx/html/app.js

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
