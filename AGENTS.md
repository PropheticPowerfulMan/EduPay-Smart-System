# Consignes Codex pour ce depot

- A la fin d'une session de developpement, verifier `git status --short`.
- Si des changements doivent etre conserves, lancer `pnpm session:save` depuis la racine du depot.
- Cette commande ajoute les fichiers modifies, cree un commit horodate et pousse la branche courante vers GitHub.
- Si le depot est en `HEAD` detache, rattacher d'abord le travail a une branche, de preference `master`.
