// Keep serialization and display bounded so a historical export cannot create a
// multi-megabyte text control or monopolize the UI thread.
export const EVIDENCE_TEXT_CHUNK = 32000;
export function evidenceManifest(bundle) {
  return { ...bundle, datasets: Object.fromEntries(Object.entries(bundle.datasets).map(([source, dataset]) => [source, { complete: dataset.complete, errors: dataset.errors, page_count: dataset.pages.length, record_count: dataset.pages.reduce((n, page) => n + page.records.length, 0) }])) };
}
export function evidenceTextSegment(bundle, source = '', page = 0, segment = 0) {
  const value = source ? bundle.datasets[source]?.pages[page] : evidenceManifest(bundle);
  const text = JSON.stringify(value ?? null, null, 2);
  const segments = Math.max(1, Math.ceil(text.length / EVIDENCE_TEXT_CHUNK));
  const index = Math.max(0, Math.min(segment, segments - 1));
  return { text: text.slice(index * EVIDENCE_TEXT_CHUNK, (index + 1) * EVIDENCE_TEXT_CHUNK), segments, index, characters: text.length };
}
export async function evidenceDownloadBlob(bundle, { yieldToUi = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const { datasets, ...metadata } = bundle;
  const parts = [JSON.stringify(metadata).slice(0, -1), ',"datasets":{'];
  let first = true;
  for (const [source, dataset] of Object.entries(datasets)) {
    if (!first) parts.push(','); first = false;
    const { pages, ...info } = dataset;
    parts.push(JSON.stringify(source), ':', JSON.stringify(info).slice(0, -1), ',"pages":[');
    for (let i = 0; i < pages.length; i++) {
      if (i) parts.push(',');
      parts.push(JSON.stringify(pages[i]));
      await yieldToUi();
    }
    parts.push(']}');
  }
  parts.push('}}');
  return new Blob(parts, { type: 'application/json' });
}
