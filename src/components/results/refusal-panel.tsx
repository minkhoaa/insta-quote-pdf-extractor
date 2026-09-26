"use client";

import React from "react";
import { AlertTriangle, Quote, Info } from "lucide-react";
import { type Refusal, RefusalCode } from "@/domain/refusal";

interface RefusalPanelProps {
  refusals: Refusal[];
}

function getRefusalTitle(refusal: Refusal): string {
  if (refusal.field === "cartonCount") {
    return "Could not determine carton count";
  }
  if (refusal.field === "total") {
    return "Printed invoice totals contradict each other";
  }
  if (refusal.reasonCode === RefusalCode.NOT_PRESENT_IN_SOURCE) {
    return `Value for '${refusal.field || "field"}' missing from document`;
  }
  if (refusal.reasonCode === RefusalCode.CONTRADICTORY_VALUES) {
    return `Contradictory values detected for '${refusal.field || "field"}'`;
  }
  if (refusal.reasonCode === RefusalCode.OCR_LOW_CONFIDENCE) {
    return `Low recognition confidence on Page ${refusal.page ?? ""}`;
  }
  if (refusal.reasonCode === RefusalCode.PAGE_EXTRACTION_FAILED) {
    return `Extraction failed on Page ${refusal.page ?? ""}`;
  }
  return "Document Clarification Required";
}

export function RefusalPanel({ refusals }: RefusalPanelProps) {
  if (!refusals || refusals.length === 0) return null;

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-bold text-slate-900">
          Document Refusals & Discrepancies ({refusals.length})
        </h3>
      </div>

      <div className="space-y-3">
        {refusals.map((refusal, idx) => {
          const title = getRefusalTitle(refusal);

          return (
            <div
              key={`${refusal.reasonCode}-${refusal.field}-${idx}`}
              className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm space-y-3 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-800 shrink-0">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-950">
                      {title}
                    </h4>
                    {refusal.page && (
                      <p className="text-[11px] font-medium text-amber-700">
                        Page {refusal.page} • Reason: {refusal.reasonCode}
                      </p>
                    )}
                  </div>
                </div>
                <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  Value Refused
                </span>
              </div>

              {/* Plain-Language Explanation */}
              <p className="text-xs text-amber-900 leading-relaxed pl-1">
                {refusal.message}
              </p>

              {/* Source Evidence Quotes (e.g. for contradictions) */}
              {refusal.evidence && refusal.evidence.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-amber-200/60">
                  <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                    <Quote className="h-3 w-3" aria-hidden="true" />
                    Conflicting source excerpts found on document:
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {refusal.evidence.map((ev, evIdx) => (
                      <div
                        key={evIdx}
                        className="rounded-lg bg-white/90 p-2.5 border border-amber-200 text-xs font-mono text-slate-800 space-y-1 shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-sans">
                          <span>Quote {evIdx + 1}</span>
                          <span>Page {ev.page} ({ev.method})</span>
                        </div>
                        <p className="text-xs text-amber-950 break-words">
                          &ldquo;{ev.sourceText}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-amber-800">
                <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  Strict Policy: Unresolvable or contradictory figures are never guessed or manufactured.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
