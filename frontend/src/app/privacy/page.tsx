import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="detail-shell">
        <article className="notice-panel detail-wrap">
          <span className="section-kicker">ZYphr</span>
          <h1>Privacy</h1>
          <p>Zyphr uses your name, registration ID, and any additional details requested for that practical only to personalize the file you request. Those details are processed temporarily to create the PDF and are not included in usage analytics or stored as generation records.</p>
          <p>Administrators can access uploaded source documents and their metadata. The original DOCX is stored privately. Generated PDFs are returned as downloads and temporary processing files are removed after each request.</p>
          <p>This is a project privacy notice, not legal advice. Configure a privacy contact and review applicable requirements before public launch.</p>
          <Link className="button button-primary" href="/">Back to Zyphr</Link>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
