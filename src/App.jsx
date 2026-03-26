import { useState, useEffect, useRef } from "react";

// ââ Supabase config (set via Vite env vars) âââââââââââââââââââââââââââââââââ
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const CHANNELS = {
  labour: {
    label: "American Labour",
    short: "Labour",
    color: "#FF6B35",
    keywords: ["worker", "workers", "workforce", "labor", "labour", "employment", "unemployment", "wage", "wages", "salary", "salaries", "union", "unions", "strike", "strikes", "job", "jobs", "layoff", "layoffs", "hiring", "fired", "gig economy", "automation", "minimum wage", "remote work", "work from home", "pension", "benefits", "manufacturing", "white collar", "blue collar", "AI jobs", "robots replacing", "working class", "labor market", "job market", "cost of living", "income", "pay gap", "executive pay"],
  },
  myths: {
    label: "Finance Myths",
    short: "Myths",
    color: "#A855F7",
    keywords: ["myth", "misconception", "debunk", "debunked", "wrong about", "actually", "contrary", "surprisingly", "narrative", "conventional wisdom", "orthodox", "heterodox", "challenge", "rethink", "what economists", "popular belief", "everyone thinks", "not what you think", "truth about", "lie", "misleading", "false", "misunderstood", "overrated", "underrated", "broken", "fails", "doesn't work", "bad economics", "flawed", "assumption", "why your", "the real reason", "what really"],
  },
  nations: {
    label: "Nation-Based Analysis",
    short: "Nations",
    color: "#00D4FF",
    keywords: ["china", "india", "germany", "japan", "france", "brazil", "russia", "turkey", "argentina", "mexico", "south korea", "indonesia", "saudi arabia", "iran", "nigeria", "egypt", "pakistan", "vietnam", "uk economy", "british economy", "american economy", "us economy", "chinese economy", "indian economy", "economic rise", "economic decline", "economic stagnation", "emerging market", "developed economy", "gdp growth", "economic model", "economic miracle", "economic crisis", "country's economy", "national economy"],
  },
  geo: {
    label: "Geopolitical Developments",
    short: "Geo",
    color: "#F43F5E",
    keywords: ["war", "conflict", "sanctions", "trade war", "tariff", "tariffs", "nato", "ukraine", "taiwan", "israel", "iran", "russia", "military", "alliance", "treaty", "embargo", "supply chain", "reshoring", "decoupling", "de-dollarization", "petrodollar", "belt and road", "hegemony", "geopolitics", "geopolitical", "diplomacy", "diplomatic", "foreign policy", "global order", "world order", "power shift", "proxy war", "coup", "regime change", "oil price", "energy security", "strategic"],
  },
  macro: {
    label: "Macro & Debt Economy",
    short: "Macro",
    color: "#22C55E",
    keywords: ["debt", "deficit", "inflation", "deflation", "interest rate", "interest rates", "federal reserve", "fed", "central bank", "quantitative easing", "monetary policy", "fiscal policy", "recession", "depression", "bubble", "crash", "bond market", "yield curve", "sovereign debt", "national debt", "money supply", "stagflation", "structural", "demographic", "aging population", "pension crisis", "credit", "borrowing", "austerity", "stimulus", "bail out", "bailout", "too big to fail", "financial system", "banking crisis", "currency crisis", "long-term", "slow-moving"],
  },
};

