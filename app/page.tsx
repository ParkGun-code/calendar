"use client";

import dynamic from "next/dynamic";

// SSR 이슈 방지를 위해 dynamic import 적용
const FieldInspectionCalendar = dynamic(
  () => import("../components/FieldInspectionCalendar"),
  { ssr: false }
);

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-100 p-2 md:p-6 font-sans">
      <FieldInspectionCalendar />
    </main>
  );
}
