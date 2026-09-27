/**
 * Design tokens — "Precision" system (redesign/precision-v3).
 *
 * Built for who actually buys here: materials managers, pharmacy buyers,
 * VA contracting officers, EMS chiefs, distributors. Institutional
 * procurement reads precision, not gloss — so the system is bone paper,
 * green-black ink, one deep surgical-green accent, hairline rules, and a
 * heavy mono data layer. No gradients-as-decoration, no glass, no orbs.
 *
 * Key names are kept from the previous system (`plum`, `terra`, …) so all
 * 49 pages retheme without a rename sweep; the VALUES define the new brand.
 */
export const D = {
  paper: 'var(--um-paper, #f3f2eb)',     // bone — cool off-white ground
  paperAlt: 'var(--um-paperAlt, #e9e7dc)',  // deeper bone for alternating bands
  card: 'var(--um-card, #fcfbf6)',      // raised surface
  ink: 'var(--um-ink, #16201a)',       // green-black — primary text
  inkDeep: 'var(--um-inkDeep, #0e1713)',   // near-black evergreen — dark bands
  ink2: 'var(--um-ink2, #57635a)',      // secondary text
  ink3: 'var(--um-ink3, #8b968d)',      // tertiary / meta text
  line: 'var(--um-line, #dbd9cc)',      // hairline rules
  plum: 'var(--um-plum, #1d5c4d)',      // PRIMARY ACCENT — deep surgical green (legacy key name)
  plumSoft: 'var(--um-plumSoft, #9dbcae)',  // sage — accent on dark grounds (legacy key name)
  terra: 'var(--um-terra, #b3592b)',     // clay — signal/warning accent, used sparingly
  terraSoft: 'var(--um-terraSoft, #dcc0a8)', // soft clay
  grad: 'linear-gradient(135deg, #2e7d5f 0%, #1d5c4d 55%, #123f35 100%)',
  display: '"Unite Manrope", "Helvetica Neue", Arial, sans-serif',
  sans: '"Archivo", -apple-system, "Helvetica Neue", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};
