# Démarrer EduPay en Local – Guide Rapide

## ✅ Prérequis faits :
- ✓ npm install apps/web
- ✓ npm install apps/api
- ✓ Créé server-simple.ts (mode test sans DB)

## 🚀 Lancer l'appli (une fois que npm install finit)

### Terminal 1 – Backend (API)
```powershell
cd apps/api
npm run build
npx tsx server-simple.ts
```

ou plus rapidement avec tsx :
```powershell
cd apps/api && npx tsx server-simple.ts
```

Vous verrez :
```
✓ API server running on http://localhost:4000
✓ Default login: admin@school.com / password123
```

### Terminal 2 – Frontend (Web)
```powershell
cd apps/web
npm run dev
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
3. Explorer Dashboard, Paiements, Suivi Parent, Assistant IA

## Notes

- **server-simple.ts** = mock data en mémoire (pas de PostgreSQL requis)
- Une fois que vous voulez une DB réelle, configurer PostgreSQL + .env + `pnpm prisma migrate dev`
- AI service est optionnel pour une démo basique
