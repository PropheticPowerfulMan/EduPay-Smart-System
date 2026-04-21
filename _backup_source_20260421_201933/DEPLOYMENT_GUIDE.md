# 🚀 Guide de Lancement et Déploiement - EduPay Smart System

---

## 📋 Prérequis Globaux

### Installation Locale
```bash
# 1. Node.js (v24+) et npm
node --version  # doit être v24+
npm --version

# 2. pnpm (gestionnaire de packages)
npm install -g pnpm@9.0.0

# 3. Python 3.10+ (pour service IA optionnel)
python --version

# 4. PostgreSQL + Redis (optionnel, pour production)
# Ou utiliser Docker
```

---

## 🎯 PHASE 1: Développement Local

### Option A: Mode Rapide (Sans Base de Données)

**Terminal 1 - API Backend**
```powershell
cd apps/api
npm run dev
```
Affichera:
```
✓ API server running on http://localhost:4000
✓ Default login: admin@school.com / password123
```

**Terminal 2 - Frontend**
```powershell
cd apps/web
npm run dev
```
Affichera:
```
➜  Local: http://localhost:5173/
```

✅ **Ouvrez**: http://localhost:5173
✅ **Login**: admin@school.com / password123

---

### Option B: Mode Complet avec Docker

**Créer fichier `.env`** à la racine:
```env
POSTGRES_USER=edupay_user
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=edupay_db
DATABASE_URL=postgresql://edupay_user:secure_password_here@postgres:5432/edupay_db
REDIS_URL=redis://redis:6379
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
```

**Lancer tout avec Docker**:
```powershell
# Lancer tous les services
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

Services disponibles:
- Frontend: http://localhost:5173
- API: http://localhost:4000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- AI Service: http://localhost:8000

---

## 🏢 PHASE 2: Production Locale

### Build de la Frontend
```powershell
cd apps/web
npm run build
# Crée: dist/
```

### Build de l'API
```powershell
cd apps/api
npm run build
# Crée: dist/
```

### Lancer en Production Locale
```powershell
# Terminal 1 - API
cd apps/api
npm run start

# Terminal 2 - Frontend
cd apps/web
npm run preview
```

---

## 🌐 PHASE 3: Déploiement en Ligne

### Option 1: **RENDER.COM** (Recommandé - Full Stack)

#### Étape 1: Préparer GitHub
```bash
# Initialiser git
git init
git add .
git commit -m "Initial commit: EduPay Smart System"

# Créer repo sur GitHub et pusher
git remote add origin https://github.com/YOUR_USERNAME/edupay-smart-system.git
git branch -M main
git push -u origin main
```

#### Étape 2: Créer `render.yaml` à la racine
```yaml
services:
  - type: web
    name: edupay-api
    env: node
    buildCommand: cd apps/api && npm install && npm run build
    startCommand: cd apps/api && npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        scope: project
      - key: REDIS_URL
        scope: project
      - key: JWT_SECRET
        scope: project

  - type: web
    name: edupay-web
    env: node
    buildCommand: cd apps/web && npm install && npm run build
    startCommand: npm install -g serve && serve -s dist -l 80
    envVars:
      - key: NODE_ENV
        value: production
      - key: VITE_API_URL
        value: https://edupay-api.onrender.com

  - type: pserv
    name: edupay-postgres
    plan: free
    ipAllowList: []
    envVars:
      - key: POSTGRES_USER
        value: edupay_user
      - key: POSTGRES_PASSWORD
        scope: project
      - key: POSTGRES_DB
        value: edupay_db

  - type: redis
    name: edupay-redis
    plan: free
```

#### Étape 3: Déployer sur Render
1. Aller sur https://render.com
2. Créer compte / login
3. Nouveau projet → "Blueprint" (from render.yaml)
4. Connecter GitHub repo
5. Cliquer "Deploy"

**Résultat**:
- Frontend: https://edupay-web.onrender.com
- API: https://edupay-api.onrender.com
- Coût: ~$7/mois (gratuit avec limites)

---

### Option 2: **VERCEL** (Frontend Seulement)

Parfait si API est ailleurs (Render, Heroku, etc.)

```bash
# Installation
npm i -g vercel

