#!/bin/bash
# Makes a release of BuildFlow for Mac and puts it where the BuildFlow server serves it
# (server/downloads/mac/ → https://build-flow.replit.app/downloads/mac/).
#
#   mac/scripts/release.sh <version> <build>          e.g. mac/scripts/release.sh 0.1.0 1
#   DRY_RUN=1 mac/scripts/release.sh 0.1.0 1          everything, into a temp folder; the repo is untouched
#
# In order:
#   1. refuses to run if mac/ (or, for a real release, server/downloads/mac/) has uncommitted changes;
#   2. sets CFBundleShortVersionString = <version> and CFBundleVersion = <build> in Info.plist;
#   3. builds a universal app: build-app.sh for this Mac's architecture, compile.sh for the other,
#      joined with lipo;
#   4. signs it inside out (embed-sparkle.sh): with DEVELOPER_ID if set, otherwise ad hoc;
#   5. notarizes and staples the app, only if NOTARY_PROFILE is set;
#   6. makes BuildFlow-<version>.dmg (make-dmg.sh), and notarizes and staples that too with NOTARY_PROFILE;
#   7. signs the DMG for Sparkle with sign_update and the EdDSA key in the login Keychain, then checks
#      the signature twice: sign_update --verify (the Keychain's key) and verify-update-signature.swift
#      (the SUPublicEDKey inside the built app, which is what every installed copy will check);
#   8. writes appcast.xml and latest.json (write-appcast.mjs) and keeps the newest KEEP disk images.
#
# It never exports or prints the private key: sign_update reads it from the Keychain and prints only
# the signature and the length.
#
# Environment:
#   DEVELOPER_ID     "Developer ID Application: Your Name (TEAMID)". Unset: signed ad hoc, and every
#                    Mac but this one warns on first open.
#   NOTARY_PROFILE   a notarytool Keychain profile, made once with `xcrun notarytool store-credentials`.
#                    Needs DEVELOPER_ID. Unset: notarization is skipped (and says so).
#   DRY_RUN=1        builds into OUT_DIR (a new temp folder unless set) and puts Info.plist back after.
#   OUT_DIR          where the DMG, appcast.xml and latest.json go. Default: server/downloads/mac.
#   BASE_URL         the public URL of OUT_DIR. Default: https://build-flow.replit.app/downloads/mac.
#   NOTES            the release notes, Markdown. Default: mac/ReleaseNotes/<version>.md.
#   KEEP             how many disk images stay in OUT_DIR, newest first. Default: 2.
#   ARCHS            architectures to build. Default: "arm64 x86_64".
#   SPARKLE_ACCOUNT  the Keychain account of the EdDSA key. Default: buildflow-mac.
set -euo pipefail

MAC="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$MAC/.." && pwd)"
SERVED="$REPO/server/downloads/mac"
SPARKLE_BIN="$MAC/Vendor/Sparkle/bin"
PLIST="$MAC/Resources/Info.plist"
APP="$MAC/build/BuildFlow.app"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { echo "release: $*" >&2; exit 1; }

VERSION="${1:-}"
BUILD="${2:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: release.sh <version, e.g. 0.2.0> <build, e.g. 2>"
[[ "$BUILD" =~ ^[1-9][0-9]*$ ]] || die "the build number must be a whole number above 0 (it is what Sparkle compares)"
DRY_RUN="${DRY_RUN:-}"
KEEP="${KEEP:-2}"
ARCHS="${ARCHS:-arm64 x86_64}"
SPARKLE_ACCOUNT="${SPARKLE_ACCOUNT:-buildflow-mac}"
BASE_URL="${BASE_URL:-https://build-flow.replit.app/downloads/mac}"
NOTES="${NOTES:-$MAC/ReleaseNotes/$VERSION.md}"
HOST_ARCH="$(uname -m)"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/buildflow-release.XXXXXX")"
cleanup() {
    if [ -n "$DRY_RUN" ] && [ -f "$WORK/Info.plist.orig" ]; then cp "$WORK/Info.plist.orig" "$PLIST"; fi
    rm -rf "$WORK"
}
trap cleanup EXIT

# ── 1. Preconditions ───────────────────────────────────────────────────────────
say "1/8  Checking the tree"
CHECK=(mac)
[ -z "$DRY_RUN" ] && CHECK+=(server/downloads/mac)
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=all -- "${CHECK[@]}")" ]; then
    git -C "$REPO" status --short --untracked-files=all -- "${CHECK[@]}" >&2
    die "commit or stash the changes above first, so the release is built from what is committed"
