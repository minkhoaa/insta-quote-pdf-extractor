// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage Component", () => {
  it("renders product title and description", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "InstaQuote AI" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Evidence-First PDF Line-Item Extractor")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Deterministic Line-Item Extraction" })
    ).toBeInTheDocument();
  });

  it("renders upload area placeholder without fake extraction", () => {
    render(<HomePage />);
    expect(screen.getByText("PDF Upload Placeholder")).toBeInTheDocument();
    expect(screen.getByText(/PDF only/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready for extraction pipeline integration/i)).toBeInTheDocument();
  });

  it("displays core architectural pillars", () => {
    render(<HomePage />);
    expect(screen.getByText("Evidence First")).toBeInTheDocument();
    expect(screen.getByText("Conservative Rules")).toBeInTheDocument();
    expect(screen.getByText("Failure Isolation")).toBeInTheDocument();
  });
});
