import { LiquidityBoard } from "@/components/LiquidityBoard";

export default function LpPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Liquidity: be the LP the storm insurance protects</h1>
        <p className="text-sm text-fg-muted">
          Get test tokens, add full-range liquidity to pool V (clim fee) or pool S (fixed fee), and follow your position: its
          value, the fees it earned, and what the same liquidity would have made in the other pool.
        </p>
      </div>
      <LiquidityBoard />
    </div>
  );
}
