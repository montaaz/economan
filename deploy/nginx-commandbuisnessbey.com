# /etc/nginx/sites-available/commandbuisnessbey.com
# Economan 2 — Next.js sur le port 3002. certbot ajoute ensuite le bloc HTTPS.

server {
    listen 80;
    listen [::]:80;
    server_name commandbuisnessbey.com www.commandbuisnessbey.com;

    # Photos de factures (jusqu'à 20 par envoi) et import du Z.
    client_max_body_size 60M;

    # Les modèles de reconnaissance du visage : servis une fois, gardés un an.
    location /models/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Les fichiers compilés de Next.js : jamais modifiés une fois publiés.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # Les PDF (bons, feuilles, articles) se fabriquent en quelques secondes.
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
