"use client";

import React, { useState } from "react";
import { Eye, Layers } from "lucide-react";
import { type LineItem } from "@/domain/line-item";
import { EvidenceViewer } from "./evidence-viewer";

interface LineItemsTableProps {
  items: LineItem[];
}

export function LineItemsTable({ items }: LineItemsTableProps) {
  const [selectedItemForEvidence, setSelectedItemForEvidence] =
    useState<LineItem | null>(null);

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-white">
        <p className="text-sm font-medium text-slate-600">
          No line items found in this document.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <Layers className="h-3 w-3" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-bold text-slate-900">
            Extracted Line Items ({items.length})
          </h3>
        </div>
        <p className="text-xs text-slate-500 hidden sm:block">
          Click &ldquo;Audit Evidence&rdquo; to inspect source text & page numbers
        </p>
      </div>

      {/* Responsive Table Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="py-3 px-4">
                  Code
                </th>
                <th scope="col" className="py-3 px-4">
                  Description
                </th>
                <th scope="col" className="py-3 px-3 text-right">
                  Qty
                </th>
                <th scope="col" className="py-3 px-3">
                  Unit / Weight
                </th>
                <th scope="col" className="py-3 px-3 text-right">
                  Unit Price
                </th>
                <th scope="col" className="py-3 px-4 text-right">
                  Amount
                </th>
                <th scope="col" className="py-3 px-4 text-center">
                  Audit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {items.map((item, idx) => {
                const itemKey = item.code || item.id || `item-${idx}`;
                const hasAmount = item.amount !== undefined && item.amount !== null;

                // Determine unit or weight display
                const unitWeightDisplay =
                  item.weight || item.unit || "—";

                return (
                  <tr
                    key={itemKey}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Code */}
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.code || "—"}
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-4 font-medium text-slate-900 max-w-xs">
                      {item.description || "—"}
                    </td>

                    {/* Quantity */}
                    <td className="py-3.5 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                      {item.quantity ?? "—"}
                    </td>

                    {/* Unit / Weight */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {item.weight ? (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200/60">
                          {item.weight}
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium">
                          {unitWeightDisplay}
                        </span>
                      )}
                    </td>

                    {/* Unit Price */}
                    <td className="py-3.5 px-3 text-right font-mono text-slate-900 whitespace-nowrap">
                      {item.unitPrice || "—"}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                      {hasAmount ? (
                        <span className="font-semibold text-slate-900">
                          {item.amount}
                        </span>
                      ) : (
                        <span
                          title="Amount was not printed in the source document and is never calculated"
                          className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium italic text-slate-500"
                        >
                          Not in source
                        </span>
                      )}
                    </td>

                    {/* Evidence Action */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedItemForEvidence(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        Page {item.page ?? 1}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidence Modal / Inspector */}
      {selectedItemForEvidence && (
        <EvidenceViewer
          item={selectedItemForEvidence}
          onClose={() => setSelectedItemForEvidence(null)}
        />
      )}
    </div>
  );
}
