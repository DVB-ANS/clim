// The project's links outside the app: the repository, the demo video, the CRE workflow and the
// evidence page of its simulator runs. Both repo files are committed (cre/logs is not, so nothing links to it).
export const GITHUB_URL = "https://github.com/DVB-ANS/clim";
/** The full demo video (Google Drive, anyone with the link). null until the maintainer sets it; every link to it is hidden while null. */
export const DEMO_VIDEO_URL: string | null = null;
export const CRE_WORKFLOW_URL = `${GITHUB_URL}/blob/main/cre/risk-desk/main.ts`;
/** Excerpts of the 6 October simulator runs, each with its Sepolia transaction. Not the raw run log. */
export const CRE_EVIDENCE_URL = `${GITHUB_URL}/blob/main/docs/feedback/cre-loop-evidence.md`;
