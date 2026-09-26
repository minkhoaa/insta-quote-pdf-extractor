"use client";

import React, { useState } from "react";
import {
  FileText,
  ShieldCheck,
  AlertOctagon,
  Sparkles,
} from "lucide-react";
import { FileDropzone } from "@/components/upload/file-dropzone";
import { LineItemsTable } from "@/components/results/line-items-table";
import { RefusalPanel } from "@/components/results/refusal-panel";
import { ExtractionSummaryCard } from "@/components/results/extraction-summary-card";
import { type ExtractionResult } from "@/domain/extraction-result";
import { type ApiErrorPayload, type ApiResponse } from "@/domain/api-contracts";

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResult | null>(null);
  const [requestError, setRequestError] = useState<ApiErrorPayload | null>(
    null
  );

  const handleExtract = async () => {
    if (!selectedFile || isExtracting) return;

    setIsExtracting(true);
    setRequestError(null);
    setExtractionResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const json: ApiResponse = await response.json();

      if (json.ok) {
        setExtractionResult(json.data);
      } else {
        setRequestError(json.error);
      }
    } catch (err: unknown) {
      setRequestError({
        code: "NETWORK_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Network error occurred while uploading. Please check your connection and try again.",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setExtractionResult(null);
    setRequestError(null);
    setIsExtracting(false);
  };

  return (
    <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto flex flex-col gap-8">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              InstaQuote AI
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Deterministic PDF Line-Item Extraction
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Zero-Hallucination Core
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      {!extractionResult ? (
        <div className="space-y-6">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Extract Trade Invoices &amp; Quotes
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Upload PDF documents to parse line items with complete numeric auditability.
              Figures are verified against source text without guessing or manufactured calculations.
            </p>
          </div>

          <FileDropzone
            file={selectedFile}
            onFileSelect={setSelectedFile}
            onExtract={handleExtract}
            isExtracting={isExtracting}
          />

          {/* Honest Loading Indicator */}
          {isExtracting && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 text-center space-y-2 animate-pulse"
            >
              <div className="inline-flex items-center justify-center p-2 rounded-full bg-indigo-100 text-indigo-600 mb-1">
                <Sparkles className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-indigo-950">
                Extracting document...
              </p>
              <p className="text-xs text-indigo-700">
                Scanning page text layers, applying OCR fallback if needed, and verifying numeric evidence.
              </p>
            </div>
          )}

          {/* Request-Level Error Alert */}
          {requestError && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm space-y-2"
            >
              <div className="flex items-center gap-2 text-rose-800">
                <AlertOctagon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <h3 className="text-sm font-bold">
                  Upload Request Failed ({requestError.code})
                </h3>
              </div>
              <p className="text-xs text-rose-700 pl-7 leading-relaxed">
                {requestError.message}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Results View */
        <div className="space-y-8 animate-in fade-in duration-200">
          <ExtractionSummaryCard
            result={extractionResult}
            fileName={selectedFile?.name}
            onReset={handleReset}
          />

          {/* Document Refusals & Contradictions (Rendered prominently alongside items) */}
          {extractionResult.refusals.length > 0 && (
            <RefusalPanel refusals={extractionResult.refusals} />
          )}

          {/* Line Items Table */}
          <LineItemsTable items={extractionResult.items} />
        </div>
      )}
    </main>
  );
}
