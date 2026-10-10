# Sources & claim audit

Checked 10 October 2026. Product model follows PRD v4.1 (9 October 2026) and the later decisions in AGENTS.md.

## [S1] BPS · Sports facilities by village, 2024

[Primary source / reference](https://www.bps.go.id/id/statistics-table/2/OTc0IzI%3D/number-of-villages-according-availability-sport-field.html)

14,253 villages/kelurahan with futsal; 36,540 badminton; 48,886 football. Units are villages, not individual courts. Categories can overlap. Not a count of commercially operated or eligible venues; not TAM.

## [S2] AYO · Official website

[Primary source / reference](https://ayo.co/)

Company-reported: 900,000+ users, 100+ cities, 2,000+ sports facilities, 6,800+ bookable courts. Accessed 10 October 2026. Not government statistics, Open Grounds traction, or a partnership.

## [S3] Jurnal Logistica · Futsal feasibility study, 2024

[Primary source / reference](https://journal.iteba.ac.id/index.php/logistica/article/view/304)

Asmarawati, Sidabutar & Wibowo; DOI 10.62375/logistics.v2i2.304; published 21 June 2024. Abstract reports NPV +Rp38,812,042, IRR 7%, payback 9 months for one Batam business. This does not establish market-wide returns. Cost-table inconsistencies limit generalization.

## [S3 PDF] Original research PDF · pp. 56–60

[Primary source / reference](https://journal.iteba.ac.id/index.php/logistica/article/download/304/189)

Original paper reviewed. Maintenance is only one expense line; do not equate it with total OPEX. Reusable-asset framing is our interpretation of recurring court rentals, not a published market statistic.

## [P1] Open Grounds · Product repository

[Primary source / reference](https://github.com/senarais/opengrounds)

Product model: local Open_Grounds_PRD_v4.1_Hackathon.md (9 October 2026), identical to OG_PRD_v4.1.md at review time. AGENTS.md contains later decisions on review signatures, attestation policies, Privy and sandbox payments; those override older PRD text. Implementation is not proof of production readiness.

## [D1] Saku Pitch · Design reference

[Primary source / reference](https://github.com/s-erzv/saku-pitch)

Reference for warm orange accents, large typography, modular compositions and a web-native printable presentation. This deck has original layouts and code; no Saku mascot or app assets copied.

## [A1] Unsplash · Tennis court photography

[Primary source / reference](https://unsplash.com/license)

Existing project photos: images.unsplash.com/photo-1595435934249-5df7ed86e1c0 and photo-1554068865-24cecd4e34b8. Illustrative photography only; not listed venues or customer evidence. Fonts: Plus Jakarta Sans and Inter, SIL Open Font License, bundled via Fontsource.

## Photography

- Cover: https://images.unsplash.com/photo-1554068865-24cecd4e34b8 (existing landing-player.jpg).
- Closing: https://images.unsplash.com/photo-1546519638-68e109498ffc (existing landing-basketball.jpg).
- Illustrative only; no venue, partnership or customer claim. The original Unsplash photo identifier is preserved for attribution. Unsplash license: https://unsplash.com/license.

## Editorial decisions

- Do not interpret BPS villages as court count, venue eligibility or land ownership. Do not sum categories or AYO courts into TAM.
- AYO numbers are company-reported, not audited adoption data or our traction.
- The Batam paper is one case. Its abstract figures are reported, not recalculated or generalized. No claim that Rp2 million maintenance equals OPEX.
- Repeated rental / reusable asset is our business-model interpretation. It does not imply maintenance-free economics or guaranteed profit.
- Problem statements are PRD hypotheses, not validated customer research.
- All Q&A economics example numbers are product assumptions. D = 52m − 1m − 27m − 1.5m − 4m − 2m − 1.5m = 15m; P_SPV = 7.5m; F_spv = 150k; P_inv = 7.35m; 10% supply gets 735k.
- Platform fee rate is undecided. 2% management fee belongs to Grounds, not automatically platform revenue. No new POS subscription/issuance fee is invented.
- Proposed channels/partners/ask are explicitly tentative. No pilot, partnership, regulator approval, or complete Sepolia e2e is claimed.
- No public secondary market: only conditional sell-back to treasury, subject to capacity; liquidity not guaranteed.
- Legal structure and SPV funding remain open. Production dependencies are not portrayed as secured.

## Chart construction

Market bar chart: BPS 2024 village counts, one zero-based scale from 0 to 50,000. Football 48,886; badminton 36,540; futsal 14,253. Bar lengths = value / 50,000 × 620 SVG units. Categories are not mutually exclusive and must not be summed. Animated numbers settle at the exact source values, including before printing. AYO numbers use different units and are displayed outside the chart. No synthetic growth, booking time series, TAM or Open Grounds traction is invented.
