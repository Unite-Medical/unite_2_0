/**
 * Fathom webhook handler — PRD-05.
 *
 * Fathom doesn't have a public REST API for reading transcripts at our
 * tier; it pushes webhooks when a call ends. Our /hooks/fathom route
 * (server-side, PRD-01) verifies the signature, then dispatches the
 * payload here.
 *
 * Payload shape (per Fathom docs, ~April 2026):
 *   {
 *     event: 'recording.completed',
 *     data: {
 *       recording_id, share_url, transcript_url,
 *       summary, action_items: [...],
 *       call: { duration_seconds, started_at, participants: [...] },
 *       host: { email, name },
 *       sentiment: { score, label },
 *     }
 *   }
 *
 * This module:
 *   1. Logs the raw payload to `activities`
 *   2. Runs Claude `fathom/extract_action_items` + `fathom/extract_insights`
 *      against the transcript (PRD-05 Phase 2)
 *   3. Pushes action items to HubSpot as tasks (PRD-05 Phase 3)
 *   4. Returns a structured result
 */

import { db } from '../db.js';
import { uid } from '../format.js';
import { ai } from '../ai/client.js';
import { warn } from './_http.js';
import { hubspot } from './hubspot.js';

export const fathom = {
  /**
   * Process a Fathom call-completed webhook.
   *
   * @param {object} event  Fathom webhook payload
   * @returns {Promise<{ activity_id, action_items, insights, hubspot_tasks }>}
   */
  async handleCallCompleted(event) {
    if (!event?.data) return { ok: false, reason: 'no_payload' };

    const { data } = event;
    const transcript = data.transcript || data.summary || '';
    const rep = data.host?.email || 'unknown@unitemedical.net';
    const duration_min = Math.round((data.call?.duration_seconds || 0) / 60);
    const organization = data.call?.participants?.[0]?.organization || data.call?.title || 'Unknown';
    const deal_id = data.metadata?.unite_deal_id || null;
    const contact_id = data.metadata?.unite_contact_id || null;

    const activity = db.insert('activities', {
      id: uid('act'),
      kind: 'call',
      source: 'fathom',
      external_id: data.recording_id,
      who: rep,
      contact_id,
      deal_id,
      subject: `Call · ${organization}`,
      body: data.summary || transcript.slice(0, 500),
      duration_min,
      transcript_url: data.transcript_url,
      recording_url: data.share_url,
      raw_payload: event,
      created_at: new Date().toISOString(),
    });

    // Run AI extraction in parallel.
    let action_items = [];
    let insights = null;
    try {
      const [aiItems, aiIns] = await Promise.all([
        ai.run('fathom/extract_action_items', {
          input: { transcript, rep_email: rep, organization, duration_min, deal_id },
          source: 'webhook:fathom',
        }),
        ai.run('fathom/extract_insights', {
          input: { transcript, rep_email: rep, organization, duration_min, deal_stage: data.metadata?.deal_stage || 'unknown' },
          source: 'webhook:fathom',
        }),
      ]);
      action_items = aiItems?.data?.items || aiItems?.data?.action_items || [];
      insights = aiIns?.data || null;
    } catch (err) {
      warn('fathom', `AI extraction failed: ${err.message}`);
    }

    db.update('activities', activity.id, { action_items, insights });

    // Push action items to HubSpot as Tasks (one per item).
    const hubspot_tasks = [];
    for (const item of action_items) {
      try {
        const task = await hubspot.createTask({
          subject: item.task,
          body: `From call with ${organization} (${data.recording_id}).\nEvidence: ${item.evidence_quote || ''}`,
          due_iso: item.due_iso === 'ASAP' ? new Date(Date.now() + 86400000).toISOString() : item.due_iso,
          owner_email: item.owner_email || rep,
          contact_id,
          deal_id,
        });
        hubspot_tasks.push(task.id);
      } catch (err) {
        warn('fathom', `HubSpot task push failed for action item: ${err.message}`);
      }
    }

    return { activity_id: activity.id, action_items, insights, hubspot_tasks };
  },

  /**
   * Manual ingest used by the admin CRM ("+ FATHOM CALL") and by
   * verifier scripts — wraps a hand-entered call summary in the
   * webhook payload shape and runs the same pipeline.
   *
   * @param {object} args
   * @param {string} args.rep            Rep email or name
   * @param {string} args.organization   Customer org on the call
   * @param {string} args.transcript     Transcript or summary text
   * @param {number} [args.duration_min]
   * @param {string} [args.deal_id]
   * @param {string} [args.contact_id]
   */
  async ingestCallSummary({ rep, organization, transcript, duration_min = 0, deal_id, contact_id }) {
    return this.handleCallCompleted({
      event: 'recording.completed',
      data: {
        recording_id: `manual_${uid().slice(3)}`,
        transcript,
        summary: transcript?.slice(0, 280),
        call: {
          duration_seconds: duration_min * 60,
          started_at: new Date().toISOString(),
          participants: [{ organization }],
          title: organization,
        },
        host: { email: rep, name: rep },
        metadata: { unite_deal_id: deal_id || null, unite_contact_id: contact_id || null },
      },
    });
  },
};
