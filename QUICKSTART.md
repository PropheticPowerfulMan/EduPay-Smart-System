# Démarrer EduPay en Local – Guide Rapide

## ✅ Prérequis faits :
- ✓ pnpm install
- ✓ PostgreSQL local disponible sur localhost:5432
- ✓ apps/api/.env configuré

## 🚀 Lancer l'appli

### Terminal 1 – Backend (API)
```powershell
cd apps/api
copy .env.example .env
# pour le mode ecosysteme local, gardez DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupay?schema=public
pnpm dev
```

Vous verrez :
```
API running on port 4000
```

### Terminal 2 – Frontend (Web)
```powershell
cd apps/web
pnpm dev
```

Vous verrez :
```
VITE v5.4.8  ready in XXX ms

➜  Local:   http://localhost:5173/
```

### Terminal 3 (optionnel) – Service IA
```powershell
cd apps/ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 📱 Accès

1. Ouvrir http://localhost:5173
2. Login: **admin@school.com** / **password123**
3. Login parent partagé possible via **access_code** SAVANEX dans EduPay
4. Explorer Dashboard, Paiements, Suivi Parent, Assistant IA

## Notes

- Mode réel validé avec PostgreSQL local et Prisma
- Une fois que vous voulez une DB réelle, configurer PostgreSQL + `.env` + `pnpm prisma migrate dev`
- AI service est optionnel pour une démo basique
