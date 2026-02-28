#!/usr/bin/env python3
"""
Reddit Radar Fetcher
Fetches top posts from your subreddits, saves to ~/reddit-radar-data.json,
and upserts to Supabase so the shared dashboard auto-updates.
Run manually or via launchd for daily auto-fetch.
"""

import urllib.request
import urllib.error
import json
import os
import time
import sys
from datetime import datetime

# ── Config file (written by setup.sh) ────────────────────────────────────────

CONFIG_FILE = os.path.expanduser("~/.reddit-radar.conf")

def load_config():
    """Load SUPABASE_URL and SUPABASE_SERVICE_KEY from ~/.reddit-radar.conf"""
    if not os.path.exists(CONFIG_FILE):
        return
    with open(CONFIG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                # Don't overwrite if already set in the environment
                os.environ.setdefault(key, val)

load_config()

# ── Supabase credentials (set via config file or environment) ─────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ── Reddit config ─────────────────────────────────────────────────────────────

SUBREDDITS = [
    "AskEconomics", "China", "Economics", "EndlessWar",
    "UnderReportedNews", "business", "dataisbeautiful",
    "economy", "europe", "europeanunion", "explainlikeimfive",
    "geography", "geopolitics", "internationalpolitics",
    "nato", "news", "politics", "ukpolitics",
    "unitedkingdom", "worldnews",
]

TIME_FILTER = "day"    # hour / day / week / month / year / all
POST_LIMIT  = 100      # max 100 per request

OUTPUT_FILE = os.path.expanduser("~/reddit-radar-data.json")
LOG_FILE    = os.path.expanduser("~/reddit-radar-fetch.log")

HEADERS = {
    "User-Agent": "RedditRadar/1.0 (personal dashboard; contact via reddit)"
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def fetch_url(url, retries=3, delay=2):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = delay * (attempt + 1) * 3
                log(f"  Rate limited. Waiting {wait}s...")
                time.sleep(wait)
            else:
                log(f"  HTTP {e.code} on {url}")
                return None
        except Exception as e:
            log(f"  Error: {e} (attempt {attempt+1}/{retries})")
            time.sleep(delay)
    return None

def upsert_to_supabase(data):
    """Upsert the full payload as a single row (id=1) in the reddit_data table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("  ⚠  Supabase not configured — skipping cloud sync.")
        log("     Run setup.sh and enter your Supabase URL and service key to enable.")
        return

    url = f"{SUPABASE_URL}/rest/v1/reddit_data"
    body = json.dumps({"id": 1, "payload": data}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "apikey":        SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            log(f"  ✓ Supabase upsert OK (HTTP {resp.status})")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        log(f"  ✗ Supabase upsert failed: HTTP {e.code} — {body_text[:200]}")
    except Exception as e:
        log(f"  ✗ Supabase upsert failed: {e}")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log("=" * 50)
    log("Reddit Radar fetch starting")
    log(f"Subreddits: {len(SUBREDDITS)}  |  Period: {TIME_FILTER}  |  Limit: {POST_LIMIT}")

    all_posts = []
    failed    = []

    for i, sub in enumerate(SUBREDDITS):
        url = f"https://www.reddit.com/r/{sub}/top.json?limit={POST_LIMIT}&t={TIME_FILTER}"
        log(f"  [{i+1}/{len(SUBREDDITS)}] Fetching r/{sub}...")

        data = fetch_url(url)

        if data and "data" in data:
            posts = data["data"]["children"]
            for post in posts:
                p = post["data"]
                all_posts.append({
                    "id":           p.get("id", ""),
                    "title":        p.get("title", ""),
                    "selftext":     p.get("selftext", ""),
                    "url":          p.get("url", ""),
                    "permalink":    "https://reddit.com" + p.get("permalink", ""),
                    "subreddit":    p.get("subreddit", sub),
                    "score":        p.get("score", 0),
                    "num_comments": p.get("num_comments", 0),
                    "created_utc":  p.get("created_utc", 0),
                    "author":       p.get("author", ""),
                    "is_self":      p.get("is_self", False),
                })
            log(f"    ✓ {len(posts)} posts")
        else:
            log(f"    ✗ Failed to fetch r/{sub}")
            failed.append(sub)

        # Be polite to Reddit — 1 req/sec
        if i < len(SUBREDDITS) - 1:
            time.sleep(1.1)

    # Build output payload
    output = {
        "fetched_at":  datetime.now().isoformat(),
        "time_filter": TIME_FILTER,
        "post_count":  len(all_posts),
        "subreddits":  SUBREDDITS,
        "failed":      failed,
        "posts":       all_posts,
    }

    # 1. Save local JSON (existing behaviour — unchanged)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f)
    log(f"✓ Saved {len(all_posts)} posts to {OUTPUT_FILE}")

    # 2. Push to Supabase (new)
    log("Syncing to Supabase...")
    upsert_to_supabase(output)

    if failed:
        log(f"Failed subreddits: {', '.join(failed)}")
    log("=" * 50)

if __name__ == "__main__":
    main()
