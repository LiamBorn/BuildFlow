#!/bin/bash
# Builds and runs the logic checks (the stand-in for XCTest, which the Command
# Line Tools don't include). Exits non-zero if any check fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$("$ROOT/scripts/compile.sh" BuildFlowNotchChecks debug | tail -1)"
"$BIN"
