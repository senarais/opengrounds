export interface Slide { title: string; chapter: string; className?: string; body: string; source: string; notes: string; seconds: number; hidden?: boolean; }

export const sources = [
  {
    "id": "S1",
    "title": "BPS · Sports facilities by village, 2024",
    "url": "https://www.bps.go.id/id/statistics-table/2/OTc0IzI%3D/number-of-villages-according-availability-sport-field.html",
    "detail": "14,253 villages/kelurahan with futsal; 36,540 badminton; 48,886 football. Units are villages, not individual courts. Categories can overlap. Not a count of commercially operated or eligible venues; not TAM."
  },
  {
    "id": "S2",
    "title": "AYO · Official website",
    "url": "https://ayo.co/",
    "detail": "Company-reported: 900,000+ users, 100+ cities, 2,000+ sports facilities, 6,800+ bookable courts. Accessed 10 October 2026. Not government statistics, Open Grounds traction, or a partnership."
  },
  {
    "id": "S3",
    "title": "Jurnal Logistica · Futsal feasibility study, 2024",
    "url": "https://journal.iteba.ac.id/index.php/logistica/article/view/304",
    "detail": "Asmarawati, Sidabutar & Wibowo; DOI 10.62375/logistics.v2i2.304; published 21 June 2024. Abstract reports NPV +Rp38,812,042, IRR 7%, payback 9 months for one Batam business. This does not establish market-wide returns. Cost-table inconsistencies limit generalization."
  },
  {
    "id": "S3 PDF",
    "title": "Original research PDF · pp. 56–60",
    "url": "https://journal.iteba.ac.id/index.php/logistica/article/download/304/189",
    "detail": "Original paper reviewed. Maintenance is only one expense line; do not equate it with total OPEX. Reusable-asset framing is our interpretation of recurring court rentals, not a published market statistic."
  },
  {
    "id": "P1",
    "title": "Open Grounds · Product repository",
    "url": "https://github.com/senarais/opengrounds",
    "detail": "Product model: local Open_Grounds_PRD_v4.1_Hackathon.md (9 October 2026), identical to OG_PRD_v4.1.md at review time. AGENTS.md contains later decisions on review signatures, attestation policies, Privy and sandbox payments; those override older PRD text. Implementation is not proof of production readiness."
  },
  {
    "id": "D1",
    "title": "Saku Pitch · Design reference",
    "url": "https://github.com/s-erzv/saku-pitch",
    "detail": "Reference for warm orange accents, large typography, modular compositions and a web-native printable presentation. This deck has original layouts and code; no Saku mascot or app assets copied."
  },
  {
    "id": "A1",
    "title": "Unsplash · Sports photography",
    "url": "https://unsplash.com/license",
    "detail": "Existing project photos: images.unsplash.com/photo-1595435934249-5df7ed86e1c0 photo-1554068865-24cecd4e34b8 and photo-1546519638-68e109498ffc. Illustrative photography only; not listed venues or customer evidence. Fonts: Plus Jakarta Sans and Inter, SIL Open Font License, bundled via Fontsource."
  }
];

