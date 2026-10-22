import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="detail-shell">
        <article className="notice-panel detail-wrap">
          <span className="section-kicker">ZYphr</span>
          <h1>Terms of use</h1>
          <p>Use Zyphr to personalize and download practical files made available by its administrator. Check your details and the generated document before submitting or relying on it.</p>
          <p>Administrators are responsible for the content and permissions associated with documents they upload. Zyphr does not guarantee that conversion will reproduce every feature or layout of the source DOCX exactly.</p>
          <p>Configure an appropriate terms contact and obtain any required review before operating the service publicly.</p>
          <Link className="button button-primary" href="/">Back to Zyphr</Link>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
