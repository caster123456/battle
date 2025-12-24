# Deploy (domain-ready)

This folder contains templates you will use AFTER you buy a domain + VPS.

## 1) Client build
cd client
npm i
# set VITE_SOCKET_URL=https://your-domain.com in client/.env.production (or export env)
npm run build

## 2) Put project on server
Suggested path: /var/www/classroom-battle/

## 3) Run server with PM2
cd /var/www/classroom-battle/server
npm i
pm2 start ../deploy/ecosystem.config.cjs
pm2 save

## 4) Nginx reverse proxy
Copy deploy/nginx_http.conf to /etc/nginx/sites-available/ and symlink to sites-enabled.
Replace domain/root paths.
Reload nginx.

## 5) HTTPS
Use certbot to enable HTTPS; once HTTPS is on, Socket.io will use WSS automatically.
