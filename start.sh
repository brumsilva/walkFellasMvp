#!/usr/bin/env bash
# ============================================================
# walkFellas — Local Development Start Script
# ============================================================
# Uso: ./start.sh
#
# Inicia o backend (FastAPI) e o frontend (Expo) simultaneamente.
# O backend usa Supabase PostgreSQL como banco de dados (cloud).
# Não é necessário instalar nenhum banco de dados local.
#
# Pré-requisitos:
#   - Python 3.11+
#   - Node.js 18+ e Yarn (ou npm)
#   - Arquivo backend/.env configurado com as keys do Supabase
# ============================================================
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RED='33[0;31m'
GREEN='33[0;32m'
YELLOW='33[1;33m'
BLUE='33[0;34m'
NC='33[0m'

echo -e "${BLUE}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         walkFellas — Local Dev           ║"
echo "  ║     Backend: FastAPI + Supabase          ║"
echo "  ║     Frontend: Expo (React Native)        ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ------- Check prerequisites -------
check_command() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}ERRO: '$1' não encontrado. Instale antes de continuar.${NC}"
        exit 1
    fi
}

check_command python3
check_command node
check_command pip

echo -e "${GREEN}Python:${NC}  $(python3 --version)"
echo -e "${GREEN}Node:${NC}    $(node --version)"
echo -e "${GREEN}npm:${NC}     $(npm --version 2>/dev/null || echo 'N/A')"
echo ""

# ------- Validate .env files -------
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}ERRO: backend/.env não encontrado!${NC}"
    echo -e "Copie o template e preencha suas keys:"
    echo -e "  cp backend/.env.example backend/.env"
    exit 1
fi

# Check required vars in backend/.env
for VAR in SUPABASE_URL SUPABASE_SERVICE_KEY JWT_SECRET; do
    if ! grep -q "^$VAR=" "$BACKEND_DIR/.env" 2>/dev/null; then
        echo -e "${RED}ERRO: $VAR não definido em backend/.env${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓${NC} backend/.env validado"

# Create frontend .env if missing
if [ ! -f "$FRONTEND_DIR/.env" ]; then
    echo "EXPO_PUBLIC_BACKEND_URL=http://localhost:8001" > "$FRONTEND_DIR/.env"
    echo -e "${YELLOW}→ Criado frontend/.env com EXPO_PUBLIC_BACKEND_URL=http://localhost:8001${NC}"
fi
echo -e "${GREEN}✓${NC} frontend/.env validado"
echo ""

# ------- Install Backend Dependencies -------
echo -e "${BLUE}[1/4] Instalando dependências do backend...${NC}"
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "  ${GREEN}✓${NC} Virtualenv criado"
fi
source venv/bin/activate
pip install -q -r requirements.txt
echo -e "  ${GREEN}✓${NC} Dependências Python instaladas"
echo ""

# ------- Install Frontend Dependencies -------
echo -e "${BLUE}[2/4] Instalando dependências do frontend...${NC}"
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    if command -v yarn &>/dev/null; then
        yarn install --frozen-lockfile 2>/dev/null || yarn install
    else
        npm install
    fi
fi
echo -e "  ${GREEN}✓${NC} Dependências Node instaladas"
echo ""

# ------- Seed Database -------
echo -e "${BLUE}[3/4] Verificando seed do banco de dados...${NC}"
cd "$BACKEND_DIR"
source venv/bin/activate
python3 -c "
import asyncio, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv('.env')
from supabase_db import SupabaseDB
import os

async def check():
    db = SupabaseDB(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
    u = await db.find_one('users', {'email': 'admin@walkfellas.io'})
    await db.close()
    return u is not None

result = asyncio.run(check())
if result:
    print('  Seed já existe no Supabase')
else:
    print('  Tabelas vazias — o seed será executado no startup do backend')
" 2>/dev/null || echo -e "  ${YELLOW}Aviso: não foi possível verificar seed (será tentado no startup)${NC}"
echo ""

# ------- Start Services -------
echo -e "${BLUE}[4/4] Iniciando serviços...${NC}"
echo ""

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Encerrando serviços...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}Serviços encerrados.${NC}"
}
trap cleanup EXIT INT TERM

# Start backend
cd "$BACKEND_DIR"
source venv/bin/activate
echo -e "${GREEN}▶ Backend${NC} iniciando em http://localhost:8001"
uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
sleep 2

# Start frontend
cd "$FRONTEND_DIR"
echo -e "${GREEN}▶ Frontend${NC} iniciando em http://localhost:3000"
npx expo start --port 3000 &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  walkFellas está rodando!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "  Backend API:   ${BLUE}http://localhost:8001/api/${NC}"
echo -e "  Frontend Web:  ${BLUE}http://localhost:3000${NC}"
echo -e "  Expo Go (QR):  ${BLUE}Escaneie o QR no terminal${NC}"
echo ""
echo -e "  Credenciais de teste:"
echo -e "    Admin:      admin@walkfellas.io / admin123"
echo -e "    Supervisor: sup@walkfellas.io / sup123"
echo -e "    Walker:     FEST01 + PIN 1234 (Jake Miller)"
echo ""
echo -e "  Pressione ${RED}Ctrl+C${NC} para parar."
echo ""

wait


