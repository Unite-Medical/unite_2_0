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
  paper: '#f3f2eb',     // bone — cool off-white ground
  paperAlt: '#e9e7dc',  // deeper bone for alternating bands
  card: '#fcfbf6',      // raised surface
  ink: '#16201a',       // green-black — primary text
  inkDeep: '#0e1713',   // near-black evergreen — dark bands
  ink2: '#57635a',      // secondary text
  ink3: '#8b968d',      // tertiary / meta text
  line: '#dbd9cc',      // hairline rules
  plum: '#1d5c4d',      // PRIMARY ACCENT — deep surgical green (legacy key name)
  plumSoft: '#9dbcae',  // sage — accent on dark grounds (legacy key name)
  terra: '#b3592b',     // clay — signal/warning accent, used sparingly
  terraSoft: '#dcc0a8', // soft clay
  grad: 'linear-gradient(135deg, #2e7d5f 0%, #1d5c4d 55%, #123f35 100%)',
  display: '"Instrument Serif", Georgia, "Times New Roman", serif',
  sans: '"Archivo", -apple-system, "Helvetica Neue", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};
