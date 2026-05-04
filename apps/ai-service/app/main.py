from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

app = FastAPI(title="EduPay AI Service", version="1.0.0")


class AssistantQuery(BaseModel):
    query: str


class RiskRequest(BaseModel):
    payment_delay_days: float
    payment_ratio: float
    missed_months: int


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai"}


@app.post("/risk/score")
def risk_score(payload: RiskRequest):
    score = 0.45 * payload.payment_delay_days + 0.4 * (1 - payload.payment_ratio) * 100 + 0.15 * payload.missed_months * 10
    score = max(0, min(score, 100))

    if score < 35:
        category = "Low risk"
    elif score < 70:
        category = "Medium risk"
    else:
        category = "High risk"

    return {
        "score": round(score, 2),
        "category": category,
        "recommended_tone": "soft" if score < 60 else "urgent"
    }


@app.get("/forecast/revenue")
def forecast_revenue():
    months = np.array([1, 2, 3, 4, 5, 6]).reshape(-1, 1)
    revenues = np.array([12000, 15000, 14000, 16500, 17000, 18000])
    model = LinearRegression()
    model.fit(months, revenues)
    next_month = np.array([[7]])
    prediction = model.predict(next_month)[0]
    return {"next_month_revenue": float(round(prediction, 2))}


@app.get("/insights")
def insights():
    df = pd.DataFrame(
        [
            {"class": "Grade 1", "unpaid_rate": 0.18},
            {"class": "Grade 2", "unpaid_rate": 0.27},
            {"class": "Grade 3", "unpaid_rate": 0.40},
        ]
    )
    high = df[df["unpaid_rate"] > 0.3]

    suggestions = [
        "Send reminder to 25 parents",
        "Review Grade 3 payment plan",
        "Escalate high-risk accounts to accountant",
    ]

    return {
        "anomalies": high.to_dict(orient="records"),
        "suggestions": suggestions,
        "summary": "Grade 3 has elevated unpaid fees and requires immediate follow-up."
    }


@app.post("/assistant/query")
def assistant_query(payload: AssistantQuery):
    q = payload.query.lower()

    if "didn't pay" in q or "did not pay" in q or "n'ont pas paye" in q:
        answer = "25 parents have not paid this month."
        suggestions = ["Send soft reminders now", "Escalate 7 high-risk parents in 72h"]
    elif "total revenue" in q or "revenu total" in q:
        answer = "Total revenue for the current term is 142,500."
        suggestions = ["Compare with last term", "Forecast next month"]
    elif "highest debt" in q or "plus forte dette" in q:
        answer = "Grade 3 currently has the highest debt."
        suggestions = ["Notify class lead", "Propose staggered payment options"]
    else:
        answer = "Query understood. Detailed analytics are available in dashboard insights."
        suggestions = ["Try asking by class", "Try asking by month"]

    return {"answer": answer, "suggestions": suggestions}