export const slides: Slide[] = [
  {
    "title": "Open Grounds",
    "chapter": "The opportunity",
    "className": "cover",
    "seconds": 20,
    "body": "<div class=\"cover-photo\"><img src=\"/assets/player.jpg\" alt=\"Clay tennis court from above, illustrative photography\"/></div><div class=\"cover-copy\"><div class=\"event-tag\">ETHJKT 2026 / RWA track</div><h1>Open<br>Grounds.</h1><p class=\"cover-tagline\">Fractional access.<br>Real venue profits.</p><p class=\"cover-detail\">For the places where people play.</p><div class=\"cover-mark\">Sports venues → Shared economic rights</div></div><div class=\"serve-visual\" aria-hidden=\"true\"><svg viewBox=\"0 0 600 450\"><path class=\"serve-trail\" pathLength=\"1\" d=\"M40 335 Q190 65 525 150\" fill=\"none\" stroke=\"#F8FAFC\" stroke-width=\"3\"/><circle class=\"serve-point\" cx=\"525\" cy=\"150\" r=\"8\" fill=\"#F8FAFC\"/></svg><span class=\"serve-ball\"></span></div><div class=\"cover-signature\">Open the upside.</div><span class=\"photo-label\">Illustrative court photography</span>",
    "source": "Ethereum Sepolia · Testnet / simulation",
    "notes": "Bayangin lapangan yang sama disewa berkali-kali. Ada aktivitas nyata, ada pembayaran, ada laba. Open Grounds membuka akses fractional ke hak manfaat ekonomi atas sebagian laba bersih venue olahraga. Jangan sebut token sebagai kepemilikan tanah atau saham PT. Tagline draft teman disempurnakan agar maknanya tepat. Ini proyek hackathon di Sepolia, bukan penawaran investasi publik."
  },
  {
    "title": "Sports Venue",
    "chapter": "Sports Venue",
    "className": "venue-divider",
    "seconds": 5,
    "source": "",
    "notes": "Lapangan olahraga adalah aset produktif: satu court dapat dipakai dan disewakan berulang kali.",
    "body": "<h2>Sports Venue</h2><svg class=\"divider-court\" viewBox=\"0 0 700 500\" aria-hidden=\"true\"><defs><linearGradient id=\"divider-surface\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#286c53\"/><stop offset=\"1\" stop-color=\"#4b8d63\"/></linearGradient><pattern id=\"divider-grain\" width=\"9\" height=\"9\" patternUnits=\"userSpaceOnUse\"><circle cx=\"2\" cy=\"3\" r=\".6\" fill=\"#fff\" opacity=\".12\"/><circle cx=\"7\" cy=\"7\" r=\".8\" fill=\"#122e23\" opacity=\".15\"/></pattern></defs><path d=\"M40 40h620v420H40z\" fill=\"url(#divider-surface)\"/><path d=\"M40 40h620v420H40z\" fill=\"url(#divider-grain)\"/><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path pathLength=\"1\" d=\"M40 40h620v420H40zM350 40v420M40 135h620M40 365h620M155 135v230h390V135\"/></g></svg>"
  },
  {
    "title": "Same court. Repeated rentals.",
    "chapter": "The asset economics",
    "className": "venue-economics",
    "seconds": 20,
    "source": "[S3] Jurnal Logistica · Planet Futsal, Batam (2024) · Single case, not a return forecast",
    "notes": "Studi Batam melaporkan NPV positif, IRR 7%, payback sembilan bulan, tetapi hanya satu studi kasus dan tabel biayanya punya inkonsistensi. Pakai untuk menunjukkan potensi kelayakan usaha, jangan untuk menjanjikan return. Tidak ada klaim OPEX hanya Rp2 juta. Data BPS dan AYO tidak dijumlahkan menjadi TAM.",
    "body": "<h2>Same court.<br>Repeated rentals.</h2><div class=\"rental-visual\"><svg viewBox=\"0 0 700 300\" role=\"img\" aria-label=\"A reusable court can serve repeated rentals; conceptual illustration\"><defs><linearGradient id=\"court-surface\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#155e49\"/><stop offset=\"1\" stop-color=\"#4f9d69\"/></linearGradient><pattern id=\"court-grain\" width=\"7\" height=\"7\" patternUnits=\"userSpaceOnUse\"><circle cx=\"2\" cy=\"2\" r=\".7\" fill=\"#fff\" opacity=\".12\"/><circle cx=\"6\" cy=\"5\" r=\".5\" fill=\"#102e20\" opacity=\".2\"/></pattern><clipPath id=\"court-clip\"><path d=\"M35 90L495 30l155 155-460 85z\"/></clipPath></defs><path d=\"M35 103L495 43l155 155-460 85z\" fill=\"#153c30\" opacity=\".22\"/><path d=\"M35 90L495 30l155 155-460 85z\" fill=\"url(#court-surface)\"/><g clip-path=\"url(#court-clip)\" fill=\"#c0e6af\" opacity=\".14\"><path d=\"M-20 130L650 43v30l-670 87zM-20 190l670-87v30l-670 87zM-20 250l670-87v30l-670 87z\"/></g><path d=\"M35 90L495 30l155 155-460 85z\" fill=\"url(#court-grain)\"/><path d=\"M273 68l139 137\" stroke=\"#102c24\" stroke-width=\"6\" opacity=\".35\"/><path d=\"M273 62l139 137\" stroke=\"#e7efde\" stroke-width=\"2\" stroke-dasharray=\"3 3\"/><g fill=\"none\" stroke=\"#F8FAFC\" stroke-width=\"3\"><path d=\"M65 100l420-54 134 132-420 62zM275 74l134 132M120 155l420-54M165 200l420-54\"/></g><path class=\"rental-loop\" pathLength=\"1\" d=\"M170 280C20 290-15 185 30 130M560 20c160-10 190 100 110 165\" fill=\"none\" stroke=\"#c25a00\" stroke-width=\"4\"/><path d=\"M18 139l12-9 6 14M660 174l10 11 13-8\" fill=\"none\" stroke=\"#c25a00\" stroke-width=\"4\"/></svg><div class=\"rental-steps\"><span>Rent</span><b>→</b><span>Play</span><b>→</b><span>Rent again</span></div></div><div class=\"batam-metrics\"><article><strong>+Rp38.8m</strong><span>NPV</span></article><article><strong>7%</strong><span>IRR</span></article><article><strong>≈9 months</strong><span>Payback</span></article></div><p class=\"economics-caption\">Planet Futsal · Batam, 2024 · One business studied</p>"
  },
  {
    "title": "The courts are already here.",
    "chapter": "The market",
    "className": "market",
    "seconds": 25,
    "body": "<h2>The courts are already here.</h2><div class=\"market-layout\"><div class=\"market-reach\"><h3>Villages with sports facilities</h3><p class=\"chart-caption\">Indonesia, 2024 · Number of desa/kelurahan [S1]</p><svg class=\"facility-chart\" viewBox=\"0 0 940 350\" role=\"img\" aria-label=\"BPS 2024: 48,886 villages with football, 36,540 badminton and 14,253 futsal facilities. These count villages, not courts.\"><g stroke=\"#dbe2ea\" stroke-width=\"1\"><path d=\"M165 35v269\"/><path d=\"M289 35v269\"/><path d=\"M413 35v269\"/><path d=\"M537 35v269\"/><path d=\"M661 35v269\"/><path d=\"M785 35v269\"/></g><g fill=\"#334155\" font-size=\"17\"><text x=\"165\" y=\"336\" text-anchor=\"middle\">0</text><text x=\"289\" y=\"336\" text-anchor=\"middle\">10k</text><text x=\"413\" y=\"336\" text-anchor=\"middle\">20k</text><text x=\"537\" y=\"336\" text-anchor=\"middle\">30k</text><text x=\"661\" y=\"336\" text-anchor=\"middle\">40k</text><text x=\"785\" y=\"336\" text-anchor=\"middle\">50k</text></g><text x=\"0\" y=\"90\" fill=\"#0F172A\" font-size=\"24\" font-weight=\"600\">Football</text><rect class=\"chart-bar bar-0\" x=\"165\" y=\"64\" width=\"606.1864\" height=\"40\" fill=\"#334155\"/><text class=\"chart-value\" x=\"783.1864\" y=\"91\" fill=\"#0F172A\" font-size=\"23\" font-weight=\"700\" data-count=\"48886\">48,886</text><text x=\"0\" y=\"180\" fill=\"#0F172A\" font-size=\"24\" font-weight=\"600\">Badminton</text><rect class=\"chart-bar bar-1\" x=\"165\" y=\"154\" width=\"453.096\" height=\"40\" fill=\"#94A3B8\"/><text class=\"chart-value\" x=\"630.096\" y=\"181\" fill=\"#0F172A\" font-size=\"23\" font-weight=\"700\" data-count=\"36540\">36,540</text><text x=\"0\" y=\"270\" fill=\"#0F172A\" font-size=\"24\" font-weight=\"600\">Futsal</text><rect class=\"chart-bar bar-2\" x=\"165\" y=\"244\" width=\"176.7372\" height=\"40\" fill=\"#c25a00\"/><text class=\"chart-value\" x=\"353.73720000000003\" y=\"271\" fill=\"#0F172A\" font-size=\"23\" font-weight=\"700\" data-count=\"14253\">14,253</text></svg><p class=\"chart-caveat\">Villages, not courts · Categories overlap · Not investment TAM.</p></div><aside class=\"booking-score\"><div class=\"ayo-brand\"><img src=\"/assets/ayo-logo.svg\" alt=\"AYO\"/><span>Digital bookings [S2]</span></div><strong data-count=\"6800\" data-suffix=\"+\">6,800+</strong><h3>courts to book</h3><div class=\"booking-mini\"><b data-count=\"900000\" data-suffix=\"+\">900,000+</b><span>users</span></div><div class=\"booking-mini\"><b data-count=\"100\" data-suffix=\"+\">100+</b><span>cities</span></div><small>2,000+ facilities · Company-reported</small><div class=\"ayo-mix\"><span>AYO courts by sport [S2]</span><svg viewBox=\"0 0 330 175\" role=\"img\" aria-label=\"AYO reports over 3700 padel, 1400 badminton, 400 tennis, 200 mini soccer, and 200 futsal courts. Selected categories; not a total.\"><g font-size=\"14\" fill=\"#334155\"><text x=\"0\" y=\"19\">Padel</text><text x=\"0\" y=\"49\">Badminton</text><text x=\"0\" y=\"79\">Tennis</text><text x=\"0\" y=\"109\">Mini soccer</text><text x=\"0\" y=\"139\">Futsal</text></g><g fill=\"#FF7A00\"><rect class=\"mix-bar\" x=\"100\" y=\"6\" width=\"148\" height=\"16\"/><rect class=\"mix-bar\" x=\"100\" y=\"36\" width=\"56\" height=\"16\"/><rect class=\"mix-bar\" x=\"100\" y=\"66\" width=\"16\" height=\"16\"/><rect class=\"mix-bar\" x=\"100\" y=\"96\" width=\"8\" height=\"16\"/><rect class=\"mix-bar\" x=\"100\" y=\"126\" width=\"8\" height=\"16\"/></g><g font-size=\"14\" fill=\"#0F172A\"><text x=\"253\" y=\"19\">3,700+</text><text x=\"162\" y=\"49\">1,400+</text><text x=\"122\" y=\"79\">400+</text><text x=\"114\" y=\"109\">200+</text><text x=\"114\" y=\"139\">200+</text></g><text x=\"0\" y=\"170\" font-size=\"12\" fill=\"#334155\">Selected categories · Company-reported</text></svg></div></aside></div>",
    "source": "[S1] BPS (2024): villages, not courts · [S2] AYO: company-reported (10 Oct 2026)",
    "notes": "Pasarnya sudah ada; kita tidak menciptakan kebiasaan olahraga baru. BPS mencatat 14.253 desa/kelurahan dengan fasilitas futsal pada 2024. Itu bukan jumlah court dan bukan jumlah venue yang memenuhi syarat Open Grounds. Rincian AYO: 2.000+ fasilitas olahraga; 3.700+ padel, 1.400+ badminton, 400+ tennis, 200+ mini soccer dan 200+ futsal courts. Ini company-reported dan tidak dijumlahkan sebagai TAM. Data AYO menunjukkan booking sudah digital: lebih dari 6.800 court, 900 ribu pengguna, di lebih dari 100 kota. AYO bukan partner kita. Studi Batam melaporkan NPV positif, IRR 7%, payback sembilan bulan, tetapi hanya satu studi kasus dan tabel biayanya punya inkonsistensi. Pakai untuk menunjukkan potensi kelayakan usaha, jangan untuk menjanjikan return. Tidak ada klaim OPEX hanya Rp2 juta. Data BPS dan AYO tidak dijumlahkan menjadi TAM."
  },
  {
    "title": "The Problem",
    "chapter": "The problem",
    "className": "problem visual-problem",
    "seconds": 25,
    "source": "Problem thesis · Validate with owners and investors",
    "notes": "Owner yang ingin renovasi atau menambah court masih bergantung pada modal sendiri, utang atau investor besar. Investor retail sulit ikut hak ekonomi venue produktif dalam unit kecil. Dua sisi ini belum terhubung dengan mudah. Ini problem thesis dari PRD, bukan survei pelanggan.",
    "body": "<div class=\"problem-statements\"><article class=\"owner-gap\"><svg class=\"problem-court\" viewBox=\"0 0 600 650\" aria-hidden=\"true\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M40 50h520v550H40zM40 325h520M150 50v550M450 50v550M40 190h520M40 460h520\"/><path d=\"M100 540h130m150 0h130\" stroke-width=\"6\"/><path d=\"M260 510l50 60\" stroke-width=\"8\"/></g></svg><h2>Owners need<br>capital.</h2></article><article class=\"investor-gap\"><svg class=\"problem-people\" viewBox=\"0 0 650 300\" aria-hidden=\"true\"><g fill=\"currentColor\"><circle cx=\"65\" cy=\"110\" r=\"20\"/><circle cx=\"145\" cy=\"110\" r=\"20\"/><circle cx=\"225\" cy=\"110\" r=\"20\"/><path d=\"M40 210v-60h50v60M120 210v-60h50v60M200 210v-60h50v60\"/></g><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\"><path d=\"M320 45v210\" stroke-width=\"8\"/><path d=\"M400 75h200v140H400zM400 145h200M450 75v140M550 75v140\"/></g></svg><h2>Retail investors<br>can’t easily join.</h2></article></div>"
  },
  {
    "title": "Open Grounds",
    "chapter": "The solution",
    "className": "platform-intro concise-intro visual-intro",
    "seconds": 15,
    "source": "Product model · Ethereum Sepolia prototype",
    "notes": "Open Grounds adalah platform yang menghubungkan venue olahraga dengan modal melalui hak fractional atas laba bersih yang dapat dibagikan. Owner mendapat akses modal; investor dapat berpartisipasi dalam unit kecil. Ini penjelasan solusi singkat sebelum mekanismenya.",
    "body": "<div class=\"intro-photo\"><img src=\"/assets/player.jpg\" alt=\"Illustrative aerial tennis court photography\"/></div><div class=\"intro-copy\"><img class=\"intro-og-mark\" src=\"/assets/og-logo.png\" alt=\"\"/><h2>Open<br>Grounds.</h2><p class=\"intro-definition\">Connecting sports venues with capital through fractional rights to distributable net profits.</p></div><svg class=\"intro-court-line\" viewBox=\"0 0 500 700\" aria-hidden=\"true\"><path pathLength=\"1\" d=\"M35 35h430v630H35zM35 350h430M125 35v630M375 35v630M35 180h430M35 520h430\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\"/></svg>"
  },
  {
    "title": "How Open Grounds works.",
    "chapter": "How it works",
    "className": "solution",
    "seconds": 35,
    "body": "<h2>One venue.<br>Shared upside.</h2><p class=\"lead\">Growth capital for owners. Fractional profit access for investors.</p><div class=\"solution-route\"><article class=\"route-owner\"><svg viewBox=\"0 0 240 115\" fill=\"none\" aria-hidden=\"true\"><path d=\"M15 27L172 9l54 60-159 35z\" fill=\"#FF7A00\"/><g stroke=\"#F8FAFC\" stroke-width=\"2\"><path d=\"M32 34l132-16 44 48-133 29zM98 26l44 49M50 54l132-16M64 75l131-16\"/><path d=\"M38 105h174\" stroke=\"#94A3B8\"/></g></svg><h3>Venue owner</h3><p>Uploads the venue.<br>Offers profit rights.</p><b>Receives upfront capital</b></article><div class=\"route-pass\"><svg viewBox=\"0 0 135 160\" aria-hidden=\"true\"><path class=\"route-line\" pathLength=\"1\" d=\"M5 65h115m-12-10l12 10-12 10M120 108H5m12-10L5 108l12 10\" fill=\"none\" stroke=\"#c25a00\" stroke-width=\"3\"/></svg></div><article class=\"route-platform\"><img src=\"/assets/og-logo.png\" alt=\"\"/><h3>Grounds / SPV</h3><p>Acquires the rights.<br>Issues fractional units.</p><b>Open Grounds verifies + services</b></article><div class=\"route-pass\"><svg viewBox=\"0 0 135 160\" aria-hidden=\"true\"><path class=\"route-line\" pathLength=\"1\" d=\"M5 65h115m-12-10l12 10-12 10M120 108H5m12-10L5 108l12 10\" fill=\"none\" stroke=\"#c25a00\" stroke-width=\"3\"/></svg></div><article class=\"route-investors\"><svg class=\"token-units\" viewBox=\"0 0 240 115\" aria-hidden=\"true\"><rect x=\"16\" y=\"15\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"59\" y=\"15\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"102\" y=\"15\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"145\" y=\"15\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"188\" y=\"15\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"16\" y=\"57\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"59\" y=\"57\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#FF7A00\"/><rect x=\"102\" y=\"57\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#cbd5e1\"/><rect x=\"145\" y=\"57\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#cbd5e1\"/><rect x=\"188\" y=\"57\" width=\"31\" height=\"31\" rx=\"2\" fill=\"#cbd5e1\"/></svg><h3>Investors</h3><p>Buy fractional units.<br>Share net profits.</p><b>Receives distributions</b></article></div><div class=\"distribution-lane\"><span>Venue activity</span><div class=\"lane-line\"><i class=\"cash-dot\"></i></div><span>Verified net profit</span><div class=\"lane-line\"><i class=\"cash-dot\"></i></div><span>Monthly investor balance</span></div><p class=\"fine-risk\">Economic rights, not land. Token ini tidak dijamin oleh aset venue. Returns and liquidity are not guaranteed.</p>",
    "source": "Upfront acquisition payment and rupiah rails simulated in the hackathon",
    "notes": "Open Grounds mempertemukan owner venue produktif yang butuh modal dengan investor yang ingin ikut manfaat ekonomi. Owner tetap mengoperasikan venue. Yang ditawarkan adalah hak atas sebagian laba bersih yang dapat dibagikan, bukan tanah atau saham perusahaan. Owner sendiri mengunggah venue, dokumen badan usaha, sertifikat tanah dan histori keuangan dari portal owner. Operator dan reviewer memverifikasi; Grounds/SPV menangani negosiasi dan persetujuan deal di back office, bukan upload venue. Setelah deal disetujui, owner menandatangani pengalihan hak. Owner menjual X% hak manfaat ekonomi atas laba bersih yang bisa dibagikan ke Grounds, SPV pembeli hak sekaligus penerbit token. Grounds membayar owner di depan; di demo ini disimulasikan. Token dicetak sekali ke treasury lalu dijual berkelanjutan. Investor beli dengan rupiah, KYC dan rekening nama sendiri, serta menandatangani order lewat Privy. Uang wajib masuk sebelum alokasi. Venue tetap dioperasikan owner, laporan laba disahkan, lalu dana distribusi masuk saldo ledger investor untuk ditarik atau reinvest. Hak ini bukan omzet, tanah, atau saham PT. Tidak ada tenor atau burn, transfer antar investor dilarang. Jual balik hanya saat lot terbuka, seri Active dan cadangan treasury tersedia; tidak dijamin. Bentuk hukum, izin dan struktur SPV produksi masih terbuka; jangan memilih bentuk hukum seolah sudah final."
  },
  {
    "title": "The business behind the grounds.",
    "chapter": "Business model canvas",
    "className": "bmc-slide",
    "seconds": 30,
    "body": "<h2>The business behind<br>the grounds.</h2><span class=\"bmc-label\">Business model canvas · Proposed model, pre-validation</span><div class=\"bmc\"><article class=\"partners\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 17v-2a4 4 0 0 1 4-4h2m6 0h2a4 4 0 0 1 4 4v2M12 12v6M7 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M17 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6\"/></svg><span>Key partners</span></h3><p>Owners · Reviewers<br>Payments¹ · Legal¹</p></article><article class=\"activities\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m4 12 5 5 11-11\"/></svg><span>Key activities</span></h3><p>Verify · Structure<br>Distribute</p></article><article class=\"resources\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 7l9-5 9 5v10l-9 5-9-5V7m0 0 9 5 9-5m-9 5v10\"/></svg><span>Key resources</span></h3><p>Venue data · Contracts<br>SPV capital¹</p></article><article class=\"value\"><svg class=\"bmc-court\" viewBox=\"0 0 200 320\" aria-hidden=\"true\"><path d=\"M15 15h170v290H15zM15 160h170M50 15v290M150 15v290M15 80h170M15 240h170\"/></svg><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 19V5h16v14H4m8-14v14M4 9h16M4 15h16\"/></svg><span>Value propositions</span></h3><p><b>Owners</b><br>Capital + Keep operating</p><p><b>Investors</b><br>Profit access + Visibility</p></article><article class=\"relations\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 3h18v13H8l-5 5V3\"/></svg><span>Relationships</span></h3><p>Owner uploads<br>Investor self-service<br>Monthly reports</p></article><article class=\"channels\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 12h15m-5-5 5 5-5 5M5 4h14M5 20h14\"/></svg><span>Channels</span></h3><p>Web · Owner networks²<br>Sports communities²</p></article><article class=\"segments\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-3a6 6 0 0 1 12 0v3m4-16a3 3 0 0 1 0 6m-1 3a5 5 0 0 1 5 5v2\"/></svg><span>Segments</span></h3><p><b>Owners</b><br>Owned land<br>≥12 months · ≥90% digital</p><p><b>Investors</b><br>KYC-approved</p></article><article class=\"costs\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 3h14v18l-3-2-4 2-4-2-3 2V3m4 5h6m-6 4h6m-6 4h4\"/></svg><span>Cost structure</span></h3><p>Verification · Legal¹ · Tech · Payments<br>Grounds: acquisition capital + reserves</p></article><article class=\"revenue\"><h3><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 18l6-6 5 3 7-11m-7 0h7v7\"/></svg><span>Revenue streams</span></h3><p><b>Platform:</b> recurring fee (TBD)<br><b>Grounds:</b> 2% [Asumsi] × SPV profit share</p></article></div><div class=\"bmc-footnote\">¹ Unconfirmed production dependencies. ² Proposed channels.</div>",
    "source": "Platform fee, legal structure and SPV funding remain open decisions",
    "notes": "Bisnis dibangun di sekitar servicing venue yang sudah produktif, bukan spekulasi harga token. Owner target harus punya tanah sendiri tidak dijaminkan, histori minimal 12 bulan dan pendapatan digital minimal 90%. Investor wajib KYC dan rekening nama sendiri. Nilainya untuk owner adalah modal di depan sambil tetap operasi; untuk investor akses fractional dan laporan. Pendapatan platform adalah fee bulanan dari waterfall, tarif belum diputuskan. Grounds entitas terpisah mendapat fee manajemen 2% dari bagian SPV, masih asumsi. Jangan gabungkan fee SPV sebagai revenue platform. Model punya kebutuhan modal nyata: Grounds harus mendanai akuisisi sebelum semua token laku, lalu memegang risiko inventory dan cadangan. Sumber modal, struktur hukum, izin dan partner produksi belum final. Channels owner networks dan sports communities adalah proposal, bukan traction. Tidak menganggap langganan PoS atau issuance fee sebagai revenue yang sudah ditetapkan.",
    "hidden": true
  },
  {
    "title": "Open the upside.",
    "chapter": "The next step",
    "className": "closing",
    "seconds": 10,
    "body": "<div class=\"closing-photo\"><img src=\"/assets/basketball.jpg\" alt=\"Basketball hoop and ball, illustrative sports photography\"/></div><div class=\"closing-main\"><h2>Open<br>the upside.</h2><p class=\"closing-tagline\">A venue can serve more<br>than the people on its court.</p><div class=\"closing-ask\"></div><a class=\"closing-repo\" href=\"https://github.com/senarais/opengrounds\" target=\"_blank\" rel=\"noopener noreferrer\">github opengrounds ↗</a><div class=\"closing-status\"><span>ETHJKT 2026 / Ethereum Sepolia</span></div></div><div class=\"closing-court\" aria-hidden=\"true\"><svg viewBox=\"0 0 700 700\"><g fill=\"none\" stroke=\"#F8FAFC\" stroke-width=\"2\"><path class=\"closing-court-line\" pathLength=\"1\" d=\"M55 645V55h590v590M55 420a295 295 0 0 1 590 0M250 55v190h200V55M250 245a100 100 0 0 0 200 0\"/></g></svg></div>",
    "source": "",
    "notes": "Tutup singkat: Open Grounds menghubungkan venue produktif dengan akses modal dan partisipasi atas hak manfaat ekonomi. Next step yang diusulkan adalah validasi satu venue bersama owner, reviewer independen, counsel dan penyedia pembayaran. Tidak mengklaim ada pilot atau partnership. Web dan kontrak ada; full end-to-end Sepolia belum terverifikasi menurut status proyek. Rupiah, split, escrow dan pembayaran akuisisi disimulasikan. Open Grounds belum berizin; aset bukan jaminan, imbal hasil dan likuiditas tidak dijamin. Tidak perlu mencantumkan nama anggota tim."
  }
];
