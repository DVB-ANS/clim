# CRE loop evidence, 2026-10-06

Excerpts behind the counts in the [DevEx report](cre-devex-report.md). They come from two local files that are not in the repository: our run recorder's log (`bots/out/cre-runs.jsonl`) and the CLI transcripts of `cre/scripts/sim-loop.sh` (`cre/logs/`). Every transaction below is on Ethereum Sepolia; anyone can re-read its receipt. All of it is simulation: `cre workflow simulate --broadcast` through `MockKeystoneForwarder` `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`.

Desks: live `RiskDesk` `0xCDbfd6b9C0b97A8eE31706c6CDE5E54B4954334F`, replay `RiskDesk` `0x4b843dc3A7ec6202d2337cdeF8C67a0F10f24746`.

## The 637-run snapshot

From the first record (16:33:02 UTC) to 19:37:37 UTC: 637 runs, 334 on the live desk and 303 on the replay desk.

| Outcome | Runs |
|---|---|
| Landed, recorded with its receipt (601 `applied`, 18 of them classified from the receipt; 20 `not-applied`) | 621 |
| Landed, recorded without a receipt after losing the last log line (receipts re-read on 2026-10-06) | 9 |
| CLI credential check failed before simulating (row 24) | 5 |
| Quorum of 2 venues out of 4, no report (`clim: no report ([2]Unknown: quorum 2/4 < 3)`, live, 16:44:06 UTC) | 1 |
| Lost to our own network (replay run started 18:23:08 UTC, see row 24) | 1 |
| **Total** | **637** |

"Landed" means the forwarder's `ReportProcessed` result is true and the desk's `RiskReported` event is in the same receipt.

From 18:47:37 UTC (commit `5f88da4`) the recorder classifies each run from its receipt, whatever the workflow printed, and keeps the hash of `Write report transaction succeeded: 0x...` when the last log line is lost. 18 of the 601 `applied` runs were recorded that way: 16 that logged `NOT APPLIED` and 2 that lost their last log line (both lists below).

## 36 runs that logged NOT APPLIED and landed (row 9)

The workflow re-reads `RiskDesk.state()` at `latest` after each write. These 36 reads hit a lagging node of a load-balanced public RPC, so the workflow printed `NOT APPLIED`, yet each receipt has status 1, `ReportProcessed` true and a `RiskReported` event from the desk. The recorder logged the first 20 as `not-applied` and, after its change at 18:47:37 UTC, the last 16 as `applied` from the receipt (receipts of those 16 re-read with `cast receipt` on 2026-10-07).

