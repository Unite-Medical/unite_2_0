function normalizedDecision(value) {
  return String(value || '').trim().toLowerCase();
}

export function applyDamonCatalogDecision(product, rule = {}) {
  const decision = normalizedDecision(rule.decision);
  const visibility = normalizedDecision(rule.visibility);
  const archived = decision === 'archive';
  const launch = decision === 'launch';
  const published = launch && !['do not publish', 'backend only', 'sample only'].includes(visibility);
  const weights = rule.shipping_weight_lb_by_sku || {};
  return {
    ...product,
    launch_decision: rule.decision || null,
    launch_visibility: rule.visibility || null,
    status: archived ? 'archived' : product.status,
    available: archived ? false : launch ? product.available !== false : false,
    published: archived ? false : published,
    variants: (product.variants || []).map((variant) => ({
      ...variant,
      ...(weights[variant.sku] != null ? { shipping_weight_lb: Number(weights[variant.sku]) } : {}),
    })),
  };
}

export function summarizeDamonCatalogDecisions(rows, expected = 175) {
  if (!Array.isArray(rows) || rows.length !== expected) {
    throw new Error(`expected ${expected} Damon product decisions, received ${rows?.length || 0}`);
  }
  const counts = {};
  for (const row of rows) counts[row.decision] = (counts[row.decision] || 0) + 1;
  return { total: rows.length, counts };
}

export function applyDamonDecisionsToCatalog(products, rules, { allowUnmanaged = false } = {}) {
  const byHandle = new Map((rules || []).map((rule) => [rule.handle, rule]));
  return (products || []).map((product) => {
    const rule = byHandle.get(product.handle);
    if (!rule && allowUnmanaged) return product;
    if (!rule) throw new Error(`missing Damon decision for ${product.handle}`);
    return applyDamonCatalogDecision(product, rule);
  });
}
