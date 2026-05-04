# EduPay Smart System

> Plateforme intelligente de paiement et de suivi scolaire – conçue pour les écoles africaines.

---

## Architecture

```
edupay-smart-system/
├── apps/
│   ├── web/          React + Vite + Tailwind + Zustand + PWA
│   ├── api/          Node.js + Express + Prisma + PostgreSQL
│   └── ai-service/   FastAPI + scikit-learn + pandas
├── packages/
│   └── shared/       Types et constantes partagés
├── docker-compose.yml
└── .env.example
```

---

## Démarrage rapide (Docker – recommandé)

### 1. Cloner le projet et copier les variables d'environnement

```bash
cp .env.example .env
# Éditez .env avec vos vraies valeurs (SMTP, AfrikTalk, JWT secret…)
```

### 2. Lancer tous les services

```bash
docker compose up --build
```

Services démarrés :
| Service     | Adresse locale           |
|-------------|--------------------------|
| Web frontend | http://localhost:5173   |
| API backend  | http://localhost:4000   |
| AI service   | http://localhost:8000   |
| PostgreSQL   | localhost:5432          |
| Redis        | localhost:6379          |

### 3. Exécuter les migrations Prisma

```bash
docker exec -it edupay-api npx prisma migrate dev
```

---

## Développement local (sans Docker)

### Prérequis

- Node.js 20+, pnpm 9+
- Python 3.11+
- PostgreSQL 16

### Installation

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# configurer DATABASE_URL dans apps/api/.env
cd apps/api && npx prisma generate && npx prisma migrate dev
```

### Démarrer les services

```bash
# Terminal 1 – API
cd apps/api && pnpm dev

# Terminal 2 – Frontend
cd apps/web && pnpm dev

# Terminal 3 – Service IA
cd apps/ai-service
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## API Routes

| Méthode | Endpoint                          | Description                  |
|---------|-----------------------------------|------------------------------|
| POST    | /api/auth/register                | Créer un compte              |
| POST    | /api/auth/login                   | Authentification JWT         |
| GET     | /api/parents                      | Liste des parents            |
| POST    | /api/parents                      | Ajouter un parent            |
| GET     | /api/parents/me                   | Suivi parent (PARENT role)   |
| POST    | /api/students                     | Ajouter un élève             |
| GET     | /api/classes                      | Liste des classes            |
| POST    | /api/payments                     | Enregistrer un paiement      |
| GET     | /api/payments                     | Historique des paiements     |
| GET     | /api/payments/:id/receipt/pdf     | Télécharger le reçu PDF      |
| GET     | /api/payments/:id/receipt/png     | Télécharger le reçu PNG      |
| GET     | /api/analytics/overview           | KPIs financiers              |
| POST    | /api/notifications/send           | Envoyer une notification     |
| POST    | /api/ai/assistant                 | Assistant IA (NL query)      |
| GET     | /api/ai/insights                  | Insights IA                  |
| GET     | /api/export/payments.xlsx         | Export Excel                 |
| GET     | /api/export/report.pdf            | Rapport PDF                  |

---

## Tests

```bash
# Backend
cd apps/api && pnpm test

# Frontend
cd apps/web && pnpm test
```

---

## Modules implémentés

| Module | Statut |
|--------|--------|
| Authentification JWT + RBAC | ✅ |
| Paiements + numéro transaction unique | ✅ |
| Reçus PDF et PNG | ✅ |
| Anti-doublon + audit logs | ✅ |
| Suivi mensuel parent multi-enfants | ✅ |
| Notifications SMS + Email | ✅ |
| Dashboard analytics Recharts | ✅ |
| Service IA (scoring, prévision, assistant NL) | ✅ |
| Export Excel + PDF | ✅ |
| PWA Offline Mode | ✅ |
| Mobile Money (Airtel, M-Pesa, Orange) | ✅ (structure) |
| Multi-école (schoolId isolant) | ✅ |
| Docker multi-services | ✅ |

---

## Variables d'environnement requises

| Variable | Description |
|----------|-------------|
| DATABASE_URL | URL PostgreSQL |
| JWT_SECRET | Clé secrète JWT (min 32 chars) |
| SMTP_HOST/PORT/USER/PASS | Configuration email Nodemailer |
| AFRIKTALK_USERNAME / AFRIKTALK_API_KEY | Compte et clé API AfrikTalk/Africa's Talking pour SMS réels |
| AFRIKTALK_API_URL | Endpoint SMS, par défaut `https://api.africastalking.com/version1/messaging` |
| AFRIKTALK_SENDER | Nom d'expéditeur SMS approuvé par le fournisseur |
| AI_SERVICE_URL | URL du microservice IA |

---

## Branding

- **Logo** : `apps/web/public/logo-school.png` (remplacer avec votre logo réel)
- **Favicon** : `apps/web/public/favicon.ico`
- **Couleurs** : Bleu `#0b2e59` / Bleu moyen `#1f4f8f` / Blanc / Noir

---

## Contribution

Suivre les conventions Clean Architecture. Chaque module (`payments`, `students`, etc.) doit avoir son routeur, sa validation Zod, et ses tests associés.
