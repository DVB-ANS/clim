#!/usr/bin/env bash
# Copies the ABIs that cre/, bots/ and app/ consume from Foundry artifacts to shared/abis/.
# Run from anywhere: contracts/script/export-abis.sh
set -euo pipefail
cd "$(dirname "$0")/.."
forge build >/dev/null
OUT=../shared/abis
mkdir -p "$OUT"
for artifact in \
  RiskDesk.sol/RiskDesk \
  IRiskDesk.sol/IRiskDesk \
  ClimHook.sol/ClimHook \
  TestToken.sol/TestToken \
  IPoolManager.sol/IPoolManager \
  IStateView.sol/IStateView \
  PoolSwapTest.sol/PoolSwapTest \
  PoolModifyLiquidityTest.sol/PoolModifyLiquidityTest; do
  name="${artifact##*/}"
  jq '.abi' "out/${artifact}.json" > "${OUT}/${name}.json"
  echo "${OUT}/${name}.json"
done
