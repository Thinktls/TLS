import { useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronRight, Menu, Sparkles, Search, Reply, Forward,
  Archive, Trash2, MoreHorizontal, Paperclip, Plus,
  Clock, AlertTriangle, Send, Star,
} from 'lucide-react'

// ─── Primitives ────────────────────────────────────────────────────────────────

function LogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" fill="white" className={className}>
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  )
}

const LOGIN_URL = 'http://localhost:3000/login'

function PrimaryButton({ label = 'Get Started', full = false, href = LOGIN_URL }: { label?: string; full?: boolean; href?: string }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98] no-underline ${full ? 'w-full' : ''}`}
    >
      {label}
      <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-[1px]" />
    </a>
  )
}

function SectionEyebrow({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-white/70">
      <span className="w-1.5 h-1.5 rounded-full bg-white" />
      {label}
      {tag && (
        <span className="px-2 py-0.5 rounded-full border border-white/10 text-white/50 text-xs">{tag}</span>
      )}
    </div>
  )
}

const gradientStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'url(#c3-noise)',
}

// ─── Navbar ────────────────────────────────────────────────────────────────────

function Navbar() {
  const navLinks = ['Features', 'How It Works', 'Pricing', 'Contact']
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative z-20 py-4"
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="w-7 h-7" />
          <span className="text-sm font-semibold text-white/90 tracking-tight">ThinkTLS</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link, i) => (
            <motion.a
              key={link}
              href="#"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
              className="text-white/70 text-sm font-medium hover:text-white transition-colors"
            >
              {link}
            </motion.a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a
            href={LOGIN_URL}
            className="text-white/60 text-sm font-medium hover:text-white transition-colors"
          >
            Sign In
          </a>
          <PrimaryButton label="Request Access" />
        </div>

        <button className="md:hidden w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
          <Menu className="w-4 h-4" />
        </button>
      </div>
    </motion.nav>
  )
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="pt-16 md:pt-28 pb-20 text-center flex flex-col items-center relative z-10 px-6">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-4xl md:text-7xl font-semibold tracking-tight leading-[0.9]"
      >
        <span className="block text-white">Your bids.</span>
        <span className="block animate-shiny" style={gradientStyle}>Automated.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-8 text-white/60 max-w-md text-base leading-[1.5]"
      >
        ThinkTLS Bid Desk is an internal platform for IT hardware bid automation. Upload master files, match line items with AI precision, and generate winning deal reports — in a single round.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        <PrimaryButton label="Request Early Access" />
        <span className="text-xs text-white/30">Internal tool — for ThinkTLS teams only</span>
      </motion.div>
    </section>
  )
}

// ─── App Bar ───────────────────────────────────────────────────────────────────

function MenuBar() {
  const menuItems = ['Rounds', 'Buyers', 'Reports', 'Exceptions', 'Settings']
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.4 }}
      className="relative z-10 h-10 bg-black/40 backdrop-blur-md border-t border-b border-white/10"
    >
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <LogoMark className="w-3.5 h-3.5" />
          <span className="font-bold text-white">ThinkTLS Bid Desk</span>
          {menuItems.map((item, i) => (
            <span
              key={item}
              className={`text-white/70 hover:text-white cursor-default transition-colors
                ${i > 2 ? 'hidden sm:inline' : ''}
                ${i > 3 ? 'hidden md:inline' : ''}`}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-white/60">
          <Search className="w-3.5 h-3.5" />
          <span>Bid Desk v1.0</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Bid Desk Mockup ───────────────────────────────────────────────────────────

function BidDeskMockup() {
  const rounds = [
    { id: 1, from: 'Round A — Laptops', subject: 'Multiple buyers · Large volume', preview: 'Processing complete. Some exceptions require review before winner selection...', time: '9:41 AM', unread: true, active: true },
    { id: 2, from: 'Round B — Networking', subject: 'Multiple buyers · Mid volume', preview: 'Exceptions have been flagged. Partial matches need manual review before...', time: '8:12 AM', unread: true, active: false },
    { id: 3, from: 'Round C — Servers', subject: 'Multiple buyers · High volume', preview: 'Winners selected across all matched items. Deal report ready for export.', time: 'Yesterday', unread: false, active: false },
    { id: 4, from: 'Round D — Desktops', subject: 'Winners selected · Deal export ready', preview: 'Deal approved and queued for Razor ERP push. Awaiting final review.', time: 'Yesterday', unread: false, active: false },
    { id: 5, from: 'Round E — Mobile Devices', subject: 'Items matched · Ready to process', preview: 'All submissions processed. High fuzzy match rate. Ready for winner...', time: 'Mon', unread: false, active: false },
    { id: 6, from: 'Round F — Storage', subject: 'Round closed · Approval pending', preview: 'Round has been closed. Bid processing complete. Awaiting admin approval...', time: 'Mon', unread: false, active: false },
  ]

  const sidebarNav = [
    { icon: Star, label: 'Active Rounds', count: 3, active: true, red: false },
    { icon: Clock, label: 'Processing', count: 1, active: false, red: false },
    { icon: Send, label: 'Closed', count: undefined, active: false, red: false },
    { icon: AlertTriangle, label: 'Exceptions', count: undefined, active: false, red: true },
    { icon: Archive, label: 'Archive', count: undefined, active: false, red: false },
    { icon: Trash2, label: 'Trash', count: undefined, active: false, red: false },
  ]

  const labels = [
    { label: 'Laptops', color: '#00d2ff' },
    { label: 'Servers', color: '#A4F4FD' },
    { label: 'Networking', color: '#f59e0b' },
    { label: 'Storage', color: '#10b981' },
  ]

  return (
    <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
      >
        {/* Title bar */}
        <div className="flex items-center px-4 py-3 border-b border-white/10 bg-black/20">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center text-xs text-white/50">ThinkTLS — Bid Desk</span>
        </div>

        {/* Three-pane body */}
        <div className="grid grid-cols-12 h-[520px]">

          {/* Sidebar */}
          <div className="col-span-3 border-r border-white/10 bg-black/30 p-4 flex flex-col gap-4">
            <button className="flex items-center gap-2 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2 w-full">
              <Plus className="w-3.5 h-3.5" />
              New Bid Round
            </button>

            <nav className="flex flex-col gap-0.5">
              {sidebarNav.map(({ icon: Icon, label, count, active, red }) => (
                <button
                  key={label}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'}`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {count !== undefined && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${red ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/60'}`}>{count}</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="mt-auto">
              <p className="text-[9px] uppercase tracking-widest text-white/30 mb-2 px-2">Commodity</p>
              {labels.map(({ label, color }) => (
                <button key={label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/60 hover:bg-white/5 w-full">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Round list */}
          <div className="col-span-4 border-r border-white/10 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <span className="text-xs text-white/30">Search rounds</span>
            </div>
            <div className="flex-1 overflow-auto">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className={`px-3 py-3 border-b border-white/5 cursor-pointer transition-colors ${round.active ? 'bg-white/[0.08]' : 'hover:bg-white/5'}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className={`text-xs font-medium ${round.unread ? 'text-white' : 'text-white/70'}`}>{round.from}</span>
                    <span className="text-[10px] text-white/30 shrink-0 ml-2">{round.time}</span>
                  </div>
                  <p className="text-[10px] text-white/50 mb-0.5 truncate">{round.subject}</p>
                  <p className="text-[10px] text-white/30 truncate">{round.preview}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Detail reader */}
          <div className="col-span-5 flex flex-col">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 bg-black/20">
              {([Reply, Forward, Archive, Trash2] as React.ElementType[]).map((Icon, i) => (
                <button key={i} className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-white/50" />
                </button>
              ))}
              <div className="flex-1" />
              <button className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center">
                <MoreHorizontal className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 text-xs">
              <h3 className="text-sm font-semibold text-white mb-3">Round A — Laptops</h3>

              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] flex items-center justify-center text-[10px] font-bold text-white shrink-0">A</div>
                <div>
                  <p className="text-white/80 font-medium text-[11px]">ThinkTLS Bid Desk</p>
                  <p className="text-white/40 text-[10px]">Sent to all invited buyers</p>
                </div>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-[9px] shrink-0">Laptops</span>
              </div>

              {/* AI match summary card */}
              <div className="liquid-glass rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: '#A4F4FD' }} />
                  <span className="text-[10px] font-semibold text-white/80">Match Summary by ThinkTLS</span>
                </div>
                <p className="text-white/60 text-[10px] leading-[1.5]">
                  All buyer files processed. High exact-match rate achieved. A small number of items are flagged for manual review before winner selection can run.
                </p>
              </div>

              <div className="space-y-2.5 text-white/60 leading-[1.6] text-[11px]">
                <p className="text-white/80">Round closed.</p>
                <p>All submitted buyer files have been parsed and matched against the master list. Exact matches were handled automatically. Fuzzy matches above the 88% threshold were auto-accepted.</p>
                <p>A small number of items fell below the confidence threshold and are waiting in the exception queue. Review these before running final winner selection.</p>
                <p>Winners are selected on highest price. Losers receive a notice with the adjusted comparison price per their configured profile.</p>
                <p className="text-white/40">— ThinkTLS Bid Desk</p>
              </div>

              <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 w-fit">
                <Paperclip className="w-3 h-3 text-white/40" />
                <span className="text-[10px] text-white/60">round-a-comparison.xlsx</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ─── Feature: Matching ─────────────────────────────────────────────────────────

function FeatureMatch() {
  const categories = [
    { label: 'Exact Match', color: '#ffffff', items: ['Part #001 — 100% · normalized exact', 'Part #002 — 100% · normalized exact'] },
    { label: 'Fuzzy Match', color: '#e5e5e5', items: ['Part #003 — 94% · auto-accepted', 'Part #004 — 91% · auto-accepted'] },
    { label: 'Under Review', color: '#a3a3a3', items: ['Part #005 — 72% · needs review', 'Part #006 — 68% · needs review'] },
    { label: 'Unmatched', color: '#525252', items: ['Part #007 — below threshold · exception queue'] },
  ]

  return (
    <section className="max-w-6xl mx-auto px-6 py-20 md:py-28">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <SectionEyebrow label="Matching" tag="AI-native" />
          <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
            Clear your rounds<br />in a single pass.
          </h2>
          <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">
            ThinkTLS reads every line item, normalizes part numbers, and routes noise away from signal. Exact matches, fuzzy matches, and AI fallbacks — focus on exceptions, not administration.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {['Auto-normalize parts', 'Fuzzy matching (88%+)', 'AI semantic fallback', 'Exception queue'].map((chip) => (
              <span key={chip} className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
                {chip}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="liquid-glass rounded-2xl p-5"
        >
          <p className="text-xs text-white/40 mb-4">Example round · Items matched by tier</p>
          <div className="space-y-3">
            {categories.map(({ label, color, items }) => (
              <div key={label} className="liquid-glass rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color }}>{label}</span>
                </div>
                {items.map((item) => (
                  <p key={item} className="text-[10px] text-white/40 truncate">{item}</p>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ─── Capabilities ──────────────────────────────────────────────────────────────

function Capabilities() {
  const caps = [
    {
      title: 'Bid Round Management',
      desc: 'Create and manage bid rounds by commodity. Set deadlines, invite buyers, and track submissions in one place.',
    },
    {
      title: 'AI Part Matching',
      desc: 'Three-tier matching: exact normalization, rapidfuzz fuzzy logic, and Claude AI semantic fallback for unresolved items.',
    },
    {
      title: 'Winner Selection Engine',
      desc: 'Highest price wins. Reserve price floors, quantity caps, split awards, and tiebreaking by earliest upload are all handled automatically.',
    },
    {
      title: 'Exception Queue',
      desc: 'Unmatched and ambiguous items are routed to a review queue. Admins can remap, approve, or reject each exception before finalizing.',
    },
    {
      title: 'Deal Export & ERP Push',
      desc: 'Export winning deals to Excel or CSV at any time. Razor ERP integration pushes approved deals directly — CSV is always available as a fallback.',
    },
    {
      title: 'Buyer Portal',
      desc: 'Buyers get a self-service portal to submit bids and view their results. Loss notices show the comparison price per each buyer\'s configured profile.',
    },
  ]

  return (
    <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 border-t border-white/10">
      <div className="text-center mb-12">
        <SectionEyebrow label="Capabilities" />
        <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-tight">Everything the desk needs.</h2>
        <p className="mt-4 text-white/50 text-sm max-w-md mx-auto">Built for the full bid lifecycle — from master file upload to Razor ERP push.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {caps.map((cap, i) => (
          <motion.div
            key={cap.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.07, duration: 0.6 }}
            className="liquid-glass rounded-2xl p-6"
          >
            <h3 className="text-sm font-semibold text-white mb-2">{cap.title}</h3>
            <p className="text-xs text-white/50 leading-[1.6]">{cap.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      tier: 'Starter',
      price: 'Contact Us',
      desc: 'For small broker teams getting started with automated bid processing.',
      features: [
        'Up to 5 active bid rounds',
        'Up to 1,000 line items per round',
        'Exact + fuzzy part matching',
        'CSV & Excel export',
        'Up to 3 admin users',
      ],
      pro: false,
    },
    {
      tier: 'Business',
      price: 'Contact Us',
      desc: 'For growing teams running regular high-volume bid rounds.',
      features: [
        'Up to 50 active rounds',
        'Up to 10,000 line items per round',
        'AI-powered matching (Claude API)',
        'Buyer self-service portal',
        'Email invitations & notifications',
        'Unlimited admin users',
      ],
      pro: false,
    },
    {
      tier: 'Enterprise',
      price: 'Contact Us',
      desc: 'For teams that need the full platform with ERP integration and analytics.',
      features: [
        'Unlimited bid rounds',
        '20,000+ line items per round',
        'Razor ERP direct integration',
        'Natural language query interface',
        'Advanced reporting dashboard',
        'Dedicated onboarding support',
      ],
      pro: true,
    },
  ]

  return (
    <section className="c3-pricing-section">
      {/* Pricing noise filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="c3-noise-pricing">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
            <feComponentTransfer><feFuncA type="linear" slope="0.075" /></feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
          </filter>
        </defs>
      </svg>

      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Your bids.</span>
          <span className="c3-watermark-line-2">Automated.</span>
        </div>
      </div>

      <div className="c3-grid">
        {plans.map((plan) => (
          <div key={plan.tier} className={`c3-card${plan.pro ? ' c3-card-pro' : ''}`}>
            <div className="c3-tier-small">{plan.tier}</div>
            <div className="c3-tier-large" style={{ fontSize: '1.6rem' }}>{plan.price}</div>
            <p className="c3-desc">{plan.desc}</p>
            <ul className="c3-list">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span className="c3-check">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <button className="c3-btn">Get a Quote</button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 md:py-24 text-center"
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)' }}
        />

        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Close the tabs.<br />Open your day.
        </h2>
        <p className="mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
          Built for IT hardware broker teams who move fast. Stop managing bid rounds in spreadsheets — let the platform do it.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <PrimaryButton label="Request Access" />
          <a
            href={LOGIN_URL}
            className="group rounded-full border border-white/15 text-white text-sm font-medium px-5 py-3 hover:bg-white/5 flex items-center gap-2 transition-colors no-underline"
          >
            Sign In
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-[1px]" />
          </a>
        </div>
      </motion.div>
    </section>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white">

      {/* Fixed fullscreen background video */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <video
          autoPlay loop muted playsInline
          className="w-full h-full object-cover pointer-events-none"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
        />
      </div>

      {/* Root SVG noise filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="c3-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
          </filter>
        </defs>
      </svg>

      {/* Vertical guide lines */}
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 -translate-x-[calc(50%+36rem)] w-px bg-white/10 z-[5]" />
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 translate-x-[calc(-50%+36rem)] w-px bg-white/10 z-[5]" />

      <div className="relative z-10">
        <Navbar />
        <Hero />
        <MenuBar />
        <BidDeskMockup />
        <FeatureMatch />
        <Capabilities />
        <Pricing />
        <FinalCTA />
      </div>
    </div>
  )
}
