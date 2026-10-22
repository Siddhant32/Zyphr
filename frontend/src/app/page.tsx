"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Practical, SiteHeader, SiteFooter } from "@/components/site";

export default function Home() {
  const [documents, setDocuments] = useState<Practical[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    fetch("/api/practicals?limit=100")
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.detail ?? "Practicals could not be loaded.");
        }
        return response.json();
      })
      .then((result) => {
        setDocuments(result.items ?? []);
        setHasMore(Boolean(result.has_more));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(
    () => [...new Set(documents.map((document) => document.subject))].sort(),
    [documents],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return documents
      .filter((document) => {
        const matchesQuery =
          !normalized ||
          `${document.title} ${document.subject} ${document.description}`
            .toLowerCase()
            .includes(normalized);
        return (
          matchesQuery &&
          (subject === "All subjects" || document.subject === subject)
        );
      })
      .sort((left, right) =>
        sort === "title"
          ? left.title.localeCompare(right.title)
          : right.created_at.localeCompare(left.created_at),
      );
  }, [documents, query, sort, subject]);

  async function loadMore() {
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(`/api/practicals?limit=100&offset=${documents.length}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "More practicals could not be loaded.");
      setDocuments((current) => [...current, ...(result.items ?? [])]);
      setHasMore(Boolean(result.has_more));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "More practicals could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-shell">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR PRACTICALS. YOUR DETAILS. YOUR PDF.
              </div>
              <h1>
                Your practical files,
                <br />
                <span>ready in minutes.</span>
              </h1>
              <p className="hero-description">
                Choose your practical, add your details, and download your
                personalized PDF. Simple, fast, and hassle-free.
              </p>
              <form
                className="hero-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  document
                    .getElementById("practicals")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Search size={19} aria-hidden="true" />
                <label className="sr-only" htmlFor="hero-search">
                  Search practical files
                </label>
                <input
                  id="hero-search"
                  placeholder="Search practicals, subjects..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" aria-label="Search practicals">
                  <ArrowRight size={19} />
                </button>
              </form>
              <div className="hero-actions">
                <a className="button button-primary" href="#practicals">
                  Explore practicals <ArrowRight size={17} />
                </a>
                <a className="button button-quiet" href="#how-it-works">
                  How it works <ArrowDown size={16} />
                </a>
              </div>
              <div className="trust-note">
                <ShieldCheck size={17} />
                No account needed. Your details stay yours.
              </div>
            </div>
            <div className="hero-art" aria-label="A preview of a personalized practical file">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="hero-orb">
                <span className="orb-mark">Z</span>
              </div>
              <div className="preview-card preview-main">
                <div className="preview-top">
                  <span className="preview-file-icon"><FileText size={19} /></span>
                  <span className="preview-label">YOUR FILE IS READY</span>
                  <span className="preview-check"><Check size={15} /></span>
                </div>
                <div className="preview-rule" />
                <div className="preview-line preview-line-long" />
                <div className="preview-line preview-line-short" />
                <div className="preview-person">
                  <span className="avatar">A</span>
                  <span><b>Your details, added</b><small>Your practical · PDF</small></span>
                </div>
              </div>
              <div className="floating-chip chip-one"><Sparkles size={15} /> Made for you</div>
              <div className="floating-chip chip-two"><Zap size={15} /> Ready to download</div>
            </div>
          </div>
          <div className="hero-bottom">
            <span>LESS BUSYWORK. MORE LEARNING.</span>
            <span className="hero-bottom-line" />
            <span>BUILT FOR YOUR NEXT SUBMISSION</span>
          </div>
        </section>

        <section className="library section-wrap" id="practicals">
          <div className="section-heading">
            <div>
              <span className="section-kicker">THE LIBRARY</span>
              <h2>Find your practical.</h2>
              <p>All the right files, ready when you are.</p>
            </div>
            <div className="library-controls">
              <label className="sr-only" htmlFor="subject-filter">Filter by subject</label>
              <select
                id="subject-filter"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option>All subjects</option>
                {subjects.map((item) => <option key={item}>{item}</option>)}
              </select>
              <label className="sr-only" htmlFor="sort-practicals">Sort practicals</label>
              <select
                id="sort-practicals"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="title">A–Z</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="state-panel"><span className="spinner" /> Loading practicals…</div>
          ) : error ? (
            <div className="state-panel state-error" role="alert">
              <span>{error}</span>
              <button className="text-button" onClick={() => window.location.reload()}>Try again</button>
            </div>
          ) : filtered.length ? (
            <>
              <div className="practical-grid">
                {filtered.map((document) => (
                  <article className="practical-card" key={document.id}>
                    {document.cover_image_url && (
                      <div
                        className="card-cover"
                        role="img"
                        aria-label={`${document.title} cover`}
                        style={{ backgroundImage: `url("${document.cover_image_url}")` }}
                      />
                    )}
                    <div className="card-icon"><BookOpen size={21} /></div>
                    <span className="subject-pill">{document.subject}</span>
                    <h3>{document.title}</h3>
                    <p>{document.description || "A practical file, ready to personalize and download."}</p>
                    <div className="card-meta">
                      <span><FileText size={14} /> DOCX to PDF</span>
                      {document.experiment_count !== null && document.experiment_count !== undefined && (
                        <span>{document.experiment_count} experiments</span>
                      )}
                    </div>
                    <Link className="card-link" href={`/practicals/${document.id}`}>
                      Generate PDF <ArrowUpRight size={16} />
                    </Link>
                  </article>
                ))}
              </div>
              {hasMore && (
                <div className="load-more-wrap">
                  <button className="button button-quiet" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? <><span className="spinner" /> Loading…</> : "Load more practicals"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><Search size={22} /></span>
              <h3>{documents.length ? "No practicals match your search" : "The library is getting ready"}</h3>
              <p>{documents.length ? "Try another title or subject." : "Published practical files will appear here once they are added by an administrator."}</p>
              {documents.length > 0 && (
                <button className="text-button" onClick={() => { setQuery(""); setSubject("All subjects"); }}>
                  Clear filters
                </button>
              )}
              {hasMore && (
                <button className="text-button" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Loading more…" : "Load more practicals"}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-wrap">
            <div className="steps-heading">
              <span className="section-kicker">NO FUSS. JUST DONE.</span>
              <h2>Three steps to your PDF.</h2>
              <p>The practical is ready. Just make it yours.</p>
            </div>
            <div className="steps-grid">
              {[
                ["01", "Choose your practical", "Browse the library and pick the file for your subject.", <BookOpen size={20} key="book" />],
                ["02", "Add your details", "Enter your name and registration ID. That’s all we need.", <FileText size={20} key="file" />],
                ["03", "Download your PDF", "Your personalized file is generated and ready to save.", <ArrowDown size={20} key="download" />],
              ].map(([number, title, description, icon]) => (
                <article className="step-card" key={String(number)}>
                  <div className="step-top"><span>{number}</span><i>{icon}</i></div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="closing-cta">
          <span className="section-kicker">YOUR NEXT SUBMISSION STARTS HERE</span>
          <h2>Less formatting. More focus.</h2>
          <p>Pick your practical and leave the busywork to us.</p>
          <a className="button button-primary" href="#practicals">Explore practicals <ArrowRight size={17} /></a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