| Desk | seq | Transaction | Recorded as |
|---|---|---|---|
| live | 7 | `0x6a29ce8bdd372fcd16a9d02e8887118047f4c12d53a5cc7b9751f40e64dfebce` | `not-applied` |
| live | 23 | `0x5119f3ce4151f77c669eb6acbaa0976f26ebbcb779dabd69c86c3f769088fdf4` | `not-applied` |
| live | 40 | `0x1ae56a16b2fbc207f53640976c126bb029be75a1947587cb30fc19ace11f6084` | `not-applied` |
| live | 48 | `0xc5a2deb11b68e5b00538afca857f580f7704bd74571f7f5862cebce4917b4b55` | `not-applied` |
| live | 55 | `0x58da4d2fe99064e5e58c0957fdb9e786e2f920480ac294feb034789bb7c2b80a` | `not-applied` |
| replay | 32 | `0x126204b121d0ea7ef279f5dbcb71c20c14486d66bc00bf0047a1128595bff8fe` | `not-applied` |
| replay | 38 | `0xb421686b45e537ed6a0179cb30a08c016a432cb46d6ea28dfc12544686626598` | `not-applied` |
| live | 90 | `0x77d742ea8ce3d8aa1dc0023673dcb5e782a8427132f41b6263f16a7707d88564` | `not-applied` |
| replay | 65 | `0x4b97aa3040a4fbb5d369733168055adb9333f9e0e6ca51e44b22f7e0db1447cb` | `not-applied` |
| live | 124 | `0xbf48019c15b01ab80ddbb7ac4d1954d3a3773b4ca2ff2bd61fff484e3e9d08df` | `not-applied` |
| replay | 90 | `0x7036ff92c7d6100f038823ead3b132e19f142e8d34de55626722697b3ec4b095` | `not-applied` |
| live | 144 | `0xfbf628095e2b740a5b11add2730ed110523677b7379d80482d8a33f70c121617` | `not-applied` |
| live | 157 | `0xc1a1d14b0f2bbb04f4ac48b83b4fc0ae5c0449fe76cc5ddd8946a14117f5a7c2` | `not-applied` |
| replay | 163 | `0xe034be012fd6055a243642ab20fa38bed915355cf785f93b69147dfd967e17dc` | `not-applied` |
| replay | 166 | `0x998b38f80ed7b45b69b5b41f8ca0743206ca40d504fec2b620c337bc8b0f0aa9` | `not-applied` |
| live | 214 | `0x2b18c41f153a19e3f230d27a9872fd1240301241257666354afb4971aa319a02` | `not-applied` |
| live | 216 | `0x4d3a055a955c402e0966e29e9b619a44f423307d22a893cf3abb467fa0f33901` | `not-applied` |
| replay | 180 | `0xfc601127afdc2c0c2bd8bc5f76b3c6debcdc3eeea67eedcc8887f39eadfaa4aa` | `not-applied` |
| replay | 187 | `0x4971d6180d5e299418aac3771e3b0c6409242aad35c58adede907e2a6a37bec8` | `not-applied` |
| replay | 202 | `0x18c203f0ed1b8e1c2a42c44a01a95937be82c8d5db91ec90ceda319ad6a79309` | `not-applied` |
| live | 244 | `0xfcda80c99417041b1c2db42449b33c1238ab9c7822aa4bb896aac584d3424826` | `applied` (from the receipt) |
| replay | 207 | `0xf1f9b599d51c0d89c877b788f95e82e822a88007cb81c601df39297d86605596` | `applied` (from the receipt) |
| replay | 231 | `0x09561bfc97df775dace8488aba1384021b09113634607ef9e6eaee5a69c162ae` | `applied` (from the receipt) |
| replay | 234 | `0xe6802a9824bdec53350c74107c321bcf78ef2262fae5ebd6a186a9c738c4957a` | `applied` (from the receipt) |
| live | 280 | `0x58211fcf63d7fe7b1030e3a4f076f0be4b38c0a7204c5615a89da4c08ee8c590` | `applied` (from the receipt) |
| live | 285 | `0x963fe8a8f035cce1d074c5080818edf55b59f128e0b83a8b6b2c3716e100114a` | `applied` (from the receipt) |
| replay | 247 | `0xebf27a98c64bd5a1377c62ae94f15e24753188aaf832712d8ad95afe9572622b` | `applied` (from the receipt) |
| replay | 256 | `0x23dceb7fb7f96d812310e021a0120d51b833a95b052e807d4877d3cdaf8e1331` | `applied` (from the receipt) |
| live | 300 | `0x50397891d798c423a0f798f57664cedbc28e1d02f06198682fcdecadf5d43f3a` | `applied` (from the receipt) |
| live | 302 | `0x1abd7d23594a60e737ab609229d9df1fcb524173228e18cb7e8534cd25710158` | `applied` (from the receipt) |
| replay | 262 | `0xad8a8d3d134c6a795fe2ce54b16c5245a245d73876aa568d975b7ae8cb58cb82` | `applied` (from the receipt) |
| replay | 270 | `0x712656d2c25fe7034101339d431e7a1592fea00a04817a7d6a3a48d89641aabe` | `applied` (from the receipt) |
| replay | 276 | `0x3b17a29242d47ef70f10c0d23abd08c90d963c64e6fd09dbdb9a475316832f74` | `applied` (from the receipt) |
| live | 318 | `0x0b36d428093d3380c97b116640d37aca7b1070279a1813620053c617a0d98a34` | `applied` (from the receipt) |
| replay | 289 | `0x18159cf121b1d10f81a9a20c28357cd82f2d37372bbdd1cc542eeb79cd1ac81c` | `applied` (from the receipt) |
| live | 330 | `0x814545262e2c9895977882bce6daa6f61a9126fa248ecf9e04feeb3235ee9fe0` | `applied` (from the receipt) |

## 11 runs that lost their last log line and landed (row 22)

Each run printed `✓ Workflow Simulation Result`, then `context canceled` at shutdown, and never printed the workflow's last `[USER LOG]` line (`REPORT applied` or `NOT APPLIED`). The hash comes from clim's own `Write report transaction succeeded: 0x...` line, printed earlier in the run.

