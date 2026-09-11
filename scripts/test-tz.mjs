// The schedule suites under two far-apart clocks: a date must land on the same calendar day
// in Kiritimati (UTC+14) as in Pago Pago (UTC-11). Node reads TZ at start-up, so each run is
// its own process.
import { spawnSync } from "node:child_process";

const zones = ["Pacific/Kiritimati", "Pacific/Pago_Pago"];
const suites = [
  ["client", ["run", "src/schedule"]],
  [
    "server",
    [
      "run",
      "test/digest.test.ts",
      "test/api.test.ts",
      "test/transaction.test.ts",
      "test/booking-rules.test.ts",
      "test/variance.test.ts",
      // DelayIQ decides "overdue" from today, one day at a time, so it belongs under both clocks
      "src/delayiq.test.ts",
      "test/delayiq-api.test.ts"
    ]
  ]
];

for (const zone of zones) {
  for (const [workspace, args] of suites) {
    console.log(`\n== ${workspace} under TZ=${zone} ==`);
    const result = spawnSync("npm", ["--workspace", workspace, "exec", "--", "vitest", ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, TZ: zone }
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
