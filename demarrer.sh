#!/data/data/com.termux/files/usr/bin/bash
cd ~/distributeur-musique
pkill -f "node server.js" 2>/dev/null
termux-wake-lock 2>/dev/null
nohup node server.js >> serveur.log 2>&1 &
sleep 2
echo "Serveur lancé : http://localhost:3000"
