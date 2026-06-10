# PRD-22 — Multi-Currency & International Vendor Communications

**Source:** CTO Brief §7 — "A foreign vendor uploads their product template" / "product description in English or Chinese"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01, PRD-11 (Claude for translation), PRD-16 (quoting engine v3), PRD-18 (XLSX parsing)
**Blocks:** nothing critical — enhances vendor onboarding velocity

> "Given a product description in English or Chinese, Claude suggests the most likely HTS codes for the CTO's quoting engine to validate against USITC" — Brief §9

---

## 1. North star

A manufacturer in Guangzhou fills out a product template in Chinese with prices in RMB — and the system handles everything: translates product descriptions, converts currency to USD at the current exchange rate, classifies HTS codes from the Chinese text, and generates a quote in English for the American customer. The vendor never has to translate anything or look up exchange rates.

---

## 2. Current state

- All pricing is hardcoded to USD throughout the codebase
- `vendorSheet.js` expects English column headers (some Chinese aliases added in PRD-18)
- Claude prompts reference "English or Chinese" product descriptions but no translation pipeline exists
- No currency conversion capability
- No multilingual vendor communication templates
- Vendor outreach email prompt (`vendor/outreach_email`) generates English only

---

## 3. Scope

### In scope

- **Currency conversion**: accept FOB prices in any major currency (RMB/CNY, EUR, KRW, VND, MYR, TWD) → auto-convert to USD using live exchange rates
- **Exchange rate API**: free API (exchangerate-api.com or similar) for daily rates, cached
- **Product description translation**: Claude translates non-English descriptions to English for FDA/HTS classification
- **Bilingual quote output**: internal documents in English; vendor-facing communications include original language
- **Vendor outreach in multiple languages**: Claude drafts outreach emails in the vendor's language
- **HTS classification from Chinese/multilingual input**: Claude interprets Chinese product descriptions and suggests HTS codes

### Out of scope

- Multi-currency invoicing (customers always pay in USD)
- Multi-currency accounting in QBO (all journal entries in USD)
- Real-time forex hedging
- Regulatory document translation (IFUs, labeling — these require certified translation)

---

## 4. Currency conversion pipeline

```
Vendor uploads sheet with prices in CNY
       │
       ▼
Parser detects currency column or infers from country_of_origin
       │
       ▼
Exchange rate API: GET /latest?base=CNY&symbols=USD
       │ (cached daily)
       ▼
Convert FOB prices: fob_usd = fob_cny × rate
       │
       ▼
Store both: fob_original (CNY 15.80) + fob_usd ($2.17)
       │
       ▼
Quoting engine uses fob_usd for all calculations
```

### Supported currencies (v1):

| Currency | Code | Primary use |
|---|---|---|
| Chinese Yuan | CNY | China manufacturers |
| Euro | EUR | EU manufacturers |
| South Korean Won | KRW | Korean manufacturers |
| Vietnamese Dong | VND | Vietnam manufacturers |
| Malaysian Ringgit | MYR | Malaysia manufacturers |
| New Taiwan Dollar | TWD | Taiwan manufacturers |
| US Dollar | USD | Default / domestic |

---

## 5. Translation pipeline

```
Chinese product description: "膝关节支具 可调节铰链式 医用级别"
       │
       ▼
Claude (PRD-11 prompt: 'translation/product_description'):
  - Translate to English: "Knee joint brace, adjustable hinged, medical grade"
  - Extract key attributes: { type: "brace", body_part: "knee", features: ["adjustable", "hinged"], grade: "medical" }
  - Suggest FDA product code: "KGN" (confidence: 0.85)
  - Suggest HTS code: "9021.10" (confidence: 0.80)
       │
       ▼
Store both original + translation on quote_item
       │
       ▼
openFDA validates suggested FDA code
USITC validates suggested HTS code
       │
       ▼
Flag items with confidence < 0.70 for human review
```

---

## 6. Multilingual vendor outreach

When reaching out to a foreign vendor (discovered via ImportGenius, PRD-15), Claude drafts the email in the vendor's language:

- **Input**: vendor profile, product categories of interest, Unite Medical value proposition
- **Output**: outreach email in the vendor's primary language (Chinese, Korean, Vietnamese)
- **CC**: English translation appended below for internal reference

New AI prompt: `vendor/outreach_email_intl`

---

## 7. Vendor sheet currency column

Add to `COLUMN_ALIASES` in `vendorSheet.js`:

```js
currency: ['currency', 'curr', 'ccy', '币种', '货币', '통화'],
fob_price_original: ['fob_price_original', 'fob_original', 'original price', '原价', '출하가'],
```

If a `currency` column exists, use it. If not, infer from `country_of_origin`:
- CN → CNY
- KR → KRW
- VN → VND
- MY → MYR
- TW → TWD
- DE/FR/IT/etc. → EUR
- US/missing → USD

---

## 8. Phases

### Phase 1 — Exchange rate API + currency conversion

- Integrate free exchange rate API (exchangerate-api.com — 1,500 req/mo free)
- Cache daily rates in Postgres (rates don't change intraday for our purposes)
- Add currency detection to `vendorSheet.js` parser
- Convert FOB prices to USD; store both original + USD amounts

**Exit:** A vendor sheet with CNY prices converts correctly to USD. Rate matches Google Finance within 1%.

### Phase 2 — Product description translation

- Build Claude prompt `translation/product_description`
- Translate non-English descriptions to English
- Extract product attributes for FDA/HTS classification
- Store original + translated text on each quote item
- Flag low-confidence translations for human review

**Exit:** A 10-item vendor sheet in Chinese translates all descriptions and suggests FDA/HTS codes for 8/10 items.

### Phase 3 — Multilingual vendor outreach

- Build Claude prompt `vendor/outreach_email_intl`
- Admin can generate outreach emails in Chinese, Korean, Vietnamese
- Email includes English CC for internal reference
- Integrate with Resend for sending

**Exit:** A Chinese vendor receives an outreach email in Mandarin with correct product terminology.

### Phase 4 — HTS classification from Chinese text

- Enhance Claude `quoting/hts_classify` prompt to accept Chinese input
- Chain: Chinese description → Claude translates → Claude suggests HTS → USITC validates
- Confidence scoring: flag low-confidence classifications
- Build a feedback loop: human corrections improve future suggestions

**Exit:** HTS classification accuracy from Chinese descriptions ≥ 75% (measured against human classification).

---

## 9. Open questions

1. **Exchange rate source**: free tier of exchangerate-api.com (1,500 req/mo) vs. Open Exchange Rates ($12/mo for 1,000 req/mo) vs. ECB reference rates (free, daily, EUR-based). Recommendation: exchangerate-api.com free tier is sufficient for daily caching.
2. **Translation liability**: if a Claude translation leads to incorrect HTS classification and duties are wrong, who's liable? Recommendation: all AI translations flagged as "AI-translated — verify before customs filing." CTO/ops reviews all HTS codes before submission.
3. **Vendor portal language**: should the vendor-facing portal (if we build one) support Chinese UI? Recommendation: defer — email + Excel templates are the vendor interface for v1.

---

## 10. Out-of-band

- Exchange rate API account (free)
- New env var: `EXCHANGE_RATE_API_KEY`

---

## 11. Definition of done

- Vendor sheets with non-USD prices convert correctly
- Chinese product descriptions translate and classify with ≥ 75% accuracy
- Vendor outreach emails generate in 3+ languages
- All currency conversions are auditable (rate, date, source stored)
