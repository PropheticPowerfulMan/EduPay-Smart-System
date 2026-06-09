# 🚀 LANCER EDUPAY - GUIDE RAPIDE

## 1️⃣ Mode Développement (La Plus Rapide)

Ouvrez 2 terminaux PowerShell:

**Terminal 1 - API**:
```powershell
cd apps\api
copy .env.example .env
# si vous utilisez l'ecosysteme local, gardez DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupay?schema=public
pnpm dev
```

**Terminal 2 - Frontend**:
```powershell
cd apps\web
pnpm dev
```

✅ Ouvrez: **http://localhost:5173**

📧 Login: `admin@school.com` / `password123`

Accès partagé validé localement : un parent SAVANEX peut aussi se connecter à EduPay avec son `access_code` généré.

---

## 2️⃣ Mode Docker (Avec Base de Données)

```powershell
# Copier configuration
copy .env.example .env

# Démarrer tous les services
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

---

## 3️⃣ Mettre en Ligne (Production)

### **Option A: Render.com (Recommandé - Facile)**

1. Créer compte: https://render.com
2. Lier votre repo GitHub
3. Créer "New Project" → "Blueprint"
4. Configurer variables `.env` dans le dashboard
5. Cliquer "Deploy"

**Résultat**: Application en ligne en 2-3 minutes! 🎉

### **Option B: Vercel (Frontend Seulement)**

```powershell
npm i -g vercel
cd apps\web
vercel
```

### **Option C: Netlify**

```powershell
npm i -g netlify-cli
cd apps\web
netlify deploy --prod --dir=dist
```

---

## 📚 Documentation Complète

Voir: **DEPLOYMENT_GUIDE.md**

---

## ✅ Checklist

- [ ] Node.js installé (v24+)
- [ ] `pnpm dev` fonctionne localement
- [ ] GitHub repo créé
- [ ] Compte Render.com créé
- [ ] Déploiement lancé
- [ ] Application en ligne testée

---

## 🆘 Problèmes?

**Port 4000/5173 occupé?**
```powershell
netstat -ano | findstr :4000
taskkill /PID xxxxx /F
```

**Dépendances?**
```powershell
pnpm install
```

**Logs d'erreur?**
```powershell
docker-compose logs api
docker-compose logs web
```

---

## 🎯 Prochaines Étapes

1. Tester localement (`pnpm dev`)
2. Pusher sur GitHub
3. Déployer sur Render.com
4. Configurer domaine custom (optionnel)
5. Monitorer performance
