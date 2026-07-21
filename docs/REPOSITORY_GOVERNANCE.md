# Repository Governance

Orbit uses a low-friction governance model appropriate for a public repository with one active maintainer.

## Merge policy

- Changes to `main` must arrive through a pull request.
- Squash merge is the only enabled merge method, and linear history is required.
- Force pushes and branch deletion are blocked.
- Review conversations must be resolved before merge.
- CODEOWNERS review is requested automatically, but an approval is not required from the PR author because GitHub does not allow self-approval and the project currently has one maintainer.
- Auto-merge is enabled; merged head branches are deleted automatically.

## Required checks

Repository-owned checks are the merge contract: Node 22 and Node 24 CI, dependency review, CodeQL, repository-specific Semgrep, Codecov report generation, and workflow security. SonarQube Cloud, Snyk, external Semgrep, Socket, DeepScan, and Codecov status checks remain useful independent signals and must be reviewed, but do not all block the same pull request.

## Deliberate exclusions

- **Merge queue and Mergify:** current pull-request volume does not justify queue complexity or `merge_group` duplication. Reassess when concurrent ready-to-merge PRs become common.
- **Full Trivy filesystem scanning:** Snyk, Dependency Review, and the package-manager audit already own dependency findings. Trivy is limited to the repository's Dockerfile configuration.
- **Additional secret scanners:** GitHub secret scanning and repository push protection are enabled. A second blocking scanner would mostly duplicate supported-token detection.
- **markdownlint and codespell:** not enabled as blocking hooks until the documentation corpus has a reviewed baseline and project-specific dictionaries; Prettier remains the Markdown formatter.
- **Merging vendor coverage gates:** Codecov owns coverage trends while SonarQube Cloud owns maintainability and reliability. Only the repository-owned report generation job is initially blocking.

## Settings audit

Repository administrators should periodically verify:

- default `GITHUB_TOKEN` permissions are read-only and Actions cannot approve PRs;
- secret scanning and push protection remain enabled;
- only full-SHA actions are allowed;
- squash-only merge, auto-merge, automatic branch deletion, linear history, and pull-request enforcement remain active;
- required check names still match the checks emitted on `main`.
