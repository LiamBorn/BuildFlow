#!/bin/bash
# Puts Sparkle into a built BuildFlow.app and signs the whole bundle, inside out.
#
#   mac/scripts/embed-sparkle.sh mac/build/BuildFlow.app       # build-app.sh runs this last
#
# 1. Copies mac/Vendor/Sparkle/Sparkle.framework to Contents/Frameworks, without what BuildFlow
#    doesn't use there: the XPC services (only a sandboxed app needs them; Sparkle's sandboxing guide
#    says an app that doesn't enable them may remove them when copying the framework in) and the
#    headers and module map (compile-time only, which Xcode's embed phase strips too). Sparkle's
#    licence goes in as Contents/Resources/Sparkle-LICENSE, because it has to ship with it.
# 2. Makes sure the app binary looks for frameworks in Contents/Frameworks (the @rpath compile.sh
#    links with; added here if it is missing) and really links Sparkle through it.
# 3. Signs from the inside out: Sparkle's helpers (Autoupdate, Updater.app), then the framework,
#    then the app, with mac/Resources/BuildFlow.entitlements.
#      DEVELOPER_ID="Developer ID Application: Name (TEAMID)"  hardened runtime + secure timestamp,
#                                                             ready to notarize
#      unset                                                  ad hoc (`-`), as today: runs on this
#                                                             Mac; other Macs warn on first open
# 4. Checks the result with `codesign --verify --deep --strict`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(cd "${1:?usage: embed-sparkle.sh <BuildFlow.app>}" && pwd)"
SPARKLE="$ROOT/Vendor/Sparkle"
FRAMEWORKS="$APP/Contents/Frameworks"
FW="$FRAMEWORKS/Sparkle.framework"
EXE="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
RPATH="@executable_path/../Frameworks"

# 1. The framework.
rm -rf "$FW"
mkdir -p "$FRAMEWORKS"
ditto "$SPARKLE/Sparkle.framework" "$FW"
for part in XPCServices Headers PrivateHeaders Modules; do
    rm -rf "${FW:?}/$part" "${FW:?}/Versions/B/$part"
done
cp "$SPARKLE/LICENSE" "$APP/Contents/Resources/Sparkle-LICENSE"

# 2. The runpath.
if ! otool -l "$EXE" | grep -A2 LC_RPATH | grep -q "path $RPATH "; then
    install_name_tool -add_rpath "$RPATH" "$EXE"
fi
if ! otool -L "$EXE" | grep -q "@rpath/Sparkle.framework/Versions/B/Sparkle"; then
    echo "embed-sparkle: $EXE does not link Sparkle (check the -framework Sparkle flags in compile.sh)" >&2
    exit 1
fi

# 3. Signing, innermost first: a bundle's seal covers what is inside it, so anything signed after its
#    container would break the container's signature.
if [ -n "${DEVELOPER_ID:-}" ]; then
    SIGN=(--force --sign "$DEVELOPER_ID" --timestamp --options runtime)
    APP_SIGN=("${SIGN[@]}")
    WHO="$DEVELOPER_ID"
else
    # Sparkle's own pieces keep the hardened runtime they were released with; the ad hoc app keeps
    # none, as build-app.sh has always signed it.
    SIGN=(--force --sign - --timestamp=none --options runtime)
    APP_SIGN=(--force --sign - --timestamp=none)
    WHO="ad hoc"
fi
codesign "${SIGN[@]}" "$FW/Versions/B/Autoupdate"
codesign "${SIGN[@]}" "$FW/Versions/B/Updater.app"
codesign "${SIGN[@]}" "$FW"
codesign "${APP_SIGN[@]}" --entitlements "$ROOT/Resources/BuildFlow.entitlements" "$APP"

# 4. The check.
codesign --verify --deep --strict "$APP"
echo "Embedded Sparkle $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$FW/Resources/Info.plist") and signed $APP ($WHO)"
