// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";
import { RefusalPanel } from "@/components/results/refusal-panel";
import { LineItemsTable } from "@/components/results/line-items-table";
import { type ExtractionResult } from "@/domain/extraction-result";
import { RefusalCode } from "@/domain/refusal";

describe("Frontend Extraction UI Components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Successful Results Render
  it("renders successful extraction results and line items table", async () => {
    const mockSuccessResult: ExtractionResult = {
      status: "success",
      items: [
        {
          code: "FX-201",
          description: "Framing nail gun coil, 90mm galv",
          quantity: "24",
          unit: "box",
          unitPrice: "$52.00",
          amount: "$1,248.00",
          page: 1,
          evidence: {
            amount: {
              page: 1,
              sourceText: "FX-201 Framing nail gun coil 24 box $52.00 $1,248.00",
              method: "native",
            },
          },
        },
      ],
      refusals: [],
      summary: {
        totalPages: 1,
        extractedPages: 1,
        failedPages: 0,
        totalItems: 1,
        totalRefusals: 0,
      },
    };

    // Mock fetch returning successful response
    global.fetch = vi.fn().mockResolvedValueOnce({
      json: async () => ({ ok: true, data: mockSuccessResult }),
    });

    render(<HomePage />);

    // Simulate file selection
    const file = new File(["%PDF-1.4 mock"], "invoice.pdf", {
      type: "application/pdf",
    });
    const fileInput = screen.getByLabelText(/Upload PDF Document/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click Extract
    const extractButton = screen.getByRole("button", {
      name: /Extract Line Items/i,
    });
    fireEvent.click(extractButton);

    await waitFor(() => {
      expect(screen.getByText("Verified Extraction")).toBeInTheDocument();
      expect(screen.getByText("FX-201")).toBeInTheDocument();
      expect(
        screen.getByText("Framing nail gun coil, 90mm galv")
      ).toBeInTheDocument();
      expect(screen.getByText("$1,248.00")).toBeInTheDocument();
    });
  });

  // Test 2: Refusals render their real messages without generic "Error" text
  it("renders real refusal messages with conflicting source quotes in RefusalPanel", () => {
    const mockRefusals = [
      {
        reasonCode: RefusalCode.CONTRADICTORY_VALUES,
        message:
          "Conflicting carton counts detected on page 1: warehouse dispatch summary states '9 cartons dispatched', but warehouse notes state '11 cartons picked and loaded'. Neither figure can be safely accepted as the verified count.",
        page: 1,
        field: "cartonCount",
        evidence: [
          {
            page: 1,
            sourceText:
              "Summary: 9 cartons dispatched from Ironbark warehouse this run.",
            method: "native" as const,
          },
          {
            page: 1,
            sourceText:
              "Warehouse notes: 11 cartons picked and loaded onto the truck.",
            method: "native" as const,
          },
        ],
      },
    ];

    render(<RefusalPanel refusals={mockRefusals} />);

    // Real human-readable message must be present
    expect(
      screen.getByText("Could not determine carton count")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/warehouse dispatch summary states '9 cartons dispatched'/i)
    ).toBeInTheDocument();

    // Source quotes must be rendered
    expect(
      screen.getByText(
        /Summary: 9 cartons dispatched from Ironbark warehouse this run\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Warehouse notes: 11 cartons picked and loaded onto the truck\./i
      )
    ).toBeInTheDocument();

    // Must NOT contain generic error fallback
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  // Test 3: Partial success renders both items and refusals on the same screen (IB-56088)
  it("renders both extracted line items AND refusal alerts on the same screen (IB-56088)", async () => {
    const mockPartialResult: ExtractionResult = {
      status: "partial_success",
      items: [
        {
          code: "EL-902",
          description: "Cable tray 200mm galv, 3m length",
          quantity: "40",
          unit: "ea",
          unitPrice: "$34.00",
          amount: "$1,360.00",
          page: 1,
        },
        {
          code: "EL-905",
          description: "Cable tray brackets, heavy duty",
          quantity: "60",
          unit: "ea",
          unitPrice: "$5.20",
          amount: "$312.00",
          page: 1,
        },
        {
          code: "PL-114",
          description: "PVC waste pipe 100mm, 3m length",
          quantity: "20",
          unit: "length",
          unitPrice: "$18.90",
          amount: "$378.00",
          page: 1,
        },
      ],
      refusals: [
        {
          reasonCode: RefusalCode.CONTRADICTORY_VALUES,
          message:
            "Conflicting carton counts detected on page 1: warehouse dispatch summary states '9 cartons dispatched', but warehouse notes state '11 cartons picked and loaded'. Neither figure can be safely accepted as the verified count.",
          page: 1,
          field: "cartonCount",
          evidence: [
            {
              page: 1,
              sourceText:
                "Summary: 9 cartons dispatched from Ironbark warehouse this run.",
              method: "native",
            },
            {
              page: 1,
              sourceText:
                "Warehouse notes: 11 cartons picked and loaded onto the truck.",
              method: "native",
            },
          ],
        },
      ],
      summary: {
        totalPages: 1,
        extractedPages: 1,
        failedPages: 0,
        totalItems: 3,
        totalRefusals: 1,
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      json: async () => ({ ok: true, data: mockPartialResult }),
    });

    render(<HomePage />);

    const file = new File(["%PDF-1.4 mock"], "IB-56088.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/Upload PDF Document/i), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Extract Line Items/i })
    );

    await waitFor(() => {
      // 1. Both items AND refusal are visible on screen
      expect(screen.getByText("EL-902")).toBeInTheDocument();
      expect(screen.getByText("EL-905")).toBeInTheDocument();
      expect(screen.getByText("PL-114")).toBeInTheDocument();
      expect(
        screen.getByText("Could not determine carton count")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Partial Extraction with Notes")
      ).toBeInTheDocument();
    });
  });

  // Test 4: API error renders actual backend message without swallowing
  it("renders exact backend error message upon upload/request failure", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      json: async () => ({
        ok: false,
        error: {
          code: "FILE_TOO_LARGE",
          message:
            "The uploaded PDF exceeds the 4MB limit for serverless processing (received 5.20 MB). Please upload a smaller file.",
        },
      }),
    });

    render(<HomePage />);

    const file = new File(["%PDF-1.4 mock"], "large.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/Upload PDF Document/i), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Extract Line Items/i })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /Upload Request Failed \(FILE_TOO_LARGE\)/i,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /The uploaded PDF exceeds the 4MB limit for serverless processing \(received 5\.20 MB\)/i
        )
      ).toBeInTheDocument();
    });
  });

  // Test 5: Loading state with honest message
  it("displays honest loading status during document extraction", async () => {
    // Linear pending promise with withResolvers
    const { promise } = Promise.withResolvers<Response>();
    global.fetch = vi.fn().mockReturnValue(promise);

    render(<HomePage />);

    const file = new File(["%PDF-1.4 mock"], "invoice.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/Upload PDF Document/i), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Extract Line Items/i })
    );

    expect(screen.getByText("Extracting document...")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Scanning page text layers, applying OCR fallback if needed/i
      )
    ).toBeInTheDocument();
  });

  // Test 6: Invariant verification on missing amounts (IB-56010)
  it("displays 'Not in source' and NEVER calculates $222.00 for IB-56010", () => {
    const mockWeightedItems = [
      {
        code: "FX-401",
        description: "Coach screws, bulk carton",
        quantity: "3",
        weight: "20kg",
        unitPrice: "$74.00 /carton",
        amount: undefined, // NOT present in source
        page: 1,
      },
    ];

    render(<LineItemsTable items={mockWeightedItems} />);

    // Must show "Not in source" tag
    expect(screen.getByText("Not in source")).toBeInTheDocument();
    // Must display raw weight verbatim
    expect(screen.getByText("20kg")).toBeInTheDocument();

    // MUST NOT contain $222.00 anywhere
    expect(screen.queryByText("$222.00")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
