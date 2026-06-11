import db from '../db/database.js';
import config from '../config.js';

/**
 * Log a single API usage event
 */
export function logUsage(model, promptTokens, completionTokens, operation) {
  const totalTokens = promptTokens + completionTokens;

  // Calculate cost based on model pricing (per million tokens)
  const pricing = config.gemini.pricing[model] || { input: 0, output: 0 };
  const estimatedCost = (promptTokens / 1_000_000) * pricing.input +
                        (completionTokens / 1_000_000) * pricing.output;

  db.prepare(`
    INSERT INTO token_usage (model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, operation)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(model, promptTokens, completionTokens, totalTokens, estimatedCost, operation);
}

/**
 * Get usage summary for the current billing period
 */
export function getUsageSummary() {
  // Get first day of current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const monthlySummary = db.prepare(`
    SELECT 
      COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as total_cost,
      COUNT(*) as total_requests
    FROM token_usage
    WHERE timestamp >= ?
  `).get(monthStart);

  // Today's usage
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todaySummary = db.prepare(`
    SELECT 
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as total_cost,
      COUNT(*) as total_requests
    FROM token_usage
    WHERE timestamp >= ?
  `).get(todayStart);

  // Per-model breakdown this month
  const modelBreakdown = db.prepare(`
    SELECT 
      model,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as cost,
      COUNT(*) as requests
    FROM token_usage
    WHERE timestamp >= ?
    GROUP BY model
  `).all(monthStart);

  // Per-operation breakdown
  const operationBreakdown = db.prepare(`
    SELECT 
      operation,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as cost,
      COUNT(*) as requests
    FROM token_usage
    WHERE timestamp >= ?
    GROUP BY operation
  `).all(monthStart);

  // Spend cap from settings
  const spendCapStr = db.prepare('SELECT value FROM settings WHERE key = ?').get('monthly_spend_cap');
  const spendCap = spendCapStr ? parseFloat(spendCapStr.value) : config.defaults.monthlySpendCap;

  // Calculate percentage and status
  const percentage = spendCap > 0 ? (monthlySummary.total_cost / spendCap) * 100 : 0;
  let status = 'green';
  if (percentage >= 95) status = 'critical';
  else if (percentage >= 90) status = 'red';
  else if (percentage >= 75) status = 'orange';
  else if (percentage >= 50) status = 'yellow';

  // Project monthly cost based on usage so far
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedCost = dayOfMonth > 0 ? (monthlySummary.total_cost / dayOfMonth) * daysInMonth : 0;

  return {
    month: {
      promptTokens: monthlySummary.total_prompt_tokens,
      completionTokens: monthlySummary.total_completion_tokens,
      totalTokens: monthlySummary.total_tokens,
      cost: Math.round(monthlySummary.total_cost * 10000) / 10000,
      requests: monthlySummary.total_requests
    },
    today: {
      totalTokens: todaySummary.total_tokens,
      cost: Math.round(todaySummary.total_cost * 10000) / 10000,
      requests: todaySummary.total_requests
    },
    spendCap,
    percentage: Math.round(percentage * 100) / 100,
    status,
    projectedCost: Math.round(projectedCost * 10000) / 10000,
    modelBreakdown,
    operationBreakdown
  };
}

/**
 * Get daily usage history for charts
 */
export function getUsageHistory(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return db.prepare(`
    SELECT 
      DATE(timestamp) as date,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as cost,
      COUNT(*) as requests
    FROM token_usage
    WHERE timestamp >= ?
    GROUP BY DATE(timestamp)
    ORDER BY date
  `).all(startDate.toISOString());
}

/**
 * Check if spending is near the cap (for warning dialog)
 */
export function isNearSpendCap() {
  const summary = getUsageSummary();
  return {
    nearCap: summary.percentage >= 95,
    percentage: summary.percentage,
    remaining: Math.max(0, summary.spendCap - summary.month.cost),
    status: summary.status
  };
}
