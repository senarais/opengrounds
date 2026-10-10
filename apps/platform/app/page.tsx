import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ShieldCheck } from "lucide-react";
import { VenueReel } from "@/components/VenueReel";
import { HeroAtmosphere } from "@/components/HeroAtmosphere";
import { listProducts } from "@/lib/flows/series";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Open Grounds · Real venues. Shared possibilities.",
  description: "Explore a share of the distributable net profit of sports venues. Meet Open Grounds, the platform connecting venue owners, Grounds, and investors. Sepolia testnet demo.",
};

const steps = [
  { title: "A venue comes on board.", text: "The owner uploads the venue and supporting documents. An operator and an independent reviewer check the business, land ownership, and reconciled financial history." },
  { title: "Rights become tokens.", text: "The owner sells a chosen share of distributable net profit to Grounds and receives an upfront payment (simulated). Owner and platform signatures activate a fixed token supply." },
  { title: "You choose to take part.", text: "Complete KYC and verify your bank account. Sign your order and pay in rupiah. Tokens are allocated only after payment settles, with a lock period for each purchase." },
  { title: "Performance becomes a distribution.", text: "Each month, approved figures determine the profit available to share. Your allocation is credited to your balance, ready to withdraw or reinvest." },
];

const questions = [
  { title: "What does a token actually represent?", answer: "A token represents a portion of the economic rights Grounds acquired over a venue’s distributable net profit. It is not ownership of the land or venue, and it is not a share in the owner’s company. The venue owner keeps operating the business." },
  { title: "How is the reference price calculated?", answer: <>Valuation is the lower of the venue’s asset value and its verified 12-month distributable profit divided by an assumed capitalization rate. The acquired percentage and fixed supply determine the reference price. Assets are a pricing benchmark, not collateral. <Link href="/cara-kerja#rumus">See the formula and assumptions <ArrowUpRight size={16} aria-hidden /></Link></> },
  { title: "Are returns or buybacks guaranteed?", answer: "No. Distributions depend on the venue’s performance after expenses, taxes, fees, and reserves. Buyback requests depend on unlocked lots, an Active series, available reserves, and Grounds’ buyback window. There is no guaranteed return or liquidity, and investor-to-investor transfers are not allowed." },
  { title: "What is recorded on Ethereum?", answer: "Signatures, token balances, approved profit periods, and the rules governing transactions are checked on Ethereum Sepolia. Rupiah payments, bank accounts, and investor balances remain off-chain. On-chain records are not proof of legal ownership." },
  { title: "Can I use real money today?", answer: "No. This is an ETHJKT 2026 hackathon demo on Ethereum Sepolia. Acquisition payments, escrow, and distributions are simulated. Open Grounds is not licensed or approved by a regulator to offer these products." },
];

const sportNames: Record<string, string> = { tenis: "Tennis", futsal: "Futsal", padel: "Padel", basket: "Basketball", basketball: "Basketball", badminton: "Badminton" };

