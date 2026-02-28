#!/bin/bash
# Reddit Radar Setup Script
# Run once to install the daily fetcher on your Mac

set -e

SCRIPT_NAME="reddit-radar-fetch.py"
PLIST_NAME="com.redditradar.fetch.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
CONFIG_FILE="$HOME/.reddit-radar.conf"

echo ""
echo "🔴 Reddit Radar — Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Find script location ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_NAME"
PLIST_PATH="$SCRIPT_DIR/$PLIST_NAME"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Could not find $SCRIPT_NAME in $SCRIPT_DIR"
    echo "   Make sure both files are in the same folder."
    exit 1
fi

echo "✓ Found script at: $SCRIPT_PATH"

# ── 2. Make script executable ────────────────────────────────────────────────

chmod +x "$SCRIPT_PATH"
echo "✓ Made script executable"

# ── 3. Update plist with real paths ─────────────────────────────────────────

sed -i '' \
    "s|PLACEHOLDER_SCRIPT_PATH|$SCRIPT_PATH|g" \
    "$PLIST_PATH"

sed -i '' \
    "s|PLACEHOLDER_HOME|$HOME|g" \
    "$PLIST_PATH"

echo "✓ Updated plist with your paths"

# ── 4. Ask what time to run ──────────────────────────────────────────────────

echo ""
echo "⏰ What time should it fetch daily? (default: 08:00)"
read -p "   Enter hour (0-23) [8]: " HOUR
HOUR=${HOUR:-8}
read -p "   Enter minute (0-59) [0]: " MINUTE
MINUTE=${MINUTE:-0}

# Update plist with chosen time
sed -i '' "s|<integer>8</integer>|<integer>$HOUR</integer>|g" "$PLIST_PATH"
sed -i '' "s|<integer>0</integer>|<integer>$MINUTE</integer>|g" "$PLIST_PATH"

printf "✓ Scheduled for %02d:%02d daily\n" $HOUR $MINUTE

# ── 5. Supabase credentials ───────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "☁️  Supabase sync (for shared dashboard)"
echo ""
echo "   Get these from your Supabase project dashboard:"
echo "   Project Settings → API"
echo ""
echo "   • Project URL  (e.g. https://abcdefgh.supabase.co)"
echo "   • Service role key  (secret key — NOT the anon key)"
echo ""
read -p "   Supabase Project URL [leave blank to skip]: " SB_URL
SB_URL="${SB_URL%/}"   # strip trailing slash

if [ -n "$SB_URL" ]; then
    read -p "   Supabase Service Role Key: " SB_KEY
fi

if [ -n "$SB_URL" ] && [ -n "$SB_KEY" ]; then
    # Write (or overwrite) the config file
    cat > "$CONFIG_FILE" << EOF
# Reddit Radar config — written by setup.sh
# Keep this file private (it contains your Supabase service key).
SUPABASE_URL=$SB_URL
SUPABASE_SERVICE_KEY=$SB_KEY
EOF
    chmod 600 "$CONFIG_FILE"
    echo "✓ Saved Supabase credentials to $CONFIG_FILE"
else
    echo "   ⚠  Skipped — fetcher will save locally only (no cloud sync)."
    echo "   Re-run setup.sh any time to add credentials."
fi

# ── 6. Install plist ─────────────────────────────────────────────────────────

mkdir -p "$LAUNCH_AGENTS_DIR"
INSTALLED_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

cp "$PLIST_PATH" "$INSTALLED_PLIST"
echo "✓ Installed plist to $INSTALLED_PLIST"

# ── 7. Load it ───────────────────────────────────────────────────────────────

# Unload first if already loaded (ignore errors)
launchctl unload "$INSTALLED_PLIST" 2>/dev/null || true
launchctl load "$INSTALLED_PLIST"

echo "✓ Loaded into launchd"

# ── 8. Run now? ───────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "🚀 Run a test fetch right now? (y/n) [y]: " RUN_NOW
RUN_NOW=${RUN_NOW:-y}

if [[ "$RUN_NOW" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Fetching... (takes ~30 seconds)"
    echo ""
    python3 "$SCRIPT_PATH"
    echo ""
    echo "✅ Done!"
    echo "   Local file: $HOME/reddit-radar-data.json"
    if [ -n "$SB_URL" ]; then
        echo "   Supabase:   data pushed ✓"
    fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
printf "   Daily fetch: %02d:%02d\n" $HOUR $MINUTE
echo "   Data file:   ~/reddit-radar-data.json"
echo "   Fetch log:   ~/reddit-radar-fetch.log"
echo "   Config:      ~/.reddit-radar.conf"
echo ""
echo "   To uninstall:"
echo "   launchctl unload $INSTALLED_PLIST"
echo "   rm $INSTALLED_PLIST"
echo ""
