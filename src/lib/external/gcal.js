/**
 * Google Calendar API client — brief §5 (rep meeting sync).
 *
 * Docs: https://developers.google.com/calendar/api/v3/reference
 *
 * Auth: same Google OAuth refresh token as Gmail (one consent at
 * /api/auth/google/connect covers both). Browser → `${API_BASE}/proxy/gcal/*`.
 *
 * Endpoints used:
 *   POST /calendars/{id}/events       create rep/customer meetings
 *   GET  /calendars/{id}/events       upcoming-meeting feeds
 *   POST /freeBusy                    availability for booking UIs
 *
 * Stub mode mirrors events into the local `calendar_events` table so
 * the rep dashboard renders the same either way.
 */

import { db } from '../db.js';
import { uid, delay } from '../format.js';
import { API_BASE, fetchJson, realOrStub } from './_http.js';

function viaBackendProxy() {
  return Boolean(API_BASE);
}

async function callGcal({ method = 'GET', path, body }) {
  return fetchJson(`${API_BASE}/proxy/gcal${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mirrorEvent({ summary, description, start_iso, end_iso, attendees, rep_email, source, google_event_id }) {
  return db.insert('calendar_events', {
    id: uid('cal'),
    google_event_id: google_event_id || null,
    summary,
    description: description || '',
    start_at: start_iso,
    end_at: end_iso,
    attendees: attendees || [],
    rep_email: rep_email || null,
    source,
  });
}

export const gcal = {
  /** Create a calendar event (rep call, vendor review, QBR). */
  async createEvent({ calendar_id = 'primary', summary, description, start_iso, end_iso, attendees = [], rep_email }) {
    const body = {
      summary,
      description,
      start: { dateTime: start_iso },
      end: { dateTime: end_iso },
      attendees: attendees.map((email) => ({ email })),
      reminders: { useDefault: true },
    };
    return realOrStub({
      scope: 'gcal',
      label: `createEvent(${summary})`,
      predicate: () => viaBackendProxy(),
      real: async () => {
        const resp = await callGcal({ method: 'POST', path: `/calendars/${encodeURIComponent(calendar_id)}/events`, body });
        return mirrorEvent({ summary, description, start_iso, end_iso, attendees, rep_email, source: 'google', google_event_id: resp.id });
      },
      stub: async () => {
        await delay(160, 320);
        return mirrorEvent({ summary, description, start_iso, end_iso, attendees, rep_email, source: 'stub' });
      },
    });
  },

  /** Upcoming events for the ops calendar / a rep. */
  async listUpcoming({ calendar_id = 'primary', limit = 10 } = {}) {
    return realOrStub({
      scope: 'gcal',
      label: 'listUpcoming',
      predicate: () => viaBackendProxy(),
      real: async () => {
        const timeMin = encodeURIComponent(new Date().toISOString());
        const resp = await callGcal({ path: `/calendars/${encodeURIComponent(calendar_id)}/events?timeMin=${timeMin}&maxResults=${limit}&singleEvents=true&orderBy=startTime` });
        return resp.items || [];
      },
      stub: async () => {
        await delay(120, 260);
        return db.list('calendar_events', { where: { start_at: (v) => v >= new Date().toISOString() }, orderBy: 'start_at', limit });
      },
    });
  },

  /** Availability check used by the booking UI. */
  async freeBusy({ emails = [], time_min, time_max }) {
    const body = {
      timeMin: time_min,
      timeMax: time_max,
      items: emails.map((id) => ({ id })),
    };
    return realOrStub({
      scope: 'gcal',
      label: 'freeBusy',
      predicate: () => viaBackendProxy(),
      real: async () => callGcal({ method: 'POST', path: '/freeBusy', body }),
      stub: async () => {
        await delay(120, 240);
        return { calendars: Object.fromEntries(emails.map((e) => [e, { busy: [] }])), stub: true };
      },
    });
  },

  __isConfigured: () => viaBackendProxy(),
};