export default async function Landing() {
  const products = await listProducts().catch(() => null);
  const live = products?.filter(({ series }) => series.status === "Active") ?? [];

  return (
    <main className="og-landing" id="main-content" lang="en">
      <section className="og-hero" aria-labelledby="hero-title">
        <HeroAtmosphere />
        <div className="og-wrap og-hero-content">
          <span className="og-kicker">Sports venues. A shared opportunity.</span>
          <h1 id="hero-title"><span>Open</span> <span>Grounds.</span></h1>
          <p className="og-hero-tagline">Real venues. Shared possibilities.</p>
          <p className="og-hero-description">Participate in a share of sports venues’ <strong>distributable net profit.</strong> Real activity. Clear rules.</p>
          <div className="og-actions"><Link className="og-button og-button-dark" href="/products">Explore venues <ArrowUpRight size={20} aria-hidden /></Link><a className="og-text-link" href="#how-it-works">Get to know the model <ArrowDown size={17} aria-hidden /></a></div>
        </div>
        <div className="og-wrap og-hero-caption"><span>Made for Indonesia · Built around play</span><a href="#the-grounds">Meet the grounds <ArrowDown size={15} aria-hidden /></a></div>
      </section>

      <section className="og-intro og-wrap og-section" id="the-grounds" aria-labelledby="intro-title">
        <div><span className="og-kicker">A different kind of participation</span><h2 id="intro-title">You know the game.<br />Now meet <span className="og-highlight">the grounds.</span></h2></div>
        <div className="og-intro-copy"><p className="og-lead">Great venues bring people together.<br />Their economic opportunity can, too.</p><p>Venue owners keep their land and run their business. Grounds, our special-purpose vehicle (SPV), acquires a share of the distributable net profit. Open Grounds makes those rights accessible as tokens, with rules you can inspect.</p><a className="og-text-link" href="#how-it-works">See how everyone connects <ArrowRight size={18} aria-hidden /></a></div>
        <figure className="og-intro-photo">
          <Image src="/landing-player.jpg" alt="A tennis player serving on a sunlit clay court" fill sizes="(max-width: 1400px) 94vw, 1320px" />
          <div className="og-photo-note"><span className="og-photo-note-dot" aria-hidden /><span>Places for people.<br /><strong>Possibilities beyond play.</strong></span></div>
          <figcaption>Illustrative photography · not a listed venue</figcaption>
        </figure>
      </section>

      <section className="og-gallery-section" aria-labelledby="gallery-title">
        <div className="og-wrap og-gallery-heading"><span className="og-kicker">The places behind the possibility</span><h2 id="gallery-title">Different sports.<br /><span className="og-italic">Common ground.</span></h2><p>Courts, pitches, and the everyday energy of people playing.</p></div>
        <VenueReel />
        <div className="og-wrap og-gallery-caption"><span>Tennis <i aria-hidden /> Padel <i aria-hidden /> Futsal <i aria-hidden /> Basketball</span><span>Reference imagery, not investment listings.</span></div>
      </section>

      <section className="og-process og-section" id="how-it-works" aria-labelledby="process-title">
        <div className="og-wrap">
          <div className="og-section-heading"><div><span className="og-kicker">From court to participation</span><h2 id="process-title">Real activity.<br /><span className="og-highlight">A clear process.</span></h2></div><p>Three parties, distinct responsibilities.<br />Owners operate. Grounds acquires.<br />Investors participate.</p></div>
          <ol className="og-steps">{steps.map((step, i) => <li key={step.title}><span className="og-step-number">0{i + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
          <div className="og-process-note"><ShieldCheck size={23} aria-hidden /><p><strong>Approval is shared.</strong> Token activation needs owner and platform signatures. Monthly profit needs the owner’s sign-off, or an independent verifier after the owner’s deadline. An AI check never replaces human approval.</p><Link className="og-text-link" href="/cara-kerja">The full model <ArrowUpRight size={18} aria-hidden /></Link></div>
        </div>
      </section>

      <section className="og-listings og-wrap og-section" id="venues" aria-labelledby="venues-title">
        <div className="og-section-heading"><div><span className="og-kicker">Explore the platform</span><h2 id="venues-title">Meet the venues.</h2></div><Link className="og-text-link" href="/products">All venues <ArrowUpRight size={20} aria-hidden /></Link></div>
        <p className="og-listings-description">Each active series represents economic rights in one venue. Read its figures, terms, and risks before making a decision.</p>
        {live.length ? <div className="og-venue-list">{live.slice(0, 3).map(({ series: s, venue: v }) => <Link className="og-venue-row" key={s.id} href={`/products/${s.id}`}><div><span className="og-series-label">Active · testnet series</span><h3>{v.name}</h3><p>{v.city} · {(v.sports ?? []).map((sport: string) => sportNames[sport.toLowerCase()] ?? sport).join(" / ")}</p></div><div className="og-venue-price"><span>Reference price / token</span><strong>{rp(Number(s.ref_price))}</strong></div><div className="og-venue-share"><span>Economic rights acquired</span><strong>{s.stake_bps / 100}%</strong></div><ArrowUpRight size={28} aria-hidden /></Link>)}</div> : <div className="og-listings-empty"><div className="og-court-outline" aria-hidden><span /></div><div><h3>{products === null ? "Listings are temporarily unavailable." : "The next ground starts with an owner."}</h3><p>{products === null ? "Open the venue catalogue to try again and explore the platform." : "No active series yet. A venue appears here after review, owner approval, and activation. You can explore the model in the meantime."}</p><Link className="og-text-link" href={products === null ? "/products" : "/owner"}>{products === null ? "Open venue catalogue" : "Discover the owner pathway"} <ArrowUpRight size={18} aria-hidden /></Link></div></div>}
        <p className="og-small-note">Reference prices follow <Link href="/cara-kerja#rumus">a published valuation formula</Link>. Tokens are not backed or guaranteed by venue assets. Returns and liquidity are not guaranteed.</p>
      </section>

      <section className="og-owner" id="for-owners" aria-labelledby="owner-title">
        <div className="og-wrap og-owner-grid">
          <figure className="og-owner-photo"><Image src="/landing-padel.jpg" alt="An indoor padel court with blue playing surfaces and glass walls" fill sizes="(max-width: 760px) 90vw, 50vw" /><figcaption>Reference venue photography · Alsager Padel</figcaption></figure>
          <div className="og-owner-copy"><span className="og-kicker">For venue owners</span><h2 id="owner-title">Your venue.<br />Your vision.<br /><span className="og-highlight">Room to grow.</span></h2><p>Sell a share of distributable net profit to Grounds for an upfront payment (simulated in this demo). Keep your venue, your land, and your role as operator.</p><ul className="og-owner-checks"><li><Check size={18} aria-hidden /> Self-owned land, not pledged as collateral</li><li><Check size={18} aria-hidden /> At least 12 months of financial history</li><li><Check size={18} aria-hidden /> At least 90% digitally recorded revenue</li><li><Check size={18} aria-hidden /> Business, signatory, and beneficial-owner checks</li></ul><Link className="og-button og-button-primary" href="/owner">Get to know the owner pathway <ArrowUpRight size={20} aria-hidden /></Link><p className="og-owner-footnote">Create an owner account first. Upload your venue and documents yourself. Grounds manages the acquisition deal in its back office; you review and sign the transfer.</p></div>
        </div>
      </section>

      <section className="og-faq og-wrap og-section" aria-labelledby="faq-title">
        <div><span className="og-kicker">A few things worth knowing</span><h2 id="faq-title">Good questions.<br /><span className="og-italic">Straight answers.</span></h2><p>Understand what you’re participating in.</p><Link className="og-text-link" href="/cara-kerja">Go deeper into the model <ArrowUpRight size={18} aria-hidden /></Link></div>
        <div className="og-faq-list">{questions.map((q) => <details key={q.title}><summary>{q.title}<ChevronDown size={21} aria-hidden /></summary><div className="og-faq-answer">{q.answer}</div></details>)}</div>
      </section>

      <section className="og-closing" aria-labelledby="closing-title"><div className="og-wrap"><span className="og-kicker">Open grounds. Open possibilities.</span><h2 id="closing-title">There’s more to<br /><span>the places we play.</span></h2><Link className="og-button og-button-dark" href="/products">Find your ground <ArrowUpRight size={21} aria-hidden /></Link><p>Start with the venue. Understand the model. Decide for yourself.</p></div></section>
    </main>
  );
}
