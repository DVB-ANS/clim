// The project's links outside the app: the repository, the CRE workflow and the evidence folder of
// its runs. Both are committed on main (cre/logs is not, so nothing links to it).
export const GITHUB_URL = "https://github.com/DVB-ANS/clim";
/** The workflow itself: it fetches the venues, computes the volatility and builds each report (main.ts only starts the runner). */
export const CRE_WORKFLOW_URL = `${GITHUB_URL}/blob/main/cre/risk-desk/workflow.ts`;
/** docs/evidence: every RiskReported event with its transaction, and simulate transcripts. */
export const CRE_EVIDENCE_URL = `${GITHUB_URL}/tree/main/docs/evidence`;
