import React, { useEffect, useRef, useState } from "react";
import { createPollingController } from "./polling-controller.js";

const EmptyState: React.FC<{ title: string; description: string }> = ({
  title,
  description
}) => {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
};

type PullRequest = {
  number: number;
  title: string;
  branch: string;
  status: string;
};
type FailedLog = {
  log: string;
  runId?: number;
  checkName?: string;
  classification?: {
    tag: "infra" | "code" | "unknown";
    actionable: boolean;
    requiresCopilot: boolean;
    reason: string;
    matched?: string[];
  };
};
type Suggestion = {
  diff: string;
  summary?: string | null;
  runId?: number | null;
  createdAt?: string;
};

export const ShellLayout: React.FC = () => {
  const [repoInput, setRepoInput] = useState("");
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [pullRequestsByRepo, setPullRequestsByRepo] = useState<
    Record<string, PullRequest[]>
  >({});
  const [failedLogsByPr, setFailedLogsByPr] = useState<
    Record<number, FailedLog>
  >({});
  const [suggestionsByPr, setSuggestionsByPr] = useState<
    Record<number, Suggestion>
  >({});
  const [isLoadingPrs, setIsLoadingPrs] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<
    | { state: "loading" }
    | { state: "ready"; authenticated: boolean; username?: string; message: string }
  >({ state: "loading" });
  const pollingRef = useRef(
    createPollingController(async () => {
      if (!selectedRepo) {
        return;
      }
      await loadPullRequests(selectedRepo);
    })
  );

  useEffect(() => {
    let active = true;
    const authClient = window.beacon?.getAuthStatus;

    if (!authClient) {
      setAuthStatus({
        state: "ready",
        authenticated: false,
        message: "Auth status unavailable."
      });
      return () => {
        active = false;
      };
    }

    authClient()
      .then((status) => {
        if (!active) {
          return;
        }
        setAuthStatus({ state: "ready", ...status });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAuthStatus({
          state: "ready",
          authenticated: false,
          message: error instanceof Error ? error.message : "Unable to load auth."
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const pullRequests = selectedRepo ? pullRequestsByRepo[selectedRepo] ?? [] : [];
  const hasRepos = repoPaths.length > 0;
  const hasPrs = pullRequests.length > 0;
  const selectedPullRequest = selectedPrNumber
    ? pullRequests.find((pr) => pr.number === selectedPrNumber) ?? null
    : null;
  const selectedLog = selectedPrNumber
    ? failedLogsByPr[selectedPrNumber] ?? null
    : null;
  const selectedSuggestion = selectedPrNumber
    ? suggestionsByPr[selectedPrNumber] ?? null
    : null;
  const getActionLabel = (classification?: FailedLog["classification"]) => {
    if (!classification) {
      return null;
    }

    if (classification.actionable) {
      return "Actionable";
    }

    if (classification.tag === "infra") {
      return "Infra";
    }

    return "Needs review";
  };
  const handleAddRepo = async () => {
    const result = await window.beacon.normalizeRepoPath(repoInput);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    if (result.path) {
      const normalizedPath = result.path;
      setRepoPaths((current) => {
        if (current.includes(normalizedPath)) {
          return current;
        }
        return [...current, normalizedPath];
      });
      setRepoInput("");
      setErrorMessage(null);
      setSelectedRepo((current) => current ?? normalizedPath);
    }
  };

  const loadPullRequests = async (repoPath: string) => {
    const listClient = window.beacon?.listPullRequests;
    if (!listClient) {
      setPrError("Pull request API unavailable.");
      setPullRequestsByRepo((current) => ({ ...current, [repoPath]: [] }));
      return;
    }

    setIsLoadingPrs(true);
    setPrError(null);
    try {
      const result = await listClient(repoPath);
      if (result.error) {
        setPrError(result.error);
        setPullRequestsByRepo((current) => ({ ...current, [repoPath]: [] }));
      } else {
        setPullRequestsByRepo((current) => ({
          ...current,
          [repoPath]: result.prs ?? []
        }));
      }
    } catch (error) {
      setPrError(error instanceof Error ? error.message : "Unable to load PRs.");
      setPullRequestsByRepo((current) => ({ ...current, [repoPath]: [] }));
    } finally {
      setIsLoadingPrs(false);
    }
  };

  const handleSelectRepo = (repo: string) => {
    setSelectedRepo(repo);
    setSelectedPrNumber(null);
    void loadPullRequests(repo);
  };

  useEffect(() => {
    pollingRef.current.setHandler(async () => {
      if (!selectedRepo) {
        return;
      }
      await loadPullRequests(selectedRepo);
    });

    if (!selectedRepo) {
      pollingRef.current.stop();
      return undefined;
    }

    pollingRef.current.start(120000);

    return () => {
      pollingRef.current.stop();
    };
  }, [selectedRepo]);

  const handleSelectPr = (prNumber: number) => {
    setSelectedPrNumber(prNumber);
    setLogError(null);
    setApplyMessage(null);
  };

  const handleFetchFailedLog = async () => {
    if (!selectedRepo || !selectedPullRequest) {
      return;
    }

    const logClient = window.beacon?.fetchFailedRunLog;
    if (!logClient) {
      setLogError("Failed log API unavailable.");
      return;
    }

    setIsLoadingLog(true);
    setLogError(null);
    try {
      const result = await logClient(selectedRepo, selectedPullRequest.number);
      if (result.error) {
        setLogError(result.error);
        return;
      }

      const logText = result.log;
      if (logText === undefined) {
        setLogError("No failed log output returned.");
        return;
      }

      if (logText.length === 0) {
        setLogError("Failed log output was empty.");
        return;
      }

      setFailedLogsByPr((current) => ({
        ...current,
        [selectedPullRequest.number]: {
          log: logText,
          runId: result.runId,
          checkName: result.checkName,
          classification: result.classification
        }
      }));
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "Unable to load logs.");
    } finally {
      setIsLoadingLog(false);
    }
  };

  const handleFetchSuggestion = async () => {
    if (!selectedRepo || !selectedPullRequest) {
      return;
    }

    const suggestionClient = window.beacon?.getLatestSuggestion;
    if (!suggestionClient) {
      setLogError("Suggestion API unavailable.");
      return;
    }

    setIsLoadingSuggestion(true);
    setLogError(null);
    setApplyMessage(null);
    try {
      const result = await suggestionClient(selectedRepo, selectedPullRequest.number);
      if (result.error) {
        setLogError(result.error);
        return;
      }

      const diff = result.diff;
      if (!diff) {
        setLogError("No suggestion diff available yet.");
        return;
      }

      setSuggestionsByPr((current) => ({
        ...current,
        [selectedPullRequest.number]: {
          diff,
          summary: result.summary,
          runId: result.runId,
          createdAt: result.createdAt
        }
      }));
    } catch (error) {
      setLogError(
        error instanceof Error ? error.message : "Unable to load suggestion."
      );
    } finally {
      setIsLoadingSuggestion(false);
    }
  };

  const handleGenerateSuggestion = async () => {
    if (!selectedRepo || !selectedPullRequest) {
      return;
    }

    const generateClient = window.beacon?.generateSuggestion;
    if (!generateClient) {
      setLogError("Suggestion generation API unavailable.");
      return;
    }

    setIsGeneratingSuggestion(true);
    setLogError(null);
    setApplyMessage(null);
    try {
      const result = await generateClient(selectedRepo, selectedPullRequest.number);
      if (result.error) {
        setLogError(result.error);
        return;
      }

      const diff = result.diff;
      if (!diff) {
        setLogError("No suggestion diff returned.");
        return;
      }

      setSuggestionsByPr((current) => ({
        ...current,
        [selectedPullRequest.number]: {
          diff,
          summary: result.summary,
          runId: result.runId,
          createdAt: result.createdAt
        }
      }));
    } catch (error) {
      setLogError(
        error instanceof Error ? error.message : "Unable to generate suggestion."
      );
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (!selectedRepo || !selectedPullRequest) {
      return;
    }

    const applyClient = window.beacon?.applySuggestion;
    if (!applyClient) {
      setApplyMessage("Apply API unavailable.");
      return;
    }

    setIsApplyingSuggestion(true);
    setLogError(null);
    setApplyMessage(null);
    try {
      const result = await applyClient(selectedRepo, selectedPullRequest.number);
      if (result.error) {
        setApplyMessage(result.error);
        return;
      }

      if (result.errors && result.errors.length > 0) {
        setApplyMessage(result.errors.join(" "));
        return;
      }

      if (!result.appliedFiles || result.appliedFiles.length === 0) {
        setApplyMessage("No files were updated.");
        return;
      }

      setApplyMessage(
        `Applied to ${result.appliedFiles.length} file${
          result.appliedFiles.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      setApplyMessage(
        error instanceof Error ? error.message : "Unable to apply suggestion."
      );
    } finally {
      setIsApplyingSuggestion(false);
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Beacon</h2>
        <section className="auth-panel">
          <h3>GitHub auth</h3>
          {authStatus.state === "loading" ? (
            <p>Checking authentication...</p>
          ) : authStatus.authenticated ? (
            <p>
              Signed in{authStatus.username ? ` as ${authStatus.username}` : "."}
            </p>
          ) : (
            <p>{authStatus.message}</p>
          )}
        </section>
        <section className="repo-panel">
          <h3>Add a repository</h3>
          <p>Enter a local path to start monitoring PRs.</p>
          <label className="repo-input">
            <span className="sr-only">Repository path</span>
            <input
              type="text"
              value={repoInput}
              placeholder="~/git/my-repo"
              onChange={(event) => setRepoInput(event.target.value)}
            />
          </label>
          {errorMessage ? (
            <div className="repo-error" role="alert">
              {errorMessage}
            </div>
          ) : null}
          <button type="button" onClick={handleAddRepo}>
            Add repo
          </button>
        </section>
        <section className="repo-list">
          <h3>Tracked repos</h3>
          {hasRepos ? (
            <ul>
              {repoPaths.map((repo) => (
                <li key={repo}>
                  <button
                    type="button"
                    className={
                      selectedRepo === repo
                        ? "repo-select active"
                        : "repo-select"
                    }
                    onClick={() => handleSelectRepo(repo)}
                  >
                    {repo}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No repos yet"
              description="Add a repo path to start monitoring PRs."
            />
          )}
        </section>
      </aside>
      <main className="main">
        <section className="list">
          <header>
            <div className="panel-heading">
              <div>
                <h1>Pull Requests</h1>
                <p>Monitor CI status and suggested fixes.</p>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={() => (selectedRepo ? loadPullRequests(selectedRepo) : undefined)}
                disabled={!selectedRepo || isLoadingPrs}
              >
                Refresh
              </button>
            </div>
          </header>
          {isLoadingPrs ? (
            <div className="panel-message">Loading pull requests...</div>
          ) : prError ? (
            <div className="panel-message error" role="alert">
              {prError}
            </div>
          ) : selectedRepo ? (
            hasPrs ? (
              <ul className="pr-list">
                {pullRequests.map((pr) => {
                  const classification = failedLogsByPr[pr.number]?.classification;
                  const actionLabel = getActionLabel(classification);
                  return (
                    <li key={pr.number}>
                      <button
                        type="button"
                        className={
                          selectedPrNumber === pr.number
                            ? "pr-card-button selected"
                            : "pr-card-button"
                        }
                        onClick={() => handleSelectPr(pr.number)}
                      >
                        <div className="pr-title">
                          <span className="pr-number">#{pr.number}</span>
                          {pr.title}
                        </div>
                        <div className="pr-meta">
                          <span>{pr.branch}</span>
                          <span className="pr-badges">
                            <span className={`pr-status ${pr.status.toLowerCase()}`}>
                              {pr.status}
                            </span>
                            {actionLabel ? (
                              <span
                                className={`pr-action-tag ${
                                  classification?.tag ?? "unknown"
                                }`}
                              >
                                {actionLabel}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No PRs to show"
                description="No pull requests found for this repository."
              />
            )
          ) : (
            <EmptyState
              title="No PRs to show"
              description="Select a repo to see its open pull requests."
            />
          )}
        </section>
        <section className="detail">
          <header>
            <h2>Details</h2>
          </header>
          {selectedPullRequest ? (
            <div className="detail-panel">
              <div className="detail-heading">
                <div>
                  <h3>PR #{selectedPullRequest.number}</h3>
                  <p>{selectedPullRequest.title}</p>
                </div>
                <div className="detail-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleFetchFailedLog}
                    disabled={isLoadingLog}
                  >
                    {isLoadingLog ? "Fetching log..." : "Fetch failed log"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleGenerateSuggestion}
                    disabled={isGeneratingSuggestion}
                  >
                    {isGeneratingSuggestion
                      ? "Generating suggestion..."
                      : "Generate suggestion"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleFetchSuggestion}
                    disabled={isLoadingSuggestion}
                  >
                    {isLoadingSuggestion
                      ? "Loading suggestion..."
                      : "Load suggestion"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleApplySuggestion}
                    disabled={isApplyingSuggestion || !selectedSuggestion}
                  >
                    {isApplyingSuggestion ? "Applying..." : "Apply suggestion"}
                  </button>
                </div>
              </div>
              {applyMessage ? (
                <div className="panel-message" role="status">
                  {applyMessage}
                </div>
              ) : null}
              {logError ? (
                <div className="panel-message error" role="alert">
                  {logError}
                </div>
              ) : selectedLog ? (
                <div className="log-panel">
                  <div className="log-meta">
                    <span>{selectedLog.checkName ?? "Failed check"}</span>
                    {selectedLog.runId ? <span>Run {selectedLog.runId}</span> : null}
                  </div>
                  {selectedLog.classification ? (
                    <div className="log-classification">
                      <span className={`classification-tag ${selectedLog.classification.tag}`}>
                        {getActionLabel(selectedLog.classification)}
                      </span>
                      <p>{selectedLog.classification.reason}</p>
                    </div>
                  ) : null}
                  <pre className="log-output">{selectedLog.log}</pre>
                </div>
              ) : selectedSuggestion ? (
                <div className="log-panel">
                  <div className="log-meta">
                    <span>Suggestion diff</span>
                    {selectedSuggestion.runId ? (
                      <span>Run {selectedSuggestion.runId}</span>
                    ) : null}
                  </div>
                  {selectedSuggestion.summary ? (
                    <div className="log-classification">
                      <span className="classification-tag">Summary</span>
                      <p>{selectedSuggestion.summary}</p>
                    </div>
                  ) : null}
                  <pre className="log-output">{selectedSuggestion.diff}</pre>
                </div>
              ) : (
                <EmptyState
                  title="No logs yet"
                  description="Fetch failed logs or suggestions to see details here."
                />
              )}
            </div>
          ) : (
            <EmptyState
              title="Nothing selected"
              description="Pick a pull request to review failures and fixes."
            />
          )}
        </section>
      </main>
    </div>
  );
};
