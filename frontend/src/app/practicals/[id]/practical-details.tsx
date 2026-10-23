"use client";

import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  EXTRA_STUDENT_FIELDS,
  ExtraStudentField,
  Practical,
  SiteFooter,
  SiteHeader,
} from "@/components/site";

export default function PracticalDetails({ id }: { id: string }) {
  const [document, setDocument] = useState<Practical | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [extraValues, setExtraValues] = useState<Partial<Record<ExtraStudentField, string>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    fetch(`/api/practicals/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail ?? "Practical could not be loaded.");
        return result as Practical;
      })
      .then(setDocument)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setComplete(false);
    const cleanName = name.trim();
    const cleanRegistrationId = registrationId.trim();
    if (!cleanName) return setMessage("Enter your full name.");
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'’\-]{0,119}$/u.test(cleanName)) {
      return setMessage("Enter a valid name using letters, spaces, or normal punctuation.");
    }
    if (!cleanRegistrationId) return setMessage("Enter your registration ID.");
    if (!/^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,63}$/.test(cleanRegistrationId)) {
      return setMessage("Enter a valid registration ID.");
    }
    const configuredFields = document?.extra_fields ?? [];
    const cleanExtraFields = Object.fromEntries(
      configuredFields.map((field) => [field, extraValues[field]?.trim() ?? ""]),
    );
    for (const field of configuredFields) {
      const value = cleanExtraFields[field];
      if (!value) {
        const label = EXTRA_STUDENT_FIELDS.find((option) => option.id === field)?.label ?? field;
        return setMessage(`Enter your ${label.toLowerCase()}.`);
      }
      if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'’/&\-]{0,79}$/u.test(value)) {
        const label = EXTRA_STUDENT_FIELDS.find((option) => option.id === field)?.label ?? field;
        return setMessage(`Enter a valid ${label.toLowerCase()}.`);
      }
    }
    if (!confirmed) return setMessage("Please confirm your details are correct.");

    setGenerating(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL?.replace(/\/+$/, "");
      if (!backendUrl) throw new Error("PDF generation is not configured yet.");
      const response = await fetch(`${backendUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document_id: document?.id,
          full_name: cleanName,
          registration_id: cleanRegistrationId,
          extra_fields: cleanExtraFields,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.detail ?? "Your PDF could not be generated. Please try again.");
      }
      const blob = await response.blob();
      if (!blob.size || blob.type !== "application/pdf") {
        throw new Error("The document service returned an invalid PDF. Please try again.");
      }
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${document?.title ?? "zyphr-practical"}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setComplete(true);
      setMessage("Your personalized PDF has been downloaded.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The PDF could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="detail-shell">
        <div className="detail-wrap">
          <Link className="back-link" href="/#practicals"><ArrowLeft size={15} /> Back to practicals</Link>
          {loading ? (
            <div className="state-panel"><span className="spinner" /> Loading practical…</div>
          ) : error ? (
            <div className="notice-panel" role="alert">
              <h1>We couldn’t find that practical.</h1>
              <p>{error}</p>
              <Link className="button button-primary" href="/#practicals">Browse practicals</Link>
            </div>
          ) : document ? (
            <div className="detail-card">
              <section className="detail-info">
                <span className="section-kicker">{document.subject}</span>
                <h1>{document.title}</h1>
                <p>{document.description || "Personalize this practical with your student details and download a PDF copy."}</p>
                <div className="detail-facts">
                  <span><FileText size={15} /> DOCX practical</span>
                  {document.experiment_count !== null && document.experiment_count !== undefined && (
                    <span>{document.experiment_count} experiments</span>
                  )}
                  <span><ShieldCheck size={15} /> Private download</span>
                </div>
              </section>
              <section className="generate-panel">
                <h2>Make it yours.</h2>
                <p>Your details will be added to a fresh copy of the original file.</p>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="field">
                    <label htmlFor="full-name">Full name</label>
                    <input
                      id="full-name"
                      autoComplete="name"
                      maxLength={120}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. Asha Rao"
                      required
                      aria-describedby="generation-message"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="registration-id">Registration ID</label>
                    <input
                      id="registration-id"
                      maxLength={64}
                      value={registrationId}
                      onChange={(event) => setRegistrationId(event.target.value)}
                      placeholder="e.g. 24CS0081"
                      required
                      aria-describedby="generation-message"
                    />
                  </div>
                  {(document.extra_fields ?? []).map((field) => {
                    const label = EXTRA_STUDENT_FIELDS.find((option) => option.id === field)?.label ?? field;
                    return (
                      <div className="field" key={field}>
                        <label htmlFor={`student-${field}`}>{label}</label>
                        <input
                          id={`student-${field}`}
                          maxLength={80}
                          value={extraValues[field] ?? ""}
                          onChange={(event) => setExtraValues((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))}
                          placeholder={`Enter your ${label.toLowerCase()}`}
                          required
                          aria-describedby="generation-message"
                        />
                      </div>
                    );
                  })}
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>I’ve checked that all my details are correct.</span>
                  </label>
                  <button className="button button-primary full-button" type="submit" disabled={generating}>
                    {generating ? <><span className="spinner" /> Generating your PDF…</> : <>Generate my PDF <FileText size={16} /></>}
                  </button>
                  {message && (
                    <p
                      id="generation-message"
                      className={`form-message${complete ? " form-success" : ""}`}
                      role={complete ? "status" : "alert"}
                    >
                      {complete && <CheckCircle2 size={14} />} {message}
                    </p>
                  )}
                  <p className="privacy-hint">Your details are used to create this file and are not saved to your account.</p>
                </form>
              </section>
            </div>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
