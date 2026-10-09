#!/bin/sh
# Reconstruye y relanza el servidor de producción en el puerto 3210 (Windows + Git Bash).
PID=$(netstat -ano | grep ":3210 " | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "$PID" ]; then taskkill //F //PID "$PID" > /dev/null 2>&1; sleep 2; fi
pnpm build > /tmp/next-build.log 2>&1 || { tail -30 /tmp/next-build.log; exit 1; }
(nohup pnpm exec next start -p 3210 > /tmp/next3210.log 2>&1 &)
sleep 7
curl -s -o /dev/null -w "servidor 3210: %{http_code}\n" http://localhost:3210/city/malaga/viewer
