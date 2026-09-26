"use client";

import React from "react";
import { X, ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { type LineItem } from "@/domain/line-item";
import { type Evidence } from "@/domain/evidence";

interface EvidenceViewerProps {
  item: LineItem | null;
  onClose: () => void;
}

export function EvidenceViewer({ item, onClose }: EvidenceViewerProps) {
  if (!item) return null;

  const evidenceEntries = Object.entries(item.evidence || {}) as [
    string,
    Evidence,
  ][];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="evidence-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Line Item Source Evidence
              </h3>
              <p className="text-xs text-slate-500">
                {item.code ? `[${item.code}] ` : ""}
                {item.description || "Extracted item"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence inspector"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Evidence Fields List */}
        <div className="my-5 max-h-[60vh] overflow-y-auto space-y-4 pr-1">
          {evidenceEntries.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">
              No field-level evidence attached to this line item.
            </p>
          ) : (
            evidenceEntries.map(([field, ev]) => (
              <div
                key={field}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs capitalize text-slate-900">
                      {field}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {String((item as Record<string, unknown>)[field] ?? "Present")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-slate-200/80 px-2 py-0.5 font-medium text-slate-700">
                      Page {ev.page}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-medium capitalize ${
                        ev.method === "ocr"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {ev.method}
                      {ev.confidence !== undefined &&
                        ` (${Math.round(ev.confidence)}%)`}
                    </span>
                  </div>
                </div>

                {/* Verbatim Source Excerpt */}
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                    <FileText className="h-3 w-3" aria-hidden="true" />
                    Exact Source Row Text:
                  </p>
                  <pre className="rounded-lg bg-white p-2.5 text-xs font-mono text-slate-800 border border-slate-200/80 overflow-x-auto whitespace-pre-wrap break-words">
                    {ev.sourceText}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            Verified without calculation
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
