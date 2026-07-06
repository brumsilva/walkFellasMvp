# ============================================================
# walkFellas Frontend — Dockerfile (Development)
# ============================================================
FROM node:20-slim

WORKDIR /app

# Instalar dependências globais
RUN npm install -g yarn expo-cli

# Copiar package files
COPY package.json yarn.lock ./

# Instalar dependências
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install

# Copiar código-fonte
COPY . .

# Porta do Expo
EXPOSE 3000

# Iniciar Expo
CMD ["npx", "expo", "start", "--port", "3000"]


