#!/usr/bin/env bash
# ============================================================
# walkFellas — Entrypoint (Docker / K8s / Cloud)
# ============================================================
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ------- Backend Setup -------
echo "[entrypoint] Instalando dependências do backend..."
cd "$ROOT_DIR/backend"
pip install -q -r requirements.txt

# ------- Frontend Setup -------
echo "[entrypoint] Verificando dependências do frontend..."
cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    yarn install --frozen-lockfile 2>/dev/null || yarn install || npm install
fi

# ------- Create frontend .env if missing -------
if [ ! -f "$ROOT_DIR/frontend/.env" ]; then
    APP_URL="${APP_URL:-http://localhost:3000}"
    echo "EXPO_PUBLIC_BACKEND_URL=$APP_URL" > "$ROOT_DIR/frontend/.env"
    echo "[entrypoint] Criado frontend/.env com BACKEND_URL=$APP_URL"
fi

echo "[entrypoint] Setup concluído. Iniciando supervisor..."
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf


