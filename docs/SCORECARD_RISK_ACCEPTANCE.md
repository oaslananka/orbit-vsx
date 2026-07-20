# OpenSSF Scorecard Risk Acceptance

Status: reviewed for issue #156 on 2026-07-21

Orbit treats Scorecard as evidence, not as a target to game. Actionable findings are
fixed in code or repository configuration. Findings whose score is determined by
repository age, historical ratios, or unavailable second-person review are dismissed
only after the current compensating controls are verified.

| Scorecard check    | Current constraint                                                                                                                      | Compensating controls                                                                                                                                                                     | Revisit condition                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Maintained         | Scorecard assigns zero to repositories younger than 90 days. No code change can alter repository age.                                   | Active issue handling, weekly dependency automation, protected CI, and published releases.                                                                                                | Re-run after the repository is older than 90 days.                                               |
| Code-Review        | Orbit currently has one human maintainer, so a second-person approval cannot be required without blocking all maintenance.              | All changes use pull requests; seven protected checks are required; Snyk, SonarCloud, CodeQL, Semgrep, Dependency Review, Socket, DeepScan, and agent comments are reviewed before merge. | Require one human approval when a second active maintainer is available.                         |
| CII-Best-Practices | The OpenSSF Best Practices badge is still `InProgress`; completing its attested questionnaire is a governance task, not a source patch. | This repository publishes its security policy, dependency policy, provenance, SBOM, threat model, and release governance.                                                                 | Revisit each release until the badge reaches Passing.                                            |
| CI-Tests           | Scorecard grades the ratio of historical merged changes; current CI already runs on every pull request and protected branch update.     | Node 22/minimum VS Code, Node 24/stable VS Code, and clean-container extension-host verification are active.                                                                              | Allow the historical window to age out; reopen if any current PR merges without protected tests. |
| SAST               | Scorecard grades historical coverage; current pull requests and `main` run CodeQL, Semgrep, and SonarCloud.                             | CodeQL, repository-owned Semgrep CE, SonarCloud, Snyk, and DeepScan are verified on each PR.                                                                                              | Allow the historical window to age out; reopen if a current change lacks SAST.                   |

The Vulnerabilities, Token-Permissions, Pinned-Dependencies, and Fuzzing findings are
not accepted risks. Issue #156 remediates them and requires a clean post-merge scan.
