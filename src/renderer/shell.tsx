import React from "react";

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
  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Beacon</h2>
        <EmptyState
          title="No repos yet"
          description="Add a repo path to start monitoring PRs."
        />
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