fi
[ -n "${NOTARY_PROFILE:-}" ] && [ -z "${DEVELOPER_ID:-}" ] && die "NOTARY_PROFILE needs DEVELOPER_ID: Apple notarizes only Developer ID-signed apps"
for arch in $ARCHS; do [[ "$arch" =~ ^(arm64|x86_64)$ ]] || die "unknown architecture $arch in ARCHS"; done
[[ " $ARCHS " == *" $HOST_ARCH "* ]] || die "ARCHS must include this Mac's architecture ($HOST_ARCH)"
command -v node > /dev/null || die "node is needed to write the appcast"
[ -x "$SPARKLE_BIN/sign_update" ] || die "$SPARKLE_BIN/sign_update is missing"
if [ ! -f "$NOTES" ]; then
    [ -n "$DRY_RUN" ] || die "write the release notes first: $NOTES (Markdown; shown in the update window)"
    NOTES="$WORK/notes.md"
    printf 'A dry run of BuildFlow for Mac %s.\n' "$VERSION" > "$NOTES"
fi
if [ -n "$DRY_RUN" ]; then
    OUT_DIR="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/buildflow-dry-run.XXXXXX")}"
else
    OUT_DIR="${OUT_DIR:-$SERVED}"
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
DMG_NAME="BuildFlow-$VERSION.dmg"
[ -e "$OUT_DIR/$DMG_NAME" ] && die "$OUT_DIR/$DMG_NAME already exists; a released version is never replaced, so pick a new version"
if [ -f "$OUT_DIR/appcast.xml" ]; then
    NEWEST="$( (grep -oE '<sparkle:version>[0-9]+</sparkle:version>' "$OUT_DIR/appcast.xml" || true) | grep -oE '[0-9]+' | sort -n | tail -1)"
    [ -z "$NEWEST" ] || [ "$BUILD" -gt "$NEWEST" ] || die "build $BUILD is not above build $NEWEST in the current appcast; Sparkle would never offer it"
fi
echo "BuildFlow $VERSION ($BUILD) → $OUT_DIR${DRY_RUN:+ (dry run)}"

# ── 2. Versions ────────────────────────────────────────────────────────────────
say "2/8  Setting the version in Info.plist"
[ -n "$DRY_RUN" ] && cp "$PLIST" "$WORK/Info.plist.orig"
# A text edit, not PlistBuddy: PlistBuddy rewrites the whole file and drops its comments.
set_string() {
    KEY="$1" VALUE="$2" perl -0pi -e 's{(<key>\Q$ENV{KEY}\E</key>\s*<string>)[^<]*(</string>)}{$1$ENV{VALUE}$2}' "$PLIST"
    [ "$(/usr/libexec/PlistBuddy -c "Print :$1" "$PLIST")" = "$2" ] || die "could not set $1 in $PLIST"
}
set_string CFBundleShortVersionString "$VERSION"
set_string CFBundleVersion "$BUILD"
plutil -lint "$PLIST" > /dev/null
echo "CFBundleShortVersionString $VERSION, CFBundleVersion $BUILD"

# ── 3 + 4. Build and sign ──────────────────────────────────────────────────────
say "3/8  Building ($ARCHS)"
CONFIG=release "$MAC/scripts/build-app.sh"
SLICES=()
for arch in $ARCHS; do
    [ "$arch" = "$HOST_ARCH" ] && continue
    BIN="$(BUILDFLOW_ARCH="$arch" "$MAC/scripts/compile.sh" BuildFlowNotch release | tail -1)"
    cp "$BIN" "$WORK/BuildFlow-$arch"
    SLICES+=("$WORK/BuildFlow-$arch")
