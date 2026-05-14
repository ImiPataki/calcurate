import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("./api", () => ({
  api: {
    config: () =>
      Promise.resolve({
        rate_lists: [
          {
            code: "england_2023",
            name: "England 2023 Rating List",
            status: "active",
            country: "England",
            calculation_strategy: "england_2023",
            start_date: "2023-04-01",
            end_date: "2026-03-31",
            years: [],
            transition_bands: [],
          },
        ],
      }),
    scenarios: () => Promise.resolve([]),
  },
}));

describe("App", () => {
  it("renders calculator shell", async () => {
    render(<App />);
    expect((await screen.findAllByText("Calculator")).length).toBeGreaterThan(0);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});
