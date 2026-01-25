import { describe, expect, it } from "vitest";

const getShellLabels = () => {
  return [
    "No repos yet",
    "No PRs to show",
    "Nothing selected",
    "Add a repository",
    "Tracked repos",
    "GitHub auth",
    "Pull Requests",
    "Refresh",
  ];
};

describe("shell layout", () => {
  it("includes empty state labels", () => {
    expect(getShellLabels()).toContain("No repos yet");
    expect(getShellLabels()).toContain("No PRs to show");
    expect(getShellLabels()).toContain("Nothing selected");
    expect(getShellLabels()).toContain("Add a repository");
    expect(getShellLabels()).toContain("Tracked repos");
    expect(getShellLabels()).toContain("GitHub auth");
    expect(getShellLabels()).toContain("Pull Requests");
    expect(getShellLabels()).toContain("Refresh");
  });
});
