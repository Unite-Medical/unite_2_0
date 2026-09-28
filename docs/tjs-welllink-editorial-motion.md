# TJS and WellLink editorial redesign — September 28, 2026

## Design and behavior

Both public pages use a full-viewport film with a short scroll-controlled timeline, followed by editorial sections, the shared marketing navigation and the illustrated homepage footer. The browser scroll remains native; there is no scroll interception, autoplay or audio. Video time follows scroll in both directions, with a short settling filter and frequent keyframes for efficient seeking. A visible link skips to page content. Keyboard focus restores the opening CTA when needed.

Posters render immediately. Reduced-motion and data-saving preferences disable video loading and collapse the extended scroll section. Video errors also switch to the static layout. Below the film, sections reveal as they enter the viewport; content remains present without animation or JavaScript.

TJS retains the previously published launch metrics and capabilities, replaces the broken OG-image placeholder with an actual screenshot of the live recovery store, and corrects stale prerender metadata that incorrectly described a supply-cost case study. The generated film is labeled conceptual, not documentary customer footage.

WellLink keeps all six awarded case products, quantities, the correct BD reference, member status and the existing validated access/sample/quote flows. Product cards become a compact catalog alongside a section introduction. The page still uses manual facility/CPF verification and staff contract quoting; no pricing entitlement or order automation is introduced.

## Generated media

Higgsfield Seedance 2.5, silent 8-second landscape clips. Project: `1f4038e3-4c10-4797-9f91-dd9d3b52507c`.

TJS accepted generation: `4d850c56-116b-416e-8ccb-ee68a816590f`. Conceptual studio recovery-kit arrangement, slow continuous orbit. Optimized media `b102d905-be65-4fa6-8156-fdf4d0d7c031`.

WellLink initial generation `4f9ee7e7-b6e7-4a03-9453-031e4ae10333` was rejected because it added needles contrary to the prompt. Replacement `4ed0751f-3f66-4e66-86b2-96634933f3c7` uses the actual 5 mL needleless product image as a geometry reference, imported media `df9a62a1-56f8-4acb-82e6-bfd40d061e6e`. Final optimized video: `883eea4a-3394-4faf-bf73-11435d3dee5c`; poster: `6ddf31a4-532d-4298-a70f-9db416dec705`.

Outputs are served locally from `public/images/program-films`. Encoding: silent H.264, 1280×720, 24fps, CRF 21, keyframes every three frames, no B frames, faststart. Matching first-frame JPG posters avoid a loading flash. The real TJS storefront screenshot was captured from https://tjs.unitemedical.net/ on September 28, 2026.

## Verification

`scripts/test_editorial_films.mjs` verifies loading, forward and reverse seeking, pinned-stage placement, silent/paused video, mobile motion, no overflow from 360–1440px, reduced-motion layout, network-error fallback, TJS results and the actual storefront image. `scripts/test_welllink_browser.mjs` verifies the unchanged member request flows with isolated API writes.
