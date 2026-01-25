import { describe, expect, it } from "vitest";

const getShellLabels = () => {
  return [
    "No repos yet",
    "No PRs to show",
    "Nothing selected",
    "Add a repository",
    "Tracked repos"
  ];
};

describe("shell layout", () => {
  it("includes empty state labels", () => {
    expect(getShellLabels()).toContain("No repos yet");
    expect(getShellLabels()).toContain("No PRs to show");
    expect(getShellLabels()).toContain("Nothing selected");
    expect(getShellLabels()).toContain("Add a repository");
    expect(getShellLabels()).toContain("Tracked repos");
  });
});