const DEFAULT_SUBREDDITS = [
  { name: "dataisbeautiful", channels: ["labour", "myths", "nations", "geo", "macro"] },
  { name: "explainlikeimfive", channels: ["labour", "myths", "nations", "geo", "macro"] },
  { name: "geopolitics", channels: ["geo", "nations"] },
  { name: "news", channels: ["labour", "myths", "nations", "geo", "macro"] },
  { name: "unitedkingdom", channels: ["nations", "macro"] },
  { name: "business", channels: ["myths", "macro", "labour"] },
  { name: "worldnews", channels: ["geo", "nations"] },
  { name: "geography", channels: ["nations"] },
  { name: "europe", channels: ["nations", "geo", "macro"] },
  { name: "economics", channels: ["myths", "macro", "nations"] },
  { name: "AskEconomics", channels: ["myths", "macro"] },
  { name: "underreportednews", channels: ["labour", "myths", "nations", "geo", "macro"] },
  { name: "economy", channels: ["macro", "labour"] },
  { name: "nato", channels: ["geo"] },
  { name: "EndlessWar", channels: ["geo"] },
  { name: "europeanunion", channels: ["nations", "geo", "macro"] },
  { name: "China", channels: ["nations", "geo", "macro"] },
  { name: "energy", channels: ["geo", "macro", "nations"] },
  { name: "neoliberal", channels: ["myths", "macro"] },
  { name: "finance", channels: ["myths", "macro", "labour"] },
  { name: "artificialintelligence", channels: ["labour", "macro"] },
];

function scorePost(title, text = "") {
  const content = (title + " " + text).toLowerCase();
  const scores = {};
  for (const [key, channel] of Object.entries(CHANNELS)) {
    const hits = channel.keywords.filter(kw => content.includes(kw)).length;
    scores[key] = Math.min(10, Math.round((hits / 3) * 10));
  }
  return scores;
}

function extractChildren(data) {
  if (data.posts && Array.isArray(data.posts)) {
    return data.posts.map(p => ({ ...p, _isFetcher: true, _fetchedAt: data.fetched_at }));
  }
  if (Array.isArray(data)) {
    return data.flatMap(listing => listing?.data?.children?.map(c => c.data) || []);
  }
  if (data?.data?.children) {
    return data.data.children.map(c => c.data);
  }
  return [];
}

function parsePosts(data) {
  const items = extractChildren(data);
  const fetchedAt = data.fetched_at || null;
  return items.map(p => ({
    id: p.id || Math.random().toString(36),
    title: p.title || "",
    subreddit: p.subreddit || "unknown",
    ups: p.score ?? p.ups ?? 0,
    url: p.permalink
      ? (p.permalink.startsWith("http") ? p.permalink : "https://reddit.com" + p.permalink)
      : (p.url || ""),
    created: p.created_utc ? new Date(p.created_utc * 1000).toLocaleDateString() : "?",
    created_utc: p.created_utc || 0,
    scores: scorePost(p.title || "", p.selftext || ""),
    _fetchedAt: fetchedAt,
  }));
}

// ââ Fetch latest data from Supabase âââââââââââââââââââââââââââââââââââââââââ
async function fetchFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars not set (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reddit_data?select=payload&order=id.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length) throw new Error("No data in Supabase yet â run the fetcher first.");
  return rows[0].payload;
}

function ScoreBadge({ score, color }) {
  const opacity = score === 0 ? 0.2 : 0.4 + (score / 10) * 0.6;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "4px",
      background: `${color}${Math.round(opacity * 40).toString(16).padStart(2, "0")}`,
      border: `1px solid ${color}${Math.round(opacity * 80).toString(16).padStart(2, "0")}`,
      color: score === 0 ? "#555" : color,
      fontSize: "11px", fontWeight: "700", fontFamily: "monospace",
      minWidth: "32px", justifyContent: "center",
    }}>
      {score}
    </div>
  );
}

