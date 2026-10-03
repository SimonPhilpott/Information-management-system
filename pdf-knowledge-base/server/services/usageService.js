import db from '../db/database.js';
import config from '../config.js';
import { KNOWN_PRICES } from './modelRegistry.js';

// US$ per 1M tokens: Google's list prices where known, overridden by any set on the Costs page.
export function getPrices() {
  let custom = {};
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('model_prices'); if (r) custom = JSON.parse(r.value); } catch { }
  return { ...KNOWN_PRICES, ...custom };
}

/**
 * Log a single API usage event
 */
export function logUsage(model, promptTokens, completionTokens, operation) {
  const totalTokens = promptTokens + completionTokens;

  // Calculate cost based on model pricing (per million tokens)
  const pricing = getPrices()[model] || { input: 0, output: 0 };
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

  // The cap is in pounds (set on the Costs page); usage is priced in US$, so convert
  let fx = 0.75;
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get('usd_to_gbp'); if (r) fx = Number(JSON.parse(r.value)) || 0.75; } catch { }
  const percentage = spendCap > 0 ? ((monthlySummary.total_cost * fx) / spendCap) * 100 : 0;
  let status = 'green';
  if (percentage >= 95) status = 'critical';
  else if (percentage >= 90) status = 'red';
  else if (percentage >= 75) status = 'orange';
  else if (percentage >= 50) status = 'yellow';

  // Project monthly cost based on usage so far
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedCost = dayOfMonth > 0 ? (monthlySummary.total_cost / dayOfMonth) * daysInMonth : 0;

  // Service-based breakdown (chat, Live voice, chronicles, photo carbs, code repo scans, etc.)
  const serviceBreakdown = db.prepare(`
    SELECT 
      CASE 
        WHEN operation LIKE '%chat%' THEN 'Chat & Knowledge RAG'
        WHEN operation LIKE '%live%' OR operation LIKE '%hardware%' OR operation LIKE '%voice%' THEN 'Gemini Live Voice'
        WHEN operation LIKE '%chronicle%' OR operation LIKE '%campaign%' OR operation LIKE '%game%' THEN 'Campaign Chronicles'
        WHEN operation LIKE '%photo%' OR operation LIKE '%carb%' THEN 'Photo Carbs & Vision'
        WHEN operation LIKE '%code%' OR operation LIKE '%audit%' OR operation LIKE '%repo%' THEN 'Code Repo Scans'
        WHEN operation LIKE '%insight%' OR operation LIKE '%run%' OR operation LIKE '%glucose%' THEN 'T1D & Run Insights'
        ELSE 'Other Services'
      END as service,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(estimated_cost), 0) as cost,
      COUNT(*) as requests
    FROM token_usage
    WHERE timestamp >= ?
    GROUP BY service
    ORDER BY cost DESC
  `).all(monthStart);

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
    fx,
    percentage: Math.round(percentage * 100) / 100,
    status,
    projectedCost: Math.round(projectedCost * 10000) / 10000,
    modelBreakdown,
    operationBreakdown,
    serviceBreakdown
  };
}

/**
 * Get daily usage history for charts with service categorization
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
 * Identify the most expensive operations and flag candidates for caching or model downgrades
 */
export function getExpensivePrompts(limit = 10) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const expensive = db.prepare(`
    SELECT 
      id,
      timestamp,
      model,
      operation,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      estimated_cost
    FROM token_usage
    WHERE timestamp >= ?
    ORDER BY estimated_cost DESC
    LIMIT ?
  `).all(monthStart, limit);

  return expensive.map(item => {
    let recommendation = 'Optimal model sizing';
    let savingEstimate = 0;

    if (item.model.includes('pro') && item.prompt_tokens > 20000) {
      recommendation = 'Prompt Caching Candidate: High repeated context. Enable prompt caching or reduce document citations.';
      savingEstimate = item.estimated_cost * 0.75;
    } else if (item.model.includes('pro') && item.total_tokens < 5000) {
      recommendation = 'Cheaper Model Candidate: Switch from Pro to Gemini 2.5 Flash for ~80% cost reduction.';
      savingEstimate = item.estimated_cost * 0.8;
    } else if (item.prompt_tokens > 50000) {
      recommendation = 'High Context Volume: Prune redundant prompt instructions or implement hierarchical RAG summarisation.';
      savingEstimate = item.estimated_cost * 0.5;
    }

    return {
      ...item,
      recommendation,
      estimatedSavings: Math.round(savingEstimate * 10000) / 10000
    };
  });
}

/**
 * Check if spending is near the cap (for warning dialog)
 */
export function isNearSpendCap() {
  const summary = getUsageSummary();
  return {
    nearCap: summary.percentage >= 80,
    isCritical: summary.percentage >= 95,
    percentage: summary.percentage,
    remaining: Math.max(0, summary.spendCap - summary.month.cost * (summary.fx || 0.75)),
    status: summary.status,
    spendCap: summary.spendCap,
    currentCost: summary.month.cost,
    projectedCost: summary.projectedCost
  };
}