done
say "4/8  Signing (${DEVELOPER_ID:-ad hoc})"
if [ ${#SLICES[@]} -gt 0 ]; then
    lipo -create "$APP/Contents/MacOS/BuildFlow" "${SLICES[@]}" -output "$WORK/BuildFlow-universal"
    cp "$WORK/BuildFlow-universal" "$APP/Contents/MacOS/BuildFlow"
fi
# Signs again with the finished binary in place (and is the whole signing step for a one-arch build).
"$MAC/scripts/embed-sparkle.sh" "$APP"
BUILT_ARCHS="$(lipo -archs "$APP/Contents/MacOS/BuildFlow")"
for arch in $ARCHS; do [[ " $BUILT_ARCHS " == *" $arch "* ]] || die "the app is missing its $arch slice"; done
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")" = "$BUILD" ] || die "the built app has the wrong CFBundleVersion"
HARDWARE=""
[[ " $BUILT_ARCHS " == *" x86_64 "* ]] || HARDWARE="arm64" # an Apple silicon-only build must not be offered to Intel Macs
echo "architectures: $BUILT_ARCHS"

# ── 5. Notarize the app ────────────────────────────────────────────────────────
notarize() {
    local file="$1" result="$WORK/notary-$(basename "$1").json" status id
    xcrun notarytool submit "$file" --keychain-profile "$NOTARY_PROFILE" --wait --output-format json > "$result"
    status="$(plutil -extract status raw -o - "$result")"
    id="$(plutil -extract id raw -o - "$result")"
    if [ "$status" != "Accepted" ]; then
        xcrun notarytool log "$id" --keychain-profile "$NOTARY_PROFILE" >&2 || true
        die "notarization of $(basename "$file") came back $status (submission $id)"
    fi
    echo "notarized $(basename "$file") (submission $id)"
}
say "5/8  Notarizing the app"
if [ -n "${NOTARY_PROFILE:-}" ]; then
    ditto -c -k --keepParent "$APP" "$WORK/BuildFlow.zip"
    notarize "$WORK/BuildFlow.zip"
    xcrun stapler staple "$APP"
    xcrun stapler validate "$APP"
    spctl --assess --type execute --verbose=2 "$APP"
else
    echo "skipped: NOTARY_PROFILE is not set. Until the app is signed with a Developer ID and notarized,"
    echo "macOS warns the first time someone opens it (right-click → Open gets past it)."
fi

# ── 6. The disk image ──────────────────────────────────────────────────────────
say "6/8  Making $DMG_NAME"
DMG="$("$MAC/scripts/make-dmg.sh" "$APP" "$WORK" | tail -1)"
if [ -n "${NOTARY_PROFILE:-}" ]; then
    notarize "$DMG"
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG"
    spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
fi
echo "$(stat -f %z "$DMG") bytes"

# ── 7. Sparkle's signature ─────────────────────────────────────────────────────
say "7/8  Signing the update (EdDSA, Keychain account $SPARKLE_ACCOUNT)"
SIGNED="$("$SPARKLE_BIN/sign_update" --account "$SPARKLE_ACCOUNT" "$DMG")"
SIGNATURE="$(sed -nE 's/.*sparkle:edSignature="([^"]+)".*/\1/p' <<< "$SIGNED")"
LENGTH="$(sed -nE 's/.*length="([0-9]+)".*/\1/p' <<< "$SIGNED")"
[ -n "$SIGNATURE" ] || die "sign_update printed no signature"
[ "$LENGTH" = "$(stat -f %z "$DMG")" ] || die "sign_update's length ($LENGTH) is not the DMG's size"
"$SPARKLE_BIN/sign_update" --account "$SPARKLE_ACCOUNT" --verify "$DMG" "$SIGNATURE"
echo "sign_update --verify: the signature matches the Keychain's key"
swiftc -O -target "$HOST_ARCH-apple-macos13.0" -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
    "$MAC/scripts/verify-update-signature.swift" -o "$WORK/verify-update-signature"
"$WORK/verify-update-signature" "$DMG" "$SIGNATURE" \
    "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$APP/Contents/Info.plist")"

# ── 8. Publish into the served folder ─────────────────────────────────────────
say "8/8  Writing the appcast"
cp "$DMG" "$OUT_DIR/$DMG_NAME"
if ! node "$MAC/scripts/write-appcast.mjs" --dir "$OUT_DIR" --version "$VERSION" --build "$BUILD" \
    --file "$DMG_NAME" --length "$LENGTH" --signature "$SIGNATURE" --notes "$NOTES" \
    --base-url "$BASE_URL" --keep "$KEEP" ${HARDWARE:+--hardware "$HARDWARE"}; then
    rm -f "$OUT_DIR/$DMG_NAME"
    die "could not write the appcast; nothing was published"
fi
xmllint --noout "$OUT_DIR/appcast.xml"

say "Done: BuildFlow $VERSION ($BUILD)"
ls -l "$OUT_DIR"
if [ -n "$DRY_RUN" ]; then
    echo "Dry run: $OUT_DIR holds the release; Info.plist is back as it was."
else
    REL_OUT="${OUT_DIR#"$REPO"/}"
    cat << EOF
Next, publish it:
  git add mac/Resources/Info.plist "$REL_OUT"
  git commit -m "BuildFlow for Mac $VERSION"
  git push
Then in Replit: Pull, then Republish. The feed is live once
  curl -sI $BASE_URL/$DMG_NAME
answers 200.
EOF
fi
