import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "../i18n";
import { api } from "../services/api";
import { useAdminDashboardAlerts } from "../hooks/useAdminDashboardAlerts";

type Overview = {
  totalRevenue: number;
  monthlyRevenue: number;
  paymentSuccessRate: number;
  outstandingDebt: number;
};

export function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const alerts = useAdminDashboardAlerts();

  useEffect(() => {
    api<Overview>("/api/analytics/overview")
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const display: Overview = data ?? { totalRevenue: 0, monthlyRevenue: 0, paymentSuccessRate: 0, outstandingDebt: 0 };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse">
        <div className="h-12 w-12 bg-gradient-to-r from-brand-500 to-accent rounded-lg"></div>
      </div>
    </div>
  );

  const kpis = [
    { 
      label: t("totalRevenue"), 
      value: `$${display.totalRevenue.toLocaleString()}`, 
      icon: "💰", 
      gradient: "from-blue-500 to-blue-600",
      color: "text-blue-400"
    },
    { 
      label: t("monthlyRevenue"), 
      value: `$${display.monthlyRevenue.toLocaleString()}`, 
      icon: "📈", 
      gradient: "from-emerald-500 to-emerald-600",
      color: "text-emerald-400"
    },
    { 
      label: t("successRate"), 
      value: `${display.paymentSuccessRate.toFixed(1)}%`, 
      icon: "✓", 
      gradient: "from-amber-500 to-amber-600",
      color: "text-amber-400"
    },
    { 
      label: t("outstandingDebt"), 
      value: `$${display.outstandingDebt.toLocaleString()}`, 
      icon: "⚠", 
      gradient: "from-red-500 to-red-600",
      color: "text-red-400"
    }
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="space-y-2 animate-fadeInDown">
        <h1 className="font-display text-3xl font-bold text-white">{t("dashboardTitle")}</h1>
        <p className="text-ink-dim">{t("financialPerformance")}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <div 
            key={kpi.label}
            className="card group overflow-hidden relative"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            {/* Background gradient effect */}
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.gradient} opacity-0 group-hover:opacity-5 transition-all duration-500`}></div>
            
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className={`text-4xl ${kpi.color}`}>{kpi.icon}</div>
                <div className={`text-xs px-2 py-1 rounded-full bg-${kpi.color.split('-')[1]}-900/20 border border-${kpi.color.split('-')[1]}-700/50 text-${kpi.color.split('-')[1]}-300`}>
                  {t("active")}
                </div>
              </div>
              <p className="text-ink-dim text-sm mb-2">{kpi.label}</p>
              <p className={`font-display text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <div className="card animate-fadeInLeft">
          <div className="mb-6">
            <h3 className="font-display text-lg font-bold text-white">{t("financialPerformance")}</h3>
            <p className="text-xs text-ink-dim mt-1">{t("monthlyAnalysis")}</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: t("totalRevenue"), value: display.totalRevenue },
                { name: t("monthlyRevenue"), value: display.monthlyRevenue },
                { name: t("outstandingDebt"), value: display.outstandingDebt }
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="name" stroke="#cbd5e1" style={{ fontSize: "12px" }} />
                <YAxis stroke="#cbd5e1" style={{ fontSize: "12px" }} />
                <Tooltip 
                  contentStyle={{ 
                    background: "#1a2847", 
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    borderRadius: "8px"
                  }}
                  cursor={{ fill: "rgba(99, 102, 241, 0.1)" }}
                />
                <Legend />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card animate-fadeInRight">
          <div className="mb-6">
            <h3 className="font-display text-lg font-bold text-white">{t("paymentStatus")}</h3>
            <p className="text-xs text-ink-dim mt-1">{t("paymentDistribution")}</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: t("success"), value: display.paymentSuccessRate, fill: "#10b981" },
                    { name: t("risk"), value: 100 - display.paymentSuccessRate, fill: "#ef4444" }
                  ]}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.value.toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    background: "#1a2847", 
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    borderRadius: "8px"
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="card glass animate-fadeInUp">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <p className="text-ink-dim text-sm">{t("systemStatus")}</p>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              <p className="font-semibold text-green-400">{t("operational")}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-ink-dim text-sm">{t("lastUpdate")}</p>
            <p className="font-semibold text-white">{new Date().toLocaleDateString()}</p>
          </div>
          <div className="space-y-2">
            <p className="text-ink-dim text-sm">{t("dataQuality")}</p>
            <p className="font-semibold text-brand-300">100%</p>
          </div>
        </div>
      </div>

      {/* Alertes intelligentes */}
      {alerts.length > 0 && (
        <div className="space-y-3 animate-fadeInDown">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-lg border-l-4 p-4 shadow-lg ${
              a.type === "danger" ? "border-red-500 bg-red-900/20 text-red-200" :
              a.type === "warning" ? "border-amber-500 bg-amber-900/20 text-amber-200" :
              a.type === "info" ? "border-cyan-500 bg-cyan-900/20 text-cyan-200" :
              "border-emerald-500 bg-emerald-900/20 text-emerald-200"
            }`}>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{a.title}</span>
                {a.actionLabel && a.onAction && (
                  <button onClick={a.onAction} className="ml-auto px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">
                    {a.actionLabel}
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions d'action */}
      <div className="card animate-fadeInUp">
        <h2 className="font-display text-xl font-bold text-white mb-2">Suggestions d'action</h2>
        <ul className="list-disc pl-6 text-ink-dim text-sm space-y-1">
          <li>Relancer les parents en retard automatiquement.</li>
          <li>Vérifier les transactions suspectes dans l'audit.</li>
          <li>Planifier une sauvegarde si la dernière date est ancienne.</li>
          <li>Analyser la projection de trésorerie pour anticiper les risques.</li>
          <li>Consulter le rapport de couverture par classe et par niveau.</li>
        </ul>
      </div>
    </div>
  );
}
