"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { type ExtractionResult } from "@/domain/extraction-result";

interface ExtractionSummaryCardProps {
  result: ExtractionResult;
  fileName?: string;
  onReset: () => void;
}

export function ExtractionSummaryCard({
  result,
  fileName,
  onReset,
}: ExtractionSummaryCardProps) {
  const isSuccess = result.status === "success";
  const isPartial = result.status === "partial_success";

  // Check if OCR was used on any page
  const usedOcr = result.pages?.some((p) => p.methodUsed === "ocr") ?? false;
  const usedNative = result.pages?.some((p) => p.methodUsed === "native") ?? true;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isSuccess
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                  : isPartial
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
              }`}
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Verified Extraction
                </>
              ) : isPartial ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  Partial Extraction with Notes
                </>
              ) : (
                "Extraction Refused"
              )}
            </span>

            {usedOcr && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                OCR Fallback Used
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-slate-900">
            {fileName || "Extracted Document"}
          </h2>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 self-start sm:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Extract Another PDF
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
          <p className="text-[11px] font-medium text-slate-500">Line Items</p>
          <p className="text-xl font-extrabold text-slate-900">
            {result.items.length}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
          <p className="text-[11px] font-medium text-slate-500">Document Refusals</p>
          <p
            className={`text-xl font-extrabold ${
              result.refusals.length > 0 ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {result.refusals.length}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
          <p className="text-[11px] font-medium text-slate-500">Pages Processed</p>
          <p className="text-xl font-extrabold text-slate-900">
            {result.summary?.extractedPages ?? result.pages?.length ?? 1} /{" "}
            {result.summary?.totalPages ?? result.pages?.length ?? 1}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
          <p className="text-[11px] font-medium text-slate-500">Engine Used</p>
          <p className="text-xs font-semibold text-slate-800 mt-1">
            {usedOcr && usedNative
              ? "Native + Local OCR"
              : usedOcr
              ? "Local OCR"
              : "Native PDF Text"}
          </p>
        </div>
      </div>
    </div>
  );
}
