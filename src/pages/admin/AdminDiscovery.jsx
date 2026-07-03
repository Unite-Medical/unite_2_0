/**
 * Admin · Discovery — CTO brief §7 (trade data intelligence).
 *
 * Mine US customs records two ways:
 *   - Find manufacturers: who exports product X to the US, at volume →
 *     vendor pipeline (feeds the approval workflow).
 *   - Find buyers: which US importers bring in the categories we stock →
 *     customer pipeline (feeds CRM as leads).
 *
 * Data is stubbed until the trade-data subscription is provisioned
 * (see ALEX_ACTIONS.md); the workflow — search → rank → push lead →
 * draft outreach — is fully live.
 */

import { useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt, uid } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { importgenius, hubspot, gmail } from '../../lib/services.js';
import { ai } from '../../lib/ai/client.js';

export function AdminDiscovery() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  const [role, setRole] = useState('shipper');
  const [keyword, setKeyword] = useState('nitrile gloves');
  const [hsCode, setHsCode] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [stubbed, setStubbed] = useState(false);

  async function runSearch() {
    setSearching(true); setNotice(null);
    try {
      const records = await importgenius.searchShipments({ keyword, hs_code: hsCode, role });
      setResults(records);
      setStubbed(!importgenius.__isConfigured());
    } finally { setSearching(false); }
  }

  async function addLead(r) {
    setBusyId(r.id); setNotice(null);
    try {
      if (role === 'shipper') {
        // Manufacturer → vendor pipeline
        db.insert('vendors', {
          id: uid('vnd'),
          name: r.company,
          country: r.country,
          status: 'pending',
          fda_registered: null,
          gs1_validated: null,
          source: 'trade-data-discovery',
          importgenius_annual_usd: r.est_annual_usd,
          discovered_at: new Date().toISOString(),
        });
        setNotice(`${r.company} added to the vendor pipeline — run the approval checks from the Vendors page.`);
      } else {
        // US importer → customer lead, pushed to CRM
        const lead = db.insert('leads', {
          id: uid('lead'),
          org_name: r.company,
          segment: 'distributor',
          est_annual_value: Math.round(r.est_annual_usd * 0.15),
          status: 'new',
          source: 'trade-data-discovery',
          owner: 'Meredith Cole',
          created_at: new Date().toISOString(),
          next_action: 'Qualify import profile',
          contact_name: '',
          contact_email: '',
        });
        await hubspot.upsertContact({
          email: `lead+${lead.id}@unitemedical.net`,
          company: r.company,
          lifecyclestage: 'lead',
        });
        setNotice(`${r.company} pushed to CRM as a lead (est ${fmt.short(r.est_annual_usd)} import volume).`);
      }
      db.insert('audit_log', { id: uid('aud'), kind: `discovery.${role === 'shipper' ? 'vendor' : 'lead'}_added`, ref_id: r.id, payload: { company: r.company } });
    } finally { setBusyId(null); }
  }

  async function draftOutreach(r) {
    setBusyId(r.id); setNotice(null);
    try {
      const { data } = await ai.run('vendor/outreach_email', {
        input: {
          company_name: r.company,
          country: r.country,
          products_summary: `${r.product_keyword} (HS ${r.hs_code})`,
          fei_number: 'unverified',
          annual_us_volume: (r.est_annual_usd || 0).toLocaleString(),
          existing_customers: '',
        },
        source: 'discovery',
      });
      await gmail.send({
        to: `contact@${r.company.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`,
        from: 'damon@unitemedical.net',
        subject: data.subject || `Sourcing partnership — ${r.company}`,
        body: data.body || data.content || '',
        template_key: 'vendor_outreach',
        drafted_by: 'ai-assist:vendor/outreach_email',
      });
      setNotice(`Outreach draft for ${r.company} queued in the outbox for review.`);
    } finally { setBusyId(null); }
  }

  const input = { padding: '11px 14px', borderRadius: 8, border: `1px solid ${D.line}`, fontSize: 14, fontFamily: D.sans, background: '#fff', color: D.ink };

  return (
    <AdminShell active="discovery">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>TRADE DATA · CUSTOMS RECORDS</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Discovery</h1>
        <div style={{ marginTop: 10, fontSize: 13, color: D.ink2, maxWidth: 640 }}>
          Every container entering the US is a public record. Search them to find manufacturers worth sourcing from — and importers worth selling to.
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['shipper', 'Find manufacturers'], ['consignee', 'Find US buyers']].map(([k, label]) => (
            <button key={k} onClick={() => { setRole(k); setResults([]); }} style={{ padding: '9px 18px', borderRadius: 4, fontSize: 13, fontFamily: D.sans, cursor: 'pointer', border: `1px solid ${role === k ? D.plum : D.line}`, background: role === k ? D.plum : 'transparent', color: role === k ? '#fff' : D.ink }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Product keyword (e.g. nitrile gloves)" style={{ ...input, flex: '1 1 260px' }} />
          <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="HS code (optional, e.g. 4015.19)" style={{ ...input, width: 220 }} />
          <button onClick={runSearch} disabled={searching} style={{ padding: '11px 22px', borderRadius: 8, fontSize: 14, fontFamily: D.sans, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none' }}>
            {searching ? 'Searching records…' : 'Search'}
          </button>
        </div>

        {stubbed && results.length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(193,121,58,.08)', border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 12, color: D.ink2 }}>
            Sample records — the trade-data subscription isn't provisioned yet (see ALEX_ACTIONS.md). The workflow below is live either way.
          </div>
        )}
        {notice && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(29,92,77,.07)', border: `1px solid ${D.line}`, borderRadius: 10, fontSize: 13 }}>{notice}</div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 18, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  {['COMPANY', role === 'shipper' ? 'ORIGIN' : 'LOCATION', 'HS', 'SHIPMENTS (12MO)', 'TEU', 'EST VOLUME', 'LAST SHIPMENT', 'ACTIONS'].map((h) => <th key={h} style={{ padding: 12 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${D.line}` }}>
                    <td style={{ padding: 12, fontWeight: 600 }}>{r.company}</td>
                    <td style={{ padding: 12, color: D.ink2 }}>{role === 'shipper' ? `${r.country} · ${r.port}` : r.port}</td>
                    <td style={{ padding: 12, fontFamily: D.mono, fontSize: 12 }}>{r.hs_code}</td>
                    <td style={{ padding: 12 }}>{r.shipments_12mo}</td>
                    <td style={{ padding: 12 }}>{r.teu_12mo}</td>
                    <td style={{ padding: 12, fontWeight: 500 }}>{fmt.short(r.est_annual_usd)}</td>
                    <td style={{ padding: 12, color: D.ink2 }}>{fmt.date(r.last_shipment)}</td>
                    <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                      <button onClick={() => addLead(r)} disabled={busyId === r.id} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: D.plum, color: '#fff', border: 'none', fontFamily: D.sans }}>
                        {busyId === r.id ? '…' : role === 'shipper' ? 'Add to vendor pipeline' : 'Push to CRM'}
                      </button>
                      {role === 'shipper' && (
                        <button onClick={() => draftOutreach(r)} disabled={busyId === r.id} style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, fontFamily: D.sans }}>
                          Draft outreach
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results.length === 0 && !searching && (
          <div style={{ marginTop: 18, padding: 28, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, color: D.ink3, fontSize: 14 }}>
            {role === 'shipper'
              ? 'Search a product keyword to surface manufacturers exporting it to the US — ranked by container volume.'
              : 'Search a category to surface US importers already buying it — each one currently buys from someone else.'}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
