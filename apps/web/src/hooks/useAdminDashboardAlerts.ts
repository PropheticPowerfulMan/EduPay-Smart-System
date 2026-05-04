import { useEffect, useState } from "react";
import { api } from "../services/api";

export type AlertType = "danger" | "warning" | "info" | "success";
export type DashboardAlert = {
  type: AlertType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function useAdminDashboardAlerts() {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAlerts() {
      // Simuler des alertes intelligentes (à remplacer par des vraies requêtes)
      const alerts: DashboardAlert[] = [];
      try {
        // 1. Retards croissants
        const overdue = await api<{ overdueParents: number }>("/api/analytics/overdue-parents").catch(() => ({ overdueParents: 0 }));
        if (overdue.overdueParents > 5) {
          alerts.push({
            type: "warning",
            title: "Parents en retard",
            message: `Il y a ${overdue.overdueParents} parents avec des retards de paiement importants. Relancez-les pour éviter des pertes.`,
            actionLabel: "Voir la liste",
            onAction: () => { window.location.hash = "/parents?filter=overdue"; }
          });
        }
        // 2. Anomalies de paiement
        const anomalies = await api<{ anomalies: number }>("/api/analytics/payment-anomalies").catch(() => ({ anomalies: 0 }));
        if (anomalies.anomalies > 0) {
          alerts.push({
            type: "danger",
            title: "Anomalies détectées",
            message: `${anomalies.anomalies} transactions suspectes détectées. Vérifiez les journaux d'audit.`,
            actionLabel: "Voir l'audit",
            onAction: () => { window.location.hash = "/"; }
          });
        }
        // 3. Santé technique
        const health = await api<{ dbOk: boolean; lastBackup: string }>("/api/analytics/system-health").catch(() => ({ dbOk: true, lastBackup: "?" }));
        if (!health.dbOk) {
          alerts.push({
            type: "danger",
            title: "Base de données inaccessible",
            message: "La base de données ne répond pas. Vérifiez le serveur immédiatement.",
          });
        }
        if (health.lastBackup && Date.now() - new Date(health.lastBackup).getTime() > 1000 * 60 * 60 * 24) {
          alerts.push({
            type: "warning",
            title: "Sauvegarde ancienne",
            message: `La dernière sauvegarde date du ${health.lastBackup}. Lancez une sauvegarde pour éviter toute perte de données.`,
            actionLabel: "Sauvegarder maintenant",
            onAction: () => { window.location.hash = "/"; }
          });
        }
        // 4. Prévision de trésorerie (exemple statique)
        const forecast = await api<{ nextMonthRevenue: number; risk: number }>("/api/analytics/forecast").catch(() => ({ nextMonthRevenue: 0, risk: 0 }));
        if (forecast.risk > 0.2) {
          alerts.push({
            type: "info",
            title: "Risque de trésorerie",
            message: `Prévision : risque de baisse de revenus de ${Math.round(forecast.risk * 100)}% le mois prochain.`
          });
        }
      } catch {
        // ignore
      }
      if (!cancelled) setAlerts(alerts);
    }
    fetchAlerts();
    return () => { cancelled = true; };
  }, []);

  return alerts;
}