# Déployer frontend
cd apps/web
vercel
```

Configurer variables d'environnement dans Vercel:
```
VITE_API_URL = https://edupay-api.onrender.com
```

**Résultat**: Frontend en 30 secondes sur vercel.app

---

### Option 3: **NETLIFY** (Alternative Frontend)

```bash
# CLI Netlify
npm i -g netlify-cli

# Login et deploy
cd apps/web
netlify deploy --prod --dir=dist
```

**Résultat**: Frontend sur netlify.app

---

### Option 4: **RAILWAY.APP** (Full Stack)

1. Créer compte: https://railway.app
2. "New Project" → GitHub repo
3. Auto-detect services (Node.js, PostgreSQL, Redis)
4. Configurer variables `.env`
5. Deploy

**Coût**: $5 crédit gratuit/mois

---

## 🔧 Variables d'Environnement Production

**Créer `.env.production`** pour déploiement:
```env
# Node
NODE_ENV=production

# Base de données
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://redis-host:6379

# Authentification
JWT_SECRET=generate_strong_secret_key_here

# Frontend
VITE_API_URL=https://your-api-domain.com

# AI Service (optionnel)
PYTHON_ENV=production
```

---

## 🛡️ Sécurité Production

### Checklist Avant Déploiement

```bash
# 1. Générer JWT secret fort
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Vérifier variables env
cat .env.production

# 3. Tester build
npm run build
npm run preview

# 4. Logs
# Monitorer les erreurs via dashboard Render/Vercel
```

### Secrets à Sauvegarder (JAMAIS sur GitHub)
- JWT_SECRET
- DATABASE_URL
- REDIS_URL
- Credentials DB

---

## 📊 Checklist Déploiement Complet

### Avant Déploiement
- [ ] Tester localement (npm run dev)
- [ ] Build réussit (npm run build)
- [ ] Pas d'erreurs console
- [ ] Variables .env configurées
- [ ] GitHub repo created et pushed

### Déploiement
- [ ] Account Render.com créé
- [ ] Git repo connecté
- [ ] render.yaml en place
- [ ] Database créée (PostgreSQL)
- [ ] Variables d'environnement set
- [ ] Deploy lancé

### Après Déploiement
- [ ] Frontend accessible (URL donnée)
- [ ] API répond (test /api/health)
- [ ] Login fonctionne
- [ ] Dashboard charge
- [ ] Monitorer logs pour erreurs

---

## 🆘 Dépannage

### ❌ "Cannot find module"
```bash
# Réinstaller dépendances
pnpm install
# Ou dans app spécifique
cd apps/api && npm install
```

### ❌ "Port 4000 already in use"
```bash
# Trouver processus
netstat -ano | findstr :4000

# Tuer processus (Windows)
taskkill /PID 12345 /F
```

### ❌ "Database connection failed"
```env
# Vérifier DATABASE_URL
postgresql://user:password@localhost:5432/dbname

# Vérifier PostgreSQL tourne
pg_isready -h localhost
```

### ❌ "CORS error"
```typescript
// apps/api/src/server.ts - ajouter CORS
import cors from 'cors';
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```

---

## 📈 Monitoring Production

### Render Dashboard
1. Login render.com
2. Projet → "Metrics"
3. CPU, Memory, Network

### Logs
```bash
# Render CLI
render logs edupay-api

# Vercel
vercel logs
```

### Alertes
Configurer webhooks Slack/email pour crashes

---

## 💡 Optimisations Production

### Frontend
```bash
# Réduire bundle size
npm run build -- --analyze

# Lazy loading
code-split routes avec React.lazy()
```

### API
- Cache avec Redis
- Compression middleware
- Rate limiting
- Database pooling

### Infrastructure
- CDN pour assets (Cloudflare)
- SSL/TLS (auto avec Render/Vercel)
- Auto-scaling si trafic augmente

---

## 📞 Support

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Next Steps**: Ajouter CI/CD (GitHub Actions)

🎉 **Votre application est prête à monter en production!**