| Run start (UTC) | Desk | Result | Transaction | Block |
|---|---|---|---|---|
| 17:03:42 | replay | `OK` | `0x31e9cf464b08220c70e7e1f742461723d2a154175ed7fb6db9eb327319f68ef0` | 11857203 |
| 17:05:43 | replay | `NOT_APPLIED` | `0xba31e6ad95ef94dbb5629c24b99ab55eaccd772309508f075ea62980d8825a62` | 11857214 |
| 17:13:45 | replay | `OK` | `0xd947386d940c87aba53727bbd26e6ac80f25467f826aa5cf4bb50053e797e7e0` | 11857253 |
| 17:15:45 | replay | `OK` | `0x66f751f601f467230dca91c9136080121bd6a95b67229fd7ec875590f23e1092` | 11857262 |
| 17:17:44 | live | `OK` | `0xf4d7b399eb1014bcb8ef824bfb3e572691fb297c84f96ba966a6b9740965534a` | 11857271 |
| 17:18:14 | live | `OK` | `0x524cc65769874fbb4e0686e90746d0ecaedbefd8150f4a3abfbf1f75229eecb9` | 11857274 |
| 17:18:17 | replay | `OK` | `0x365c37495392dfc1a1321fa45ab7f5bd48fdb8d286e84a177b56d002bf3c03b0` | 11857274 |
| 17:18:45 | live | `OK` | `0x4917d63566c8b18d4cb03e642f3ea99445422f2fc17e895d2566a02782a1b105` | 11857277 |
| 18:42:20 | replay | `NOT_APPLIED` | `0x94abeeef4a6beaafe65e6d7f5a9bb1d92a59c73c97ea278298ccf9af76523ce5` | 11857686 |
| 19:24:51 | replay | `OK` | `0x2f50206b6cb40d27ade6782f165e873061fccb988425c20c052bed75801bb297` | 11857895 |
| 19:33:49 | live | `OK` | `0xc57c924deaf6e2dd0c417b56aac71b6db2752252e8614d9f123b591d4fff355a` | 11857940 |

The first eight are within the first 413 recorded runs (7 `OK`, 1 `NOT_APPLIED`). The first nine were recorded without a receipt; the last two (replay seq 275, live seq 334) were recorded as `applied` from the receipt, and their receipts were re-read with `cast receipt` on 2026-10-07. Excerpt of the 17:03:42 run:

```text
2026-10-06T17:04:01Z [USER LOG] Write report transaction succeeded: 0x31e9cf464b08220c70e7e1f742461723d2a154175ed7fb6db9eb327319f68ef0

✓ Workflow Simulation Result:
"OK 0x31e9cf464b08220c70e7e1f742461723d2a154175ed7fb6db9eb327319f68ef0"

time=2026-10-06T17:04:02.405Z level=INFO msg="context canceled"
time=2026-10-06T17:04:02.406Z level=INFO msg="context canceled"
2026-10-06T17:04:02Z [SIMULATION] Execution finished signal received
2026-10-06T17:04:02Z [SIMULATION] Skipping WorkflowEngineV2
```

## 5 credential failures (row 24)

Each run printed `✗ Credential validation failed`, then `✗ authentication required: credential validation failed: authentication failed: unable to retrieve organization info. ...`, and stopped before simulating. The table gives what followed `...`, if anything.

| Run start (UTC) | Desk | Network error appended |
|---|---|---|
| 17:03:12 | replay | none |
| 17:24:51 | replay | none |
| 18:10:38 | replay | `Post "https://api.cre.chain.link/graphql": net/http: TLS handshake timeout` |
| 18:23:19 | live | `Post "https://api.cre.chain.link/graphql": dial tcp: lookup api.cre.chain.link: no such host` |
| 18:27:19 | live | none |

The 18:23:19 failure came while our own network was down: the replay run that started at 18:23:08 UTC died on the Sepolia RPC with `✗ workflow execution failed: [2]Unknown: Post "https://ethereum-sepolia-rpc.publicnode.com": read tcp …: read: can't assign requested address`. The other four came with no network trouble on our side.

## Parallel build collision (row 25)

When both loops were restarted in the same second at about 18:47 UTC, the replay loop's `cre workflow build` failed:

```text
✗ Build failed:
✗ failed to compile workflow: failed to compile workflow: open .../cre/risk-desk/.cre_build_tmp.wasm: no such file or directory
```
