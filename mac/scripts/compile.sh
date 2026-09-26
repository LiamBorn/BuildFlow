#!/bin/bash
# Compiles one product of mac/Package.swift with swiftc directly.
#
#   scripts/compile.sh BuildFlowNotch        [release|debug]   # the app binary
#   scripts/compile.sh BuildFlowNotchChecks  [release|debug]   # the logic checks
#
# Why not `swift build`: SwiftPM 5.8 from the Command Line Tools (no Xcode) stops
# before compiling anything on this Mac, because it asks
# `xcrun --sdk macosx --show-sdk-platform-path`, which only an Xcode install
# answers. swiftc itself works, so this script builds the same three targets from
# the same folders: BuildFlowNotchKit as a static library, then the executable.
# On a Mac where SwiftPM works, `swift build` / `swift run BuildFlowNotchChecks`
# build the same thing from Package.swift.
set -euo pipefail

PRODUCT="${1:?usage: compile.sh BuildFlowNotch|BuildFlowNotchChecks [release|debug]}"
CONFIG="${2:-release}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.build/swiftc/$CONFIG"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
TARGET="$(uname -m)-apple-macos13.0"
mkdir -p "$OUT"

if [ "$CONFIG" = release ]; then OPT=(-O -wmo); else OPT=(-Onone -g); fi
COMMON=(-target "$TARGET" -sdk "$SDK" "${OPT[@]}")

sources() { find "$ROOT/Sources/$1" -name '*.swift' | sort; }

# The logic library.
KIT_SOURCES=()
while IFS= read -r f; do KIT_SOURCES+=("$f"); done < <(sources BuildFlowNotchKit)
swiftc "${COMMON[@]}" -parse-as-library -module-name BuildFlowNotchKit \
    -emit-library -static -o "$OUT/libBuildFlowNotchKit.a" \
    -emit-module -emit-module-path "$OUT/BuildFlowNotchKit.swiftmodule" \
    "${KIT_SOURCES[@]}"

# The executable.
APP_SOURCES=()
while IFS= read -r f; do APP_SOURCES+=("$f"); done < <(sources "$PRODUCT")
EXTRA=()
# The app uses @main; the checks use top-level code in main.swift.
[ "$PRODUCT" = BuildFlowNotch ] && EXTRA+=(-parse-as-library)
swiftc "${COMMON[@]}" ${EXTRA[@]+"${EXTRA[@]}"} -module-name "$PRODUCT" \
    -I "$OUT" -L "$OUT" -lBuildFlowNotchKit \
    -o "$OUT/$PRODUCT" "${APP_SOURCES[@]}"

echo "$OUT/$PRODUCT"
