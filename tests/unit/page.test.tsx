// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage Component", () => {
  it("renders product title and extraction heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "InstaQuote AI" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Deterministic PDF Line-Item Extraction")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Extract Trade Invoices & Quotes" })
    ).toBeInTheDocument();
  });

  it("renders accessible file upload dropzone", () => {
    render(<HomePage />);
    expect(
      screen.getByText("Choose a PDF or drag & drop it here")
    ).toBeInTheDocument();
    expect(screen.getByText(/PDF only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload PDF Document/i)).toBeInTheDocument();
  });

  it("displays zero-hallucination security badge", () => {
    render(<HomePage />);
    expect(screen.getByText("Zero-Hallucination Core")).toBeInTheDocument();
  });
});
