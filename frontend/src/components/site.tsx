"use client";

import { ArrowUpRight, FileText, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export const EXTRA_STUDENT_FIELDS = [
  { id: "branch", label: "Branch" },
  { id: "department", label: "Department" },
  { id: "year", label: "Year" },
  { id: "section", label: "Section" },
] as const;

export type ExtraStudentField = (typeof EXTRA_STUDENT_FIELDS)[number]["id"];

export type Practical = {
  id: string;
  title: string;
  subject: string;
  description: string;
  cover_image_url?: string | null;
  experiment_count?: number | null;
  tags?: string[];
  extra_fields?: ExtraStudentField[];
  created_at: string;
};

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Zyphr home">
      <span className="brand-symbol" aria-hidden="true">Z</span>
      <span className="brand-name">zyphr<span>.</span></span>
    </Link>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="nav-inner">
        <Brand />
        <nav className={`main-nav${menuOpen ? " mobile-open" : ""}`} aria-label="Main navigation">
          <Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link href="/#practicals" onClick={() => setMenuOpen(false)}>All practicals</Link>
          <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>About</Link>
        </nav>
        <Link className="nav-admin" href="/admin">Admin login <ArrowUpRight size={15} /></Link>
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <Brand />
          <p>Your practical files, personalized and ready to go.</p>
        </div>
        <div className="footer-links">
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`}>Contact</a>
          ) : (
            <span>Contact administrator</span>
          )}
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/admin">Admin</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© Zyphr. Your practicals. Your details. Your PDF.</span>
        <span><FileText size={14} /> Made for students</span>
      </div>
    </footer>
  );
}
