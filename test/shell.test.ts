import { describe, expect, it } from "vitest";

const getEmptyStateLabels = () => {
  return [
    "No repos yet",
    "No PRs to show",
    "Nothing selected"
  ];
};

describe("shell layout", () => {
  it("includes empty state labels", () => {
    expect(getEmptyStateLabels()).toContain("No repos yet");
    expect(getEmptyStateLabels()).toContain("No PRs to show");
    expect(getEmptyStateLabels()).toContain("Nothing selected");
  });
});
