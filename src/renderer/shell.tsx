import React, { useEffect, useState } from "react";

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

export const ShellLayout: React.FC = () => {
  const [repoInput, setRepoInput] = useState("");
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<
    | { state: "loading" }
    | { state: "ready"; authenticated: boolean; username?: string; message: string }
  >({ state: "loading" });

  useEffect(() => {
    let active = true;

    window.beacon
      .getAuthStatus()
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

  const hasRepos = repoPaths.length > 0;
  const handleAddRepo = () => {
    const result = window.beacon.normalizeRepoPath(repoInput);

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
                <li key={repo}>{repo}</li>
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
            <h1>Pull Requests</h1>
            <p>Monitor CI status and suggested fixes.</p>
          </header>
          <EmptyState
            title="No PRs to show"
            description="Select a repo to see its open pull requests."
          />
        </section>
        <section className="detail">
          <header>
            <h2>Details</h2>
          </header>
          <EmptyState
            title="Nothing selected"
            description="Pick a pull request to review failures and fixes."
          />
        </section>
      </main>
    </div>
  );
};
