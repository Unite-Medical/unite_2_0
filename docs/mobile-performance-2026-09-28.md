# Mobile performance improvements — September 28, 2026

Live staging measured with Lighthouse 13.5.0, default mobile simulated throttling. Single fresh-browser runs, not field Core Web Vitals. All post-change runs completed without warnings. The original Quick Quote score was provisional due to a load timeout.

| Page | Performance before | Performance after | LCP before | LCP after |
|---|---:|---:|---:|---:|
| home | 63 | 92 | 7.4s | 2.6s |
| robotics | 77 | 97 | 5.9s | 2.4s |
| catalog | 85 | 97 | 4.1s | 2.5s |
| quick-quote | 89 | 92 | 3.6s | 2.7s |
| welllink | 85 | 98 | 3.8s | 2.1s |
| tjs | 84 | 94 | 3.8s | 2.4s |

Changes: mobile-first hero poster and immediate content visibility; desktop-only animation engine; explicit mobile background-video playback; smaller WebP artwork and display-sized logo; page-specific module/style preload hints; on-demand chat with a lightweight launcher; bounded nonblocking funnel telemetry. WellLink and TJS scroll films remain active on mobile, and desktop retains its existing motion.

Verification: 588 unit tests pass (3 skipped); isolated browser checks for public commerce, mobile loading, click-to-play/chat, desktop motion, both editorial films, reduced-motion/media failures and 360–1440px layouts pass; metadata and image checks pass for all 155 prerendered public pages.
