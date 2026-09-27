export function savingsDisplay(data) {
  const timestamp = data?.checked_at || data?.as_of;
  if (!data?.ok || typeof data.total_savings_usd !== 'number' || !Number.isFinite(data.total_savings_usd) || data.total_savings_usd < 0 || !Number.isFinite(Date.parse(timestamp))) return { value: '$1.4M', detail: 'Reported savings to date · awaiting the next update', live: false };
  const date = new Date(timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'});
  return { value: new Intl.NumberFormat('en-US', { style:'currency',currency:'USD',maximumFractionDigits:0 }).format(data.total_savings_usd), detail: data.checked_at ? `Last checked ${date} · Updates daily` : `Reported ${date}`, live:true };
}
