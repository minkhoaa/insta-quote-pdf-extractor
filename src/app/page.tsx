import React from "react";
import {
  FileText,
  UploadCloud,
  ShieldCheck,
  CheckCircle2,
  FileSearch,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto flex flex-col gap-10">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              InstaQuote AI
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Evidence-First PDF Line-Item Extractor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Zero-Hallucination Core
          </span>
        </div>
      </header>

      {/* Hero Description */}
      <section className="text-center space-y-3 max-w-2xl mx-auto">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Deterministic Line-Item Extraction
        </h2>
        <p className="text-base text-slate-600 leading-relaxed">
          Upload documents to extract quotes and invoice tables with complete numeric
          auditability. Every accepted figure is guaranteed to trace back to source text
          on a specific page.
        </p>
      </section>

      {/* Upload Area Placeholder */}
      <section className="w-full">
        <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center transition-colors hover:border-slate-400">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-4">
            <div className="rounded-full bg-indigo-50 p-4 text-indigo-600 ring-8 ring-indigo-50/50">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                PDF Upload Placeholder
              </p>
              <p className="text-xs text-slate-500">
                Drag and drop your PDF here or select a file to prepare for extraction
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                PDF only
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Up to 4MB
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Evidence Audited
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          Ready for extraction pipeline integration. No mock or fake results generated.
        </p>
      </section>

      {/* Architectural Pillars / Principles */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-indigo-600">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="font-semibold text-sm text-slate-900">Evidence First</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Every numeric value is paired with page number, exact source text, and
            extraction method.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-indigo-600">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="font-semibold text-sm text-slate-900">Conservative Rules</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Missing values are explicitly refused rather than guessed or calculated from
            surrounding figures.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-indigo-600">
            <FileSearch className="h-5 w-5" />
            <h3 className="font-semibold text-sm text-slate-900">Failure Isolation</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Individual page parsing failures never discard or compromise successfully
            extracted pages.
          </p>
        </div>
      </section>
    </main>
  );
}