function PostCard({ post, index }) {
  const [expanded, setExpanded] = useState(false);
  const topChannel = Object.entries(post.scores).sort((a, b) => b[1] - a[1])[0];
  const topScore = topChannel[1];

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "8px", padding: "14px 16px",
        cursor: "pointer", transition: "all 0.15s ease",
        animation: `fadeSlideIn 0.3s ease ${Math.min(index, 20) * 0.04}s both`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
    >
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <div style={{
          minWidth: "36px", height: "36px", borderRadius: "6px",
          background: topScore > 5 ? `${CHANNELS[topChannel[0]].color}22` : "rgba(255,255,255,0.05)",
          border: `1px solid ${topScore > 5 ? CHANNELS[topChannel[0]].color + "44" : "rgba(255,255,255,0.1)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: "800", color: topScore > 5 ? CHANNELS[topChannel[0]].color : "#666",
          fontFamily: "monospace",
        }}>
          {topScore}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "5px", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "11px", color: "#888",
              background: "rgba(255,255,255,0.05)", padding: "2px 7px",
              borderRadius: "3px", fontFamily: "monospace",
            }}>r/{post.subreddit}</span>
            <span style={{ fontSize: "11px", color: "#555" }}>â{post.ups?.toLocaleString() || "?"}</span>
            <span style={{ fontSize: "11px", color: "#444" }}>{post.created}</span>
          </div>
          <div style={{
            fontSize: "13px", color: "#ddd", lineHeight: "1.4",
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: expanded ? "unset" : 2,
            WebkitBoxOrient: "vertical",
          }}>
            {post.title}
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
            {Object.entries(CHANNELS).map(([key, ch]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "#555" }}>{ch.short}</span>
                <ScoreBadge score={post.scores[key]} color={ch.color} />
              </div>
            ))}
            {post.url && (
              <a
                href={post.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ marginLeft: "auto", fontSize: "11px", color: "#00D4FF", textDecoration: "none", opacity: 0.7 }}
              >â Reddit</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "80px 20px", gap: "20px",
    }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "50%",
        border: "3px solid rgba(0,212,255,0.15)",
        borderTopColor: "#00D4FF",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: "13px", color: "#555" }}>Loading latest posts from Supabaseâ¦</div>
    </div>
  );
}

export default function App() {
  const [posts, setPosts] = useState([]);
  const [subreddits, setSubreddits] = useState(DEFAULT_SUBREDDITS);
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterSub, setFilterSub] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [newSub, setNewSub] = useState("");
  const [fetchLog, setFetchLog] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [lastFetched, setLastFetched] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const fileRef = useRef(null);
  const jsonRef = useRef(null);

  // Auto-fetch from Supabase on mount
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchFromSupabase()
      .then(data => {
        const newPosts = parsePosts(data);
        setPosts(newPosts);
        if (data.fetched_at) setLastFetched(data.fetched_at);
      })
      .catch(err => {
        setLoadError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const savePosts = (p, fetchedAt) => {
    setPosts(p);
    if (fetchedAt) setLastFetched(fetchedAt);
  };

  const ingestData = (rawJson) => {
    try {
      const data = JSON.parse(rawJson);
      const newPosts = parsePosts(data);
      if (!newPosts.length) { setFetchLog("â No posts found in that JSON."); return; }
      const fetchedAt = data.fetched_at || new Date().toISOString();
      const merged = [...newPosts, ...posts].filter(
        (p, i, arr) => arr.findIndex(x => x.id === p.id) === i
      );
      savePosts(merged, fetchedAt);
      setFetchLog(`â Loaded ${newPosts.length} posts. Total: ${merged.length}`);
    } catch (e) {
      setFetchLog("â Invalid JSON: " + e.message);
    }
  };

  const handleFileLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      ingestData(ev.target.result);
      setFetchLog(`â Loaded from file: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleRefresh = () => {
    setLoading(true);
    setLoadError(null);
    fetchFromSupabase()
      .then(data => {
        const newPosts = parsePosts(data);
        setPosts(newPosts);
        if (data.fetched_at) setLastFetched(data.fetched_at);
        setFetchLog(`â Refreshed from Supabase â ${newPosts.length} posts`);
      })
      .catch(err => {
        setLoadError(err.message);
        setFetchLog(`â Supabase error: ${err.message}`);
      })
      .finally(() => setLoading(false));
  };

  const cutoff = Date.now() / 1000 - 86400; // 24 hours ago in Unix seconds
  const filteredPosts = posts.filter(p => {
    if (p.created_utc && p.created_utc < cutoff) return false;
    if (filterSub !== "all" && p.subreddit.toLowerCase() !== filterSub.toLowerCase()) return false;
    if (filterChannel !== "all" && p.scores[filterChannel] < minScore) return false;
    if (filterChannel === "all" && Math.max(...Object.values(p.scores)) < minScore) return false;
    return true;
  }).sort((a, b) => b.ups - a.ups);

  const totalPosts = posts.length;
  const avgScore = posts.length ? Math.round(posts.reduce((acc, p) => acc + Math.max(...Object.values(p.scores)), 0) / posts.length) : 0;

  const NAV = [
    { id: "dashboard", icon: "â¬", label: "Dashboard" },
    { id: "fetch", icon: "â¬", label: "Load Data" },
    { id: "subreddits", icon: "â", label: "Subreddits" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#e0e0e0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:#111; } ::-webkit-scrollbar-thumb { background:#333; border-radius:2px; }
        input, textarea, select { outline:none; }
        button:active { transform:scale(0.97); }
      `}</style>

      {/* Sidebar */}
      <div style={{
        position: "fixed", left: 0, top: 0, bottom: 0, width: "200px",
        background: "#0d0d14", borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column", padding: "20px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px", padding: "0 8px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "linear-gradient(135deg, #00D4FF, #A855F7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: "800", color: "#fff",
          }}>IH</div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#fff" }}>Invisible</div>
            <div style={{ fontSize: "10px", color: "#555" }}>Radar</div>
          </div>
        </div>

        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: "6px", border: "none",
            background: tab === item.id ? "rgba(0,212,255,0.1)" : "transparent",
            color: tab === item.id ? "#00D4FF" : "#666",
            cursor: "pointer", fontSize: "13px", fontWeight: "500",
            transition: "all 0.15s", marginBottom: "2px", width: "100%", textAlign: "left",
          }}>
            <span style={{ fontSize: "11px" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "8px 12px" }}>
          {lastFetched && (
            <div style={{ fontSize: "10px", color: "#333", lineHeight: "1.8", marginBottom: "6px" }}>
              Last updated:<br />
              <span style={{ color: "#444" }}>{new Date(lastFetched).toLocaleString()}</span>
            </div>
          )}
          <div style={{ fontSize: "10px", color: "#333" }}>
            {subreddits.length} subreddits tracked
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: "200px", padding: "28px 32px" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#fff", margin: 0 }}>
              {tab === "dashboard" ? "Dashboard" : tab === "fetch" ? "Load Data" : "Subreddits"}
            </h1>
            <p style={{ fontSize: "13px", color: "#555", margin: "4px 0 0" }}>
              {tab === "dashboard" ? "Monitor Reddit for content opportunities" : tab === "fetch" ? "Refresh or manually load data" : "Manage tracked subreddits"}
            </p>
          </div>
          {tab === "dashboard" && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)",
                color: loading ? "#444" : "#00D4FF", borderRadius: "6px",
                padding: "8px 14px", fontSize: "12px", fontWeight: "600",
                cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              {loading ? "â³ Loadingâ¦" : "â³ Refresh"}
            </button>
          )}
        </div>

        {/* ââ Dashboard tab ââ */}
        {tab === "dashboard" && (
          <>
            {/* Error banner */}
            {loadError && !loading && (
              <div style={{
                padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
                background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)",
                fontSize: "12px", color: "#f55", fontFamily: "monospace",
              }}>
                â {loadError}
              </div>
            )}

            {loading ? (
              <LoadingSpinner />
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "24px" }}>
                  {[
                    { label: "Total Posts", value: totalPosts, color: "#fff" },
                    { label: "Labour", value: posts.filter(p => p.scores.labour >= 3).length, color: "#FF6B35" },
                    { label: "Myths", value: posts.filter(p => p.scores.myths >= 3).length, color: "#A855F7" },
                    { label: "Nations", value: posts.filter(p => p.scores.nations >= 3).length, color: "#00D4FF" },
                    { label: "Geo", value: posts.filter(p => p.scores.geo >= 3).length, color: "#F43F5E" },
                    { label: "Macro", value: posts.filter(p => p.scores.macro >= 3).length, color: "#22C55E" },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: "8px", padding: "16px 20px",
                    }}>
                      <div style={{ fontSize: "24px", fontWeight: "700", color: stat.color, fontFamily: "DM Mono, monospace" }}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                  <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} style={{
                    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                    color: "#ccc", padding: "7px 12px", fontSize: "12px", cursor: "pointer",
                  }}>
                    <option value="all">All Channels</option>
                    {Object.entries(CHANNELS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </select>

                  <select value={filterSub} onChange={e => setFilterSub(e.target.value)} style={{
                    background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px",
                    color: "#ccc", padding: "7px 12px", fontSize: "12px", cursor: "pointer",
                  }}>
                    <option value="all">All Subreddits</option>
                    {[...new Set(posts.map(p => p.subreddit))].sort().map(s => (
                      <option key={s} value={s}>r/{s}</option>
                    ))}
                  </select>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#555" }}>Min score:</span>
                    <input type="range" min="0" max="9" value={minScore}
                      onChange={e => setMinScore(Number(e.target.value))}
                      style={{ width: "80px" }} />
                    <span style={{ fontSize: "12px", color: "#888", fontFamily: "monospace" }}>{minScore}</span>
                  </div>

                  <div style={{ marginLeft: "auto", fontSize: "12px", color: "#555", alignSelf: "center" }}>
                    {filteredPosts.length} of {posts.length} posts
                  </div>
                </div>

                {filteredPosts.length === 0 ? (
                  <div style={{
                    textAlign: "center", padding: "60px 20px",
                    background: "rgba(255,255,255,0.02)", borderRadius: "8px",
                    border: "1px dashed rgba(255,255,255,0.08)",
                  }}>
                    <div style={{ fontSize: "32px", marginBottom: "12px" }}>ð¡</div>
                    <div style={{ fontSize: "14px", color: "#555", marginBottom: "12px" }}>No posts yet.</div>
                    <div style={{ fontSize: "12px", color: "#444" }}>
                      Run <code style={{ color: "#888", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "3px" }}>reddit-radar-fetch.py</code> on your Mac to populate data.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {filteredPosts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ââ Load Data tab ââ */}
        {tab === "fetch" && (
          <div style={{ maxWidth: "700px", display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Option 0: Refresh from Supabase */}
            <div style={{
              background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.15)",
              borderRadius: "10px", padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>âï¸</span>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#00D4FF" }}>Refresh from Supabase</div>
                <span style={{
                  fontSize: "10px", background: "rgba(0,212,255,0.15)", color: "#00D4FF",
                  padding: "2px 8px", borderRadius: "20px", fontWeight: "600",
                }}>LIVE</span>
              </div>
              <div style={{ fontSize: "12px", color: "#666", lineHeight: "1.7", marginBottom: "14px" }}>
                Pull the latest data your Mac fetcher pushed to Supabase.
                {lastFetched && (
                  <span style={{ color: "#444" }}> Last updated: {new Date(lastFetched).toLocaleString()}</span>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                style={{
                  background: "#00D4FF", color: "#000", border: "none",
                  borderRadius: "7px", padding: "10px 22px", fontSize: "13px",
                  fontWeight: "700", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "â³ Loadingâ¦" : "â³ Refresh from Supabase"}
              </button>
            </div>

            {/* Option 1: Load file */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>ð</span>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#ccc" }}>Load local file</div>
              </div>
              <div style={{ fontSize: "12px", color: "#555", lineHeight: "1.7", marginBottom: "14px" }}>
                Manually load <code style={{ color: "#aaa", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "3px" }}>~/reddit-radar-data.json</code> from your Mac.
              </div>
              <input type="file" ref={fileRef} accept=".json" onChange={handleFileLoad} style={{ display: "none" }} />
              <button
                onClick={() => fileRef.current.click()}
                style={{
                  background: "rgba(255,255,255,0.08)", color: "#ccc", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "7px", padding: "10px 22px", fontSize: "13px",
                  fontWeight: "600", cursor: "pointer",
                }}
              >
                ð Open JSON file
              </button>
            </div>

            {/* Option 2: Paste JSON */}
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>ð</span>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#ccc" }}>Paste JSON manually</div>
              </div>
              <div style={{ fontSize: "12px", color: "#555", lineHeight: "1.7", marginBottom: "14px" }}>
                Paste raw JSON from the Reddit multireddit URL or any subreddit .json endpoint.
              </div>
              <textarea
                ref={jsonRef}
                placeholder="Paste JSON here..."
                style={{
                  width: "100%", height: "160px", background: "#0d0d14",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
                  color: "#ccc", padding: "14px", fontSize: "11px",
                  fontFamily: "DM Mono, monospace", resize: "vertical", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  onClick={() => ingestData(jsonRef.current.value)}
                  style={{
                    background: "rgba(255,255,255,0.08)", color: "#ccc", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px", padding: "9px 20px", fontSize: "13px",
                    fontWeight: "600", cursor: "pointer",
                  }}
                >Load Posts</button>
                <button
                  onClick={() => { savePosts([], null); setLastFetched(null); setFetchLog("Cleared all posts."); }}
                  style={{
                    background: "transparent", color: "#ff4444", border: "1px solid rgba(255,68,68,0.3)",
                    borderRadius: "6px", padding: "9px 16px", fontSize: "12px", cursor: "pointer",
                  }}
                >Clear All</button>
              </div>
            </div>

            {fetchLog && (
              <div style={{
                padding: "10px 14px", borderRadius: "6px",
                background: fetchLog.startsWith("â") ? "rgba(0,200,100,0.08)" : "rgba(255,50,50,0.08)",
                border: `1px solid ${fetchLog.startsWith("â") ? "rgba(0,200,100,0.2)" : "rgba(255,50,50,0.2)"}`,
                fontSize: "12px", color: fetchLog.startsWith("â") ? "#0c8" : "#f55",
                fontFamily: "monospace",
              }}>{fetchLog}</div>
            )}
          </div>
        )}

        {/* ââ Subreddits tab ââ */}
        {tab === "subreddits" && (
          <div style={{ maxWidth: "600px" }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <input
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                placeholder="Add subreddit (e.g. worldnews)"
                onKeyDown={e => {
                  if (e.key === "Enter" && newSub.trim()) {
                    setSubreddits([...subreddits, { name: newSub.trim().replace(/^r\//, ""), channels: ["hand", "game", "crown"] }]);
                    setNewSub("");
                  }
                }}
                style={{
                  flex: 1, background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px", color: "#ccc", padding: "9px 14px", fontSize: "13px",
                }}
              />
              <button
                onClick={() => {
                  if (newSub.trim()) {
                    setSubreddits([...subreddits, { name: newSub.trim().replace(/^r\//, ""), channels: ["hand", "game", "crown"] }]);
                    setNewSub("");
                  }
                }}
                style={{
                  background: "#00D4FF", color: "#000", border: "none",
                  borderRadius: "6px", padding: "9px 16px", fontSize: "13px",
                  fontWeight: "700", cursor: "pointer",
                }}
              >+ Add</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {subreddits.map((sub, i) => (
                <div key={sub.name} style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "7px", padding: "10px 14px",
                }}>
                  <span style={{ fontSize: "13px", color: "#ccc", fontFamily: "monospace", flex: 1 }}>
                    r/{sub.name}
                  </span>
                  <div style={{ display: "flex", gap: "5px" }}>
                    {Object.entries(CHANNELS).map(([key, ch]) => (
                      <button
                        key={key}
                        onClick={() => {
                          const updated = [...subreddits];
                          const channels = updated[i].channels.includes(key)
                            ? updated[i].channels.filter(c => c !== key)
                            : [...updated[i].channels, key];
                          updated[i] = { ...updated[i], channels };
                          setSubreddits(updated);
                        }}
                        style={{
                          padding: "3px 8px", borderRadius: "4px", border: "none",
                          background: sub.channels.includes(key) ? `${ch.color}22` : "rgba(255,255,255,0.04)",
                          color: sub.channels.includes(key) ? ch.color : "#444",
                          fontSize: "10px", fontWeight: "600", cursor: "pointer",
                          border: `1px solid ${sub.channels.includes(key) ? ch.color + "44" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >{ch.short}</button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSubreddits(subreddits.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "14px", padding: "0 4px" }}
                  >Ã</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
