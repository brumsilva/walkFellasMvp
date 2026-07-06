# ============================================================
# walkFellas Backend — Dockerfile
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código-fonte
COPY . .

# Porta do backend
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8001/api/ || exit 1

# Iniciar o servidor
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]


