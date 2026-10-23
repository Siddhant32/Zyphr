"use client";

import {
  ArrowLeft,
  FilePlus2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Brand,
  ExtraStudentField,
  EXTRA_STUDENT_FIELDS,
  Practical,
} from "@/components/site";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function toggleExtraField(fields: ExtraStudentField[], field: ExtraStudentField) {
  return fields.includes(field)
    ? fields.filter((selected) => selected !== field)
    : [...fields, field];
}

function ExtraFieldSelector({
  idPrefix,
  selected,
  onChange,
}: {
  idPrefix: string;
  selected: ExtraStudentField[];
  onChange: (fields: ExtraStudentField[]) => void;
}) {
  return (
    <fieldset className="field-options">
      <legend>Additional student details</legend>
      <p>Name and Registration ID are always collected.</p>
      {EXTRA_STUDENT_FIELDS.map(({ id, label }) => (
        <label key={id} htmlFor={`${idPrefix}-${id}`}>
          <input
            id={`${idPrefix}-${id}`}
            type="checkbox"
            checked={selected.includes(id)}
            onChange={() => onChange(toggleExtraField(selected, id))}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

type Stats = {
  total_documents: number;
  published_documents: number;
  unpublished_documents: number;
  total_generations: number;
};
type AdminDocument = Practical & { published: boolean };

export default function AdminPage() {
  const supabase = getSupabaseBrowserClient();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(() => Boolean(supabase));
  const [loadingMoreDocs, setLoadingMoreDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [hasMoreDocs, setHasMoreDocs] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [experimentCount, setExperimentCount] = useState("");
  const [newExtraFields, setNewExtraFields] = useState<ExtraStudentField[]>([]);
  const [published, setPublished] = useState(false);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editExtraFields, setEditExtraFields] = useState<ExtraStudentField[]>([]);

  const api = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail ?? "The request could not be completed.");
      }
      return response.status === 204 ? null : response.json();
    },
    [token],
  );

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [nextStats, nextDocuments] = await Promise.all([
        api("/api/admin/stats"),
        api("/api/admin/documents"),
      ]);
      setStats(nextStats);
      setDocuments(nextDocuments.items);
      setHasMoreDocs(Boolean(nextDocuments.has_more));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard data could not be loaded.");
    }
  }, [api, token]);

  async function loadMoreDocuments() {
    setLoadingMoreDocs(true);
    setError("");
    try {
      const nextPage = await api(`/api/admin/documents?limit=100&offset=${documents.length}`);
      setDocuments((current) => [...current, ...nextPage.items]);
      setHasMoreDocs(Boolean(nextPage.has_more));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "More practicals could not be loaded.");
    } finally {
      setLoadingMoreDocs(false);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setToken(data.session?.access_token ?? "");
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setToken(session?.access_token ?? "");
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(signInError.message);
    else setToken(data.session?.access_token ?? "");
    setBusy(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 8) {
      setError("Your password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
    } else {
      setRecoveryMode(false);
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
    }
    setBusy(false);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setToken("");
    setStats(null);
    setDocuments([]);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!docxFile || !newTitle.trim() || !newSubject.trim()) {
      setError("Choose a DOCX file and provide a title and subject.");
      return;
    }
    if (!docxFile.name.toLowerCase().endsWith(".docx") || docxFile.size > 20 * 1024 * 1024) {
      setError("Choose a DOCX file smaller than 20 MB.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", docxFile);
    form.set("title", newTitle.trim());
    form.set("subject", newSubject.trim());
    form.set("description", newDescription.trim());
    if (experimentCount) form.set("experiment_count", experimentCount);
    newExtraFields.forEach((field) => form.append("extra_fields", field));
    form.set("published", String(published));
    if (coverFile) form.set("cover_image", coverFile);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/+$/, "");
      if (!backendUrl) throw new Error("Document upload is not configured yet.");
      const response = await fetch(`${backendUrl}/api/admin/documents`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail ?? "The practical could not be uploaded.");
      }
      await response.json();
      setNewTitle("");
      setNewSubject("");
      setNewDescription("");
      setExperimentCount("");
      setNewExtraFields([]);
      setPublished(false);
      setDocxFile(null);
      setCoverFile(null);
      const input = window.document.getElementById("docx-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDocument(id: string, values: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      setEditingId("");
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(document: AdminDocument) {
    if (!window.confirm(`Delete “${document.title}” and its stored files? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <main className="admin-page"><div className="state-panel"><span className="spinner" /> Checking your session…</div></main>;
  }

  if (!token) {
    return (
      <main className="admin-page">
        <section className="admin-login">
          <Brand />
          <h1>Welcome back.</h1>
          <p>Sign in with your administrator account to manage practical files.</p>
          {!supabase && (
            <p className="admin-error">Supabase browser settings are missing. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
          )}
          <form onSubmit={signIn}>
            <div className="field"><label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="field"><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            <button className="button button-primary full-button" disabled={busy || !supabase} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <Link className="back-link" href="/"><ArrowLeft size={14} /> Return to Zyphr</Link>
        </section>
      </main>
    );
  }

  if (recoveryMode) {
    return (
      <main className="admin-page">
        <section className="admin-login">
          <Brand />
          <h1>Choose a new password.</h1>
          <p>Set a new password for your administrator account.</p>
          <form onSubmit={updatePassword}>
            <div className="field">
              <label htmlFor="new-admin-password">New password</label>
              <input
                id="new-admin-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-admin-password">Confirm new password</label>
              <input
                id="confirm-admin-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <button className="button button-primary full-button" disabled={busy} type="submit">
              {busy ? "Updating password…" : "Update password"}
            </button>
          </form>
          {error && <p className="admin-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  const visibleDocuments = documents.filter((document) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" ? document.published : !document.published);
    const matchesSubject =
      subjectFilter === "all" || document.subject === subjectFilter;
    const normalized = documentSearch.trim().toLowerCase();
    const matchesSearch =
      !normalized ||
      `${document.title} ${document.subject}`.toLowerCase().includes(normalized);
    return matchesStatus && matchesSubject && matchesSearch;
  });

  return (
    <main className="admin-page">
      <div className="admin-wrap">
        <header className="admin-top">
          <Brand />
          <div><span className="admin-badge"><ShieldCheck size={13} /> Administrator</span><button className="small-button" onClick={signOut}><LogOut size={13} /> Sign out</button></div>
        </header>
        <div className="admin-title">
          <span className="section-kicker">YOUR LIBRARY, YOUR WAY</span>
          <h1>Document dashboard</h1>
          <p>Upload and manage the practical files students can personalize.</p>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <section className="stats-grid" aria-label="Dashboard statistics">
          {[
            ["Total documents", stats?.total_documents],
            ["Published", stats?.published_documents],
            ["Unpublished", stats?.unpublished_documents],
            ["PDF generations", stats?.total_generations],
          ].map(([label, count]) => (
            <div className="stat-card" key={String(label)}><span>{label}</span><strong>{count ?? "—"}</strong></div>
          ))}
        </section>
        <div className="admin-content-grid">
          <section className="admin-panel">
            <h2>Add a practical</h2>
            <p>Upload a DOCX template once. Zyphr creates a fresh PDF for each student.</p>
            <form onSubmit={uploadDocument}>
              <label
                className="upload-drop"
                htmlFor="docx-file"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedFile = event.dataTransfer.files[0];
                  if (!droppedFile) return;
                  if (!droppedFile.name.toLowerCase().endsWith(".docx")) {
                    setError("Choose a DOCX file.");
                    return;
                  }
                  setError("");
                  setDocxFile(droppedFile);
                }}
              >
                <UploadCloud size={22} />
                <b>{docxFile?.name ?? "Choose a DOCX practical"}</b>
                <span>DOCX only · Up to 20 MB</span>
                <input id="docx-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setDocxFile(event.target.files?.[0] ?? null)} required />
              </label>
              <div className="field"><label htmlFor="new-title">Document title</label><input id="new-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={160} required /></div>
              <div className="field"><label htmlFor="new-subject">Subject</label><input id="new-subject" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} maxLength={100} required /></div>
              <div className="field"><label htmlFor="new-description">Description</label><textarea id="new-description" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={2000} required /></div>
              <div className="field"><label htmlFor="experiment-count">Number of experiments <span>(optional)</span></label><input id="experiment-count" type="number" min="0" max="1000" value={experimentCount} onChange={(event) => setExperimentCount(event.target.value)} /></div>
              <ExtraFieldSelector idPrefix="new-extra-field" selected={newExtraFields} onChange={setNewExtraFields} />
              <div className="field"><label htmlFor="cover-image">Cover image <span>(optional, PNG/JPEG/WebP)</span></label><input id="cover-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></div>
              <label className="checkbox-row"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span>Publish this practical after upload</span></label>
              <button className="button button-primary full-button" type="submit" disabled={busy}><FilePlus2 size={16} /> {busy ? "Uploading and validating…" : "Upload practical"}</button>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-list-head">
              <h2>Manage practicals</h2>
              <label className="sr-only" htmlFor="admin-document-search">Search practicals</label>
              <input
                id="admin-document-search"
                className="admin-filter"
                placeholder="Search"
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
              />
              <label className="sr-only" htmlFor="admin-subject-filter">Filter by subject</label>
              <select
                id="admin-subject-filter"
                className="admin-filter"
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
              >
                <option value="all">All subjects</option>
                {[...new Set(documents.map((document) => document.subject))].sort().map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="admin-status-filter">Filter by status</label>
              <select id="admin-status-filter" className="admin-filter" aria-label="Filter documents by publication status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option><option value="published">Published</option><option value="unpublished">Unpublished</option>
              </select>
              <button className="small-button" aria-label="Refresh dashboard" onClick={() => void loadDashboard()}><RefreshCw size={13} /></button>
            </div>
            <div className="admin-list">
              {visibleDocuments.map((document) => (
                <article className="admin-doc" key={document.id}>
                  <div className="admin-doc-main">
                    <div><h3>{document.title}</h3><p>{document.subject}{document.experiment_count != null ? ` · ${document.experiment_count} experiments` : ""}</p><span className={`status-pill${document.published ? " status-published" : ""}`}>{document.published ? "Published" : "Unpublished"}</span></div>
                    <div className="admin-doc-actions">
                      <button className="small-button" onClick={() => updateDocument(document.id, { published: !document.published })}>{document.published ? "Unpublish" : "Publish"}</button>
                      <button className="small-button" onClick={() => setPreviewId(previewId === document.id ? "" : document.id)}>Preview</button>
                      <button className="small-button" onClick={() => {
                        setEditingId(editingId === document.id ? "" : document.id);
                        setEditTitle(document.title);
                        setEditSubject(document.subject);
                        setEditDescription(document.description ?? "");
                        setEditExtraFields(document.extra_fields ?? []);
                      }}>Edit</button>
                      <button className="small-button small-danger" aria-label={`Delete ${document.title}`} onClick={() => void deleteDocument(document)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {previewId === document.id && (
                    <div className="admin-preview">
                      <strong>{document.title}</strong>
                      <span>{document.subject}{document.experiment_count != null ? ` · ${document.experiment_count} experiments` : ""}</span>
                      <p>{document.description || "No description provided."}</p>
                      <span>{document.tags?.length ? `Tags: ${document.tags.join(", ")}` : "No tags"}</span>
                      <span>{document.extra_fields?.length ? `Student fields: ${document.extra_fields.join(", ")}` : "Student fields: Name and Registration ID"}</span>
                    </div>
                  )}
                  {editingId === document.id && (
                    <form className="edit-form" onSubmit={(event) => { event.preventDefault(); void updateDocument(document.id, { title: editTitle, subject: editSubject, description: editDescription, extra_fields: editExtraFields }); }}>
                      <div className="field"><label htmlFor={`edit-title-${document.id}`}>Title</label><input id={`edit-title-${document.id}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} required /></div>
                      <div className="field"><label htmlFor={`edit-subject-${document.id}`}>Subject</label><input id={`edit-subject-${document.id}`} value={editSubject} onChange={(event) => setEditSubject(event.target.value)} maxLength={100} required /></div>
                      <div className="field"><label htmlFor={`edit-description-${document.id}`}>Description</label><textarea id={`edit-description-${document.id}`} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={2000} /></div>
                      <ExtraFieldSelector idPrefix={`edit-${document.id}-extra-field`} selected={editExtraFields} onChange={setEditExtraFields} />
                      <div className="edit-actions"><button className="small-button" type="submit" disabled={busy}>Save changes</button><button className="small-button" type="button" onClick={() => setEditingId("")}>Cancel</button></div>
                    </form>
                  )}
                </article>
              ))}
              {hasMoreDocs && (
                <button
                  className="button button-quiet"
                  onClick={() => void loadMoreDocuments()}
                  disabled={loadingMoreDocs}
                >
                  {loadingMoreDocs ? <><span className="spinner" /> Loading…</> : "Load more documents"}
                </button>
              )}
              {!visibleDocuments.length && (
                <div className="empty-state"><span className="empty-icon"><FilePlus2 size={20} /></span><h3>No practicals here yet</h3><p>Upload a DOCX to start building your library.</p></div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
