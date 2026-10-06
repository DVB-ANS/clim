# Message to the Chainlink mentor (draft)

**Draft, not sent.** Sofiane sends it himself, from his own account, after checking that the links open on the public repo. Fill in the mentor's name.

---

Hi <name>,

Thanks again for your questions at our idea pitch on day one. Here are the follow-ups from clim:

1. How the fee changes, and whether a pool that is already live can switch to clim: https://github.com/DVB-ANS/clim/blob/main/docs/faq.md#who-changes-the-fee-and-how and https://github.com/DVB-ANS/clim/blob/main/docs/faq.md#can-a-pool-that-is-already-live-switch-to-clim
2. What we think of CRE after building with it: our developer experience report, with what worked well and our top five asks: https://github.com/DVB-ANS/clim/blob/main/docs/feedback/cre-devex-report.md
3. The friction log behind that report (25 entries, each with what we hit, a suggestion and a status): https://github.com/DVB-ANS/clim/blob/main/docs/feedback/cre-friction-log.md

The repo is https://github.com/DVB-ANS/clim, and the workflow is in `cre/risk-desk`. Our deploy access request (organization org_5FPbh9KQQJLGWcEh, sent on 6 October at 22:56 SGT) was still not enabled the next morning, so clim runs in simulation: `cre workflow simulate --broadcast` writes real Sepolia transactions every 30 s.

Happy to walk your team through any of it.

Sofiane (clim, TOKEN2049 Origins)
