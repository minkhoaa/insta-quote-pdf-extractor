"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileText, X, AlertCircle, ArrowRight } from "lucide-react";
import { formatFileSize } from "@/lib/utils";
import { MAX_FILE_SIZE_BYTES } from "@/domain/api-contracts";

interface FileDropzoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onExtract: () => void;
  isExtracting: boolean;
}

export function FileDropzone({
  file,
  onFileSelect,
  onExtract,
  isExtracting,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleValidateAndSetFile = (selectedFile: File) => {
    setValidationError(null);

    // Validate PDF type
    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setValidationError("Only PDF documents are supported. Please select a .pdf file.");
      return;
    }

    // Validate size limit (4MB)
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setValidationError(
        `File is too large (${formatFileSize(selectedFile.size)}). Maximum upload size is 4MB.`
      );
      return;
    }

    if (selectedFile.size === 0) {
      setValidationError("The selected file is empty (0 bytes).");
      return;
    }

    onFileSelect(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        setValidationError("Please drop exactly one PDF file.");
        return;
      }
      handleValidateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleValidateAndSetFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    onFileSelect(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
        id="pdf-file-upload"
        aria-label="Upload PDF Document"
        disabled={isExtracting}
      />

      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Drag and drop PDF here or click to browse files"
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            isDragOver
              ? "border-indigo-500 bg-indigo-50/50"
              : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50"
          }`}
        >
          <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-3">
            <div className="rounded-full bg-indigo-50 p-3.5 text-indigo-600 ring-8 ring-indigo-50/50">
              <UploadCloud className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-800">
                Choose a PDF or drag & drop it here
              </p>
              <p className="text-xs text-slate-500">
                Quotes, orders, and invoices up to 4MB
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                PDF only
              </span>
              <span>•</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                Single file
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatFileSize(file.size)} • PDF document
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleClear}
                disabled={isExtracting}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Change
              </button>
              <button
                type="button"
                onClick={onExtract}
                disabled={isExtracting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
              >
                {isExtracting ? (
                  <>
                    <svg
                      className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Extracting...
                  </>
                ) : (
                  <>
                    Extract Line Items
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {validationError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>{validationError}</p>
        </div>
      )}
    </div>
  );
}
