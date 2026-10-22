import { Suspense } from "react";
import PracticalDetails from "./practical-details";

async function PracticalPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PracticalDetails id={id} />;
}

export default function PracticalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<main className="detail-shell"><div className="state-panel"><span className="spinner" /> Loading practical…</div></main>}>
      <PracticalPageContent params={params} />
    </Suspense>
  );
}
