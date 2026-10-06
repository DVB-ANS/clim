#!/usr/bin/env bash
# On-chain smoke test of a deployed clim suite: quoteFee, optional report through the MockKeystoneForwarder,
# then one tiny swap on V and on S, printing the fee each swap paid (PoolManager Swap event, last field).
# Usage: script/smoke.sh <rpc-url> <deployments.json> [live|replay]
# Env: PRIVATE_KEY (deployer = simOperator). PUSH_REPORT=1 also delivers one 48 %/yr report (use on forks only).
set -euo pipefail
RPC="$1"; DEP="$2"; SUITE="${3:-live}"
HOOK=$(jq -r ".hooks.${SUITE}" "$DEP"); DESK=$(jq -r ".riskDesks.${SUITE}" "$DEP")
PM=$(jq -r .uniswap.poolManager "$DEP"); ROUTER=$(jq -r .uniswap.poolSwapTest "$DEP"); MOCK=$(jq -r .cre.mockForwarder "$DEP")
C0=$(jq -r ".pools.${SUITE}V.key.currency0" "$DEP"); C1=$(jq -r ".pools.${SUITE}V.key.currency1" "$DEP")
SFEE=$(jq -r ".pools.${SUITE}S.key.fee" "$DEP")
SWAP_TOPIC=$(cast sig-event "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")

echo "quoteFee before: $(cast call "$HOOK" 'quoteFee()(uint24,uint8)' --rpc-url "$RPC" | tr '\n' ' ')"
if [ "${PUSH_REPORT:-0}" = "1" ]; then
  NOW=$(cast block latest --field timestamp --rpc-url "$RPC")
  REPORT=$(cast abi-encode -- "f(uint40,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8)" "$NOW" 85475 85475 4800 -79060 3 4 10000 0)
  RAW=$(cast concat-hex "0x01$(printf '%0216d' 0)" "$REPORT")
  cast send "$MOCK" "report(address,bytes,bytes,bytes[])" "$DESK" "$RAW" 0x "[]" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" >/dev/null
  echo "desk state: $(cast call "$DESK" 'state()(uint40,uint32,uint16,uint8,uint32)' --rpc-url "$RPC" | tr '\n' ' ')"
  echo "quoteFee after report: $(cast call "$HOOK" 'quoteFee()(uint24,uint8)' --rpc-url "$RPC" | tr '\n' ' ')"
fi
for T in "$C0" "$C1"; do
  cast send "$T" "approve(address,uint256)" "$ROUTER" "$(cast max-uint)" --private-key "$PRIVATE_KEY" --rpc-url "$RPC" >/dev/null
done
swap_fee() {
  cast send "$ROUTER" "swap((address,address,uint24,int24,address),(bool,int256,uint160),(bool,bool),bytes)" \
    "$1" "(true,-10000000000000000,4295128740)" "(false,false)" 0x \
    --private-key "$PRIVATE_KEY" --rpc-url "$RPC" --json |
    jq -r --arg pm "$(echo "$PM" | tr 'A-F' 'a-f')" --arg t "$SWAP_TOPIC" \
      '.logs[] | select((.address | ascii_downcase) == $pm and .topics[0] == $t) | .data' |
    python3 -c "import sys; print(int(sys.stdin.read().strip()[-64:], 16))"
}
echo "V swap fee (pips): $(swap_fee "($C0,$C1,8388608,60,$HOOK)")"
echo "S swap fee (pips): $(swap_fee "($C0,$C1,$SFEE,60,0x0000000000000000000000000000000000000000)")"
