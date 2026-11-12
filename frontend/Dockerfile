FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL
RUN DISABLE_ESLINT_PLUGIN=true npm run build

FROM nginx:alpine
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The CSP's connect-src / img-src must name the API the bundle talks to (same defaults as
# src/api/client.js and src/context/NotificationContext.jsx).
RUN api="${REACT_APP_API_URL:-http://localhost:8000}" \
 && ws="${REACT_APP_WS_URL:-ws://localhost:8000}" \
 && api_origin="$(echo "$api" | sed -E 's#^(https?://[^/]+).*#\1#')" \
 && ws_origin="$(echo "$ws" | sed -E 's#^(wss?://[^/]+).*#\1#')" \
 && sed -i -e "s#__API_ORIGIN__#${api_origin}#g" -e "s#__WS_ORIGIN__#${ws_origin}#g" /etc/nginx/conf.d/default.conf \
 && nginx -t

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
