# walkFellas

**Sistema POS mobile para walkers em eventos e festivais.**

walkers percorrem o recinto vendendo bebidas/snacks com terminais de pagamento Revolut. Supervisores gerenciam turnos, estoque e validações. Admins configuram eventos, catálogo e equipe.

---

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Expo App   │────▶│  FastAPI      │────▶│  Supabase       │
│  (React     │     │  Backend      │     │  (PostgreSQL)   │
│   Native)   │     │  :8001        │     │  Cloud          │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────▼───────┐
                    │  Revolut     │
                    │  Business    │
                    │  (Terminais) │
                    └──────────────┘
```

| Componente | Tecnologia |
|------------|------------|
| Frontend | Expo + React Native + expo-router |
| Backend | FastAPI (Python 3.11+) |
| Banco de Dados | Supabase (PostgreSQL via REST API) |
| Pagamentos | Revolut Business Merchant API |
| Autenticação | JWT customizado (bcrypt) |

---

## Execução Local

### Pré-requisitos

- **Python 3.11+**
- **Node.js 18+** e **Yarn** (ou npm)
- Conta no [Supabase](https://supabase.com) com projeto criado

### 1. Clone e configure

```bash
git clone <repo-url>
cd walkfellas
```

### 2. Configure as variáveis de ambiente

```bash
# Backend
cp backend/.env.example backend/.env
# Edite backend/.env com suas keys do Supabase:
#   SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, JWT_SECRET

# Frontend
cp frontend/.env.example frontend/.env
# Para dev local, o padrão já funciona (http://localhost:8001)
```

### 3. Crie as tabelas no Supabase

No Supabase Dashboard → SQL Editor → New Query, cole e execute o conteúdo de:

```
backend/schema.sql
```

### 4. Inicie o aplicativo

```bash
chmod +x start.sh
./start.sh
```

Ou manualmente:

```bash
# Terminal 1 — Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — Frontend
cd frontend
yarn install
npx expo start --port 3000
```

### 5. Docker (alternativo)

```bash
# Configure backend/.env primeiro, depois:
docker-compose up --build
```

---

## Credenciais de Teste

O backend executa o seed automaticamente no startup:

| Role | Login | Senha/PIN |
|------|-------|-----------|
| Admin | admin@walkfellas.io | admin123 |
| Supervisor | sup@walkfellas.io | sup123 |
| Walker (Jake) | Evento: FEST01 | PIN: 1234 |
| Walker (Luca) | Evento: FEST01 | PIN: 5678 |
| Walker (Maya) | Evento: FEST01 | PIN: 9012 |

---

## Endpoints da API

Base URL: `http://localhost:8001/api`

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/walker/login` | Login walker (event_code + PIN) |
| POST | `/auth/staff/login` | Login admin/supervisor (email + password) |
| GET | `/auth/me` | Dados do usuário logado |
| POST | `/auth/walker/accept-terms` | Aceitar termos de uso |

### Eventos & Catálogo
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/events` | Listar/criar eventos |
| PUT | `/events/:id` | Atualizar evento |
| GET/POST | `/products` | Listar/criar produtos |
| PUT | `/products/:id` | Atualizar produto |

### Walkers & Equipe
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/walkers` | Listar/criar walkers |
| POST | `/staff` | Criar admin/supervisor |
| PUT | `/walkers/:id/terminal` | Atribuir terminal Revolut |

### Turnos & Vendas
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/shifts/assign-bag` | Atribuir bag (supervisor) |
| GET | `/shifts/current` | Turno atual + estoque |
| POST | `/shifts/close` | Fechar turno (reconciliação) |
| POST | `/shifts/:id/confirm` | Confirmar turno (supervisor) |
| POST | `/sales` | Registrar venda |

### Desperdício & Reabastecimento
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/waste` | Listar/registrar desperdício |
| POST | `/waste/:id/validate` | Validar desperdício |
| GET/POST | `/restocks` | Listar/solicitar reabastecimento |
| POST | `/restocks/:id/approve` | Aprovar reabastecimento |
| GET | `/restocks/suggestions` | Sugestões automáticas |

### Pagamentos Revolut
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/payments/revolut/charge` | Iniciar cobrança |
| GET | `/payments/revolut/:id/status` | Status do pagamento |
| POST | `/payments/revolut/:id/simulate` | Simular pagamento (dev) |
| POST | `/payments/revolut/:id/cancel` | Cancelar pagamento |
| POST | `/payments/revolut/webhook` | Webhook Revolut |

### Dashboard
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/dashboard/overview` | Visão geral |
| GET | `/dashboard/active-walkers` | Walkers ativos |

---

## Schema do Banco de Dados

Ver `backend/schema.sql` para o schema completo. Tabelas:

- `users` — walkers, supervisors, admins
- `events` — eventos/festivais
- `products` — catálogo de produtos por evento
- `shifts` — turnos de trabalho
- `movements` — ledger de estoque (auditável)
- `sales` — vendas registradas
- `waste_logs` — registros de desperdício
- `restocks` — solicitações de reabastecimento
- `pending_payments` — pagamentos pendentes (Revolut)
- `revolut_terminals` — terminais Revolut sincronizados

---

## Integração Revolut (Opcional)

1. Obtenha acesso à API Merchant no Revolut Business Dashboard
2. Configure em `backend/.env`:
   ```
   REVOLUT_ENV=sandbox
   REVOLUT_MERCHANT_SECRET_KEY=sk_...
   REVOLUT_WEBHOOK_SECRET=whsec_...
   ```
3. Reinicie o backend
4. Execute `POST /api/admin/revolut/sync-terminals` para sincronizar terminais
5. Atribua terminais aos walkers via `PUT /api/walkers/:id/terminal`

---

## Estrutura do Projeto

```
walkfellas/
├── backend/
│   ├── server.py           # API FastAPI principal
│   ├── supabase_db.py      # Wrapper Supabase PostgREST
│   ├── revolut_service.py  # Integração Revolut Business
│   ├── schema.sql          # Schema PostgreSQL
│   ├── requirements.txt    # Dependências Python
│   ├── Dockerfile          # Container backend
│   ├── .env                # Variáveis de ambiente (local)
│   └── .env.example        # Template
├── frontend/
│   ├── app/                # Telas (expo-router)
│   │   ├── index.tsx       # Login
│   │   ├── (walker)/       # Telas walker (POS, restock, etc)
│   │   ├── (supervisor)/   # Telas supervisor
│   │   └── (admin)/        # Telas admin
│   ├── src/
│   │   ├── lib/api.ts      # Cliente API
│   │   └── components/     # Componentes compartilhados
│   ├── app.json            # Config Expo
│   ├── package.json        # Dependências Node
│   ├── Dockerfile          # Container frontend
│   ├── .env                # Variáveis de ambiente
│   └── .env.example        # Template
├── docker-compose.yml      # Orquestração Docker
├── start.sh                # Script de inicialização local
├── entrypoint.sh           # Entrypoint Docker/K8s
└── README.md               # Este arquivo
```

---

## Licença

Projeto privado.

