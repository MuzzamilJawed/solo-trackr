// Thresholds for the holding notifications (edited in Settings). One rule set
// applies to EVERY holding. Stored in the browser; a value of 0 switches that
// rule off.

export interface HoldingAlertRules {
    enabled: boolean;
    stopLoss: number; // notify when P/L vs average cost <= -stopLoss %
    target: number;   // notify when P/L vs average cost >= +target %
    dayMove: number;  // notify when |today's move| >= dayMove %
}

export const RULES_KEY = "portfolio.holdingAlerts.v1";
export const DEFAULT_RULES: HoldingAlertRules = { enabled: true, stopLoss: 10, target: 20, dayMove: 5 };

export const loadRules = (): HoldingAlertRules => {
    try {
        const raw = JSON.parse(localStorage.getItem(RULES_KEY) || "null");
        return raw && typeof raw === "object" ? { ...DEFAULT_RULES, ...raw } : DEFAULT_RULES;
    } catch {
        return DEFAULT_RULES;
    }
};

export const saveRules = (rules: HoldingAlertRules) => {
    try {
        localStorage.setItem(RULES_KEY, JSON.stringify(rules));
        window.dispatchEvent(new Event("holding-alert-rules"));
    } catch { /* private mode */ }
};
