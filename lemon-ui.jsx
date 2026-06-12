import { useState, useEffect, useRef } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Palette pulled directly from the lemon cross-section photograph
// Zest #F5C800  · Segment #E8A800  · Pith #F8F4E8  · Rind #2D2A00  · Juice #FFF9D6
// Accent: Citric #7AB648 (a muted leaf green — the one deliberate risk: a complementary
// nature note that grounds the yellow without competing with it)

// ─── Lemon Wheel Loader ───────────────────────────────────────────────────────
function LemonWheelLoader({ progress = 0, size = 80, label = "Squeezing…" }) {
  const segments = 10;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const innerR = size * 0.07;
  const gap = 0.08; // radians gap between segments

  const filledCount = Math.round((progress / 100) * segments);

  const getSegmentPath = (i) => {
    const angleStep = (2 * Math.PI) / segments;
    const startAngle = i * angleStep - Math.PI / 2 + gap / 2;
    const endAngle = (i + 1) * angleStep - Math.PI / 2 - gap / 2;

    const x1 = cx + innerR * Math.cos(startAngle);
    const y1 = cy + innerR * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle);
    const y2 = cy + r * Math.sin(startAngle);
    const x3 = cx + r * Math.cos(endAngle);
    const y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(endAngle);
    const y4 = cy + innerR * Math.sin(endAngle);

    return `M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 0 0 ${x1} ${y1} Z`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Pith / white ring */}
        <circle cx={cx} cy={cy} r={size * 0.46} fill="#F8F4E8" />
        {/* Rind ring */}
        <circle cx={cx} cy={cy} r={size * 0.48} fill="none" stroke="#E8A800" strokeWidth={size * 0.04} />

        {Array.from({ length: segments }).map((_, i) => {
          const filled = i < filledCount;
          const isNext = i === filledCount;
          return (
            <path
              key={i}
              d={getSegmentPath(i)}
              fill={filled ? "#F5C800" : isNext ? "#FFF9D6" : "#EDE8D0"}
              style={{
                transition: "fill 0.3s ease",
                filter: filled ? "drop-shadow(0 0 2px #E8A80066)" : "none",
              }}
            />
          );
        })}

        {/* Center pip */}
        <circle cx={cx} cy={cy} r={size * 0.06} fill="#E8A800" />
        <circle cx={cx} cy={cy} r={size * 0.03} fill="#F8F4E8" />
      </svg>
      <span style={{ fontSize: 12, color: "#A08800", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Lemon Drop (success state) ───────────────────────────────────────────────
function LemonDrop({ visible }) {
  return (
    <div style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 36,
      height: 36,
    }}>
      <svg
        width="22" height="28" viewBox="0 0 22 28"
        style={{
          transform: visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.7)",
          opacity: visible ? 1 : 0,
          transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Drop shape */}
        <path
          d="M11 2 C11 2 2 12 2 18 C2 23.5 6 27 11 27 C16 27 20 23.5 20 18 C20 12 11 2 11 2Z"
          fill="#F5C800"
          stroke="#E8A800"
          strokeWidth="1"
        />
        {/* Gloss highlight */}
        <ellipse cx="8" cy="14" rx="2.5" ry="4" fill="#FFF9D6" opacity="0.7" transform="rotate(-15 8 14)" />
      </svg>
    </div>
  );
}

// ─── Slice Message Bubble ──────────────────────────────────────────────────────
function Slice({ text, author, time, isSelf, isNew }) {
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAppeared(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: isSelf ? "row-reverse" : "row",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 14,
      transform: appeared ? "translateY(0)" : "translateY(12px)",
      opacity: appeared ? 1 : 0,
      transition: "all 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
    }}>
      {/* Avatar seed */}
      {!isSelf && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(135deg, #F5C800, #E8A800)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#2D2A00", fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
          boxShadow: "0 1px 4px #E8A80044",
        }}>
          {author?.charAt(0).toUpperCase()}
        </div>
      )}

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-end" : "flex-start" }}>
        {!isSelf && (
          <span style={{ fontSize: 11, color: "#A08800", marginBottom: 3, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
            {author}
          </span>
        )}
        <div style={{
          background: isSelf
            ? "linear-gradient(135deg, #F5C800 0%, #E8A800 100%)"
            : "#FFFFFF",
          color: isSelf ? "#2D2A00" : "#3D3800",
          padding: "10px 14px",
          borderRadius: isSelf ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: isSelf
            ? "0 2px 8px #E8A80033"
            : "0 1px 4px rgba(0,0,0,0.08)",
          border: isSelf ? "none" : "1px solid #F0EAC8",
          position: "relative",
        }}>
          {text}
          {isSelf && isNew && (
            <span style={{
              position: "absolute",
              top: -6, right: -6,
              background: "#7AB648",
              borderRadius: "50%",
              width: 12, height: 12,
              border: "2px solid #FDFBF0",
            }} />
          )}
        </div>
        <span style={{ fontSize: 10, color: "#B8A840", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
          {time}
        </span>
      </div>
    </div>
  );
}

// ─── Typing Indicator (lemon drops bouncing) ──────────────────────────────────
function TypingDrops() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 10,
          background: "#F5C800",
          borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
          animation: `dropBounce 1.1s ease-in-out ${i * 0.18}s infinite`,
          boxShadow: "0 1px 3px #E8A80055",
        }} />
      ))}
    </div>
  );
}

// ─── Send Button ──────────────────────────────────────────────────────────────
function SliceButton({ onClick, sending }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 44, height: 44,
        borderRadius: "50%",
        background: sending
          ? "#E8A800"
          : "linear-gradient(135deg, #F5C800, #E8A800)",
        border: "none",
        cursor: sending ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 10px #E8A80055",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!sending) e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        {sending ? (
          /* Squeeze / loading wedge icon */
          <circle cx="12" cy="12" r="8" stroke="#FFF9D6" strokeWidth="2" strokeDasharray="20 32" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
          </circle>
        ) : (
          /* Send arrow */
          <path d="M5 12L19 5L14 12L19 19L5 12Z" fill="#2D2A00" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

// ─── Notification Zest Badge ──────────────────────────────────────────────────
function ZestBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      background: "#7AB648",
      color: "#fff",
      borderRadius: 10,
      padding: "1px 6px",
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'DM Sans', sans-serif",
      minWidth: 18,
      textAlign: "center",
      display: "inline-block",
      boxShadow: "0 1px 4px #7AB64844",
    }}>
      {count}
    </span>
  );
}

// ─── Main App Shell ────────────────────────────────────────────────────────────
const INITIAL_SLICES = [
  { id: 1, text: "Hey! Just dropped the new brief in the shared folder.", author: "Maya", time: "9:41 AM", isSelf: false },
  { id: 2, text: "Got it — looks sharp. I'll have feedback by end of day.", author: "You", time: "9:43 AM", isSelf: true },
  { id: 3, text: "Perfect. Client call is at 3 PM if you want to join.", author: "Maya", time: "9:44 AM", isSelf: false },
];

export default function App() {
  const [slices, setSlices] = useState(INITIAL_SLICES);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [showDrop, setShowDrop] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [demoMode, setDemoMode] = useState("chat"); // chat | loader | drops
  const [loaderProgress, setLoaderProgress] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [slices, showTyping]);

  // Demo loader animation
  useEffect(() => {
    if (demoMode !== "loader") return;
    setLoaderProgress(0);
    const interval = setInterval(() => {
      setLoaderProgress(p => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 10;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [demoMode]);

  const sendSlice = () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setSendProgress(0);

    // Simulate progress
    let p = 0;
    const prog = setInterval(() => {
      p += 25;
      setSendProgress(p);
      if (p >= 100) clearInterval(prog);
    }, 120);

    setTimeout(() => {
      setSending(false);
      setSendProgress(0);
      setShowDrop(true);
      setSlices(prev => [...prev, {
        id: Date.now(),
        text,
        author: "You",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isSelf: true,
        isNew: true,
      }]);
      setTimeout(() => setShowDrop(false), 1800);

      // Simulate reply
      setTimeout(() => {
        setShowTyping(true);
        setTimeout(() => {
          setShowTyping(false);
          setSlices(prev => [...prev, {
            id: Date.now() + 1,
            text: "Nice one 🍋 — I'll take a look.",
            author: "Maya",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isSelf: false,
          }]);
        }, 2000);
      }, 800);
    }, 600);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #FDFBF0; }

        @keyframes dropBounce {
          0%, 80%, 100% { transform: translateY(0) scaleY(1); }
          40% { transform: translateY(-7px) scaleY(0.85); }
        }

        textarea:focus { outline: none; }
        textarea { resize: none; }

        .tab-btn {
          padding: 6px 14px;
          border-radius: 20px;
          border: 1.5px solid #E8D840;
          background: transparent;
          color: #A08800;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.02em;
        }
        .tab-btn.active {
          background: #F5C800;
          color: #2D2A00;
          border-color: #F5C800;
          box-shadow: 0 2px 8px #F5C80044;
        }
        .tab-btn:hover:not(.active) {
          background: #FFF9D6;
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E8D880; border-radius: 4px; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "#FDFBF0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{ width: "100%", maxWidth: 420, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Mini lemon logo */}
              <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="13" fill="#F8F4E8" stroke="#E8A800" strokeWidth="1.5" />
                {Array.from({ length: 8 }).map((_, i) => {
                  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                  const a2 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 2;
                  const gap = 0.12;
                  const x1 = 14 + 3 * Math.cos(a + gap);
                  const y1 = 14 + 3 * Math.sin(a + gap);
                  const x2 = 14 + 10 * Math.cos(a + gap);
                  const y2 = 14 + 10 * Math.sin(a + gap);
                  const x3 = 14 + 10 * Math.cos(a2 - gap);
                  const y3 = 14 + 10 * Math.sin(a2 - gap);
                  const x4 = 14 + 3 * Math.cos(a2 - gap);
                  const y4 = 14 + 3 * Math.sin(a2 - gap);
                  return <path key={i} d={`M${x1} ${y1} L${x2} ${y2} A10 10 0 0 1 ${x3} ${y3} L${x4} ${y4} A3 3 0 0 0 ${x1} ${y1}Z`} fill="#F5C800" />;
                })}
                <circle cx="14" cy="14" r="2.5" fill="#E8A800" />
              </svg>
              <span style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 22,
                color: "#2D2A00",
                letterSpacing: "-0.02em",
              }}>
                Slice
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#A08800", fontWeight: 500 }}>Zest</span>
              <ZestBadge count={3} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#B8A840", paddingLeft: 38 }}>
            Drop a slice. Keep it fresh.
          </p>
        </div>

        {/* ── Demo Tabs ── */}
        <div style={{
          width: "100%", maxWidth: 420,
          display: "flex", gap: 8, marginBottom: 16,
        }}>
          {[
            { id: "chat", label: "💬 Chat" },
            { id: "loader", label: "🍋 Loader" },
            { id: "drops", label: "💧 Drops" },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${demoMode === tab.id ? "active" : ""}`}
              onClick={() => setDemoMode(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Chat Panel ── */}
        {demoMode === "chat" && (
          <div style={{
            width: "100%", maxWidth: 420,
            background: "#FFFEF8",
            borderRadius: 20,
            border: "1.5px solid #EDE8C0",
            boxShadow: "0 4px 24px rgba(232, 168, 0, 0.1)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Conversation header */}
            <div style={{
              padding: "14px 18px",
              borderBottom: "1px solid #F0EAC8",
              display: "flex", alignItems: "center", gap: 10,
              background: "#FDFBF0",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg, #F5C800, #E8A800)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: "#2D2A00", fontWeight: 700,
              }}>M</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#2D2A00" }}>Maya</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7AB648" }} />
                  <span style={{ fontSize: 11, color: "#7AB648", fontWeight: 500 }}>active now</span>
                </div>
              </div>
              {/* Sent drop indicator */}
              <div style={{ marginLeft: "auto" }}>
                <LemonDrop visible={showDrop} />
              </div>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 16px 8px",
              minHeight: 280,
              maxHeight: 340,
            }}>
              {slices.map(s => <Slice key={s.id} {...s} />)}
              {showTyping && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "linear-gradient(135deg, #F5C800, #E8A800)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "#2D2A00", fontWeight: 700,
                  }}>M</div>
                  <div style={{
                    background: "#FFFFFF",
                    border: "1px solid #F0EAC8",
                    borderRadius: "18px 18px 18px 4px",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}>
                    <TypingDrops />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Sending progress bar */}
            {sending && (
              <div style={{ height: 2, background: "#F0EAC8", position: "relative", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${sendProgress}%`,
                  background: "linear-gradient(90deg, #F5C800, #E8A800)",
                  transition: "width 0.15s ease",
                  borderRadius: 1,
                }} />
              </div>
            )}

            {/* Input area */}
            <div style={{
              padding: "12px 14px",
              borderTop: "1px solid #F0EAC8",
              display: "flex", alignItems: "flex-end", gap: 10,
              background: "#FDFBF0",
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSlice(); } }}
                placeholder="Drop a slice…"
                rows={1}
                style={{
                  flex: 1,
                  background: "#FFFFFF",
                  border: "1.5px solid #EDE8C0",
                  borderRadius: 14,
                  padding: "10px 14px",
                  fontSize: 14,
                  color: "#2D2A00",
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.5,
                  maxHeight: 100,
                  overflowY: "auto",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#F5C800"}
                onBlur={e => e.target.style.borderColor = "#EDE8C0"}
              />
              <SliceButton onClick={sendSlice} sending={sending} />
            </div>
          </div>
        )}

        {/* ── Loader Demo ── */}
        {demoMode === "loader" && (
          <div style={{
            width: "100%", maxWidth: 420,
            background: "#FFFEF8",
            borderRadius: 20,
            border: "1.5px solid #EDE8C0",
            boxShadow: "0 4px 24px rgba(232, 168, 0, 0.1)",
            padding: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#2D2A00", marginBottom: 6 }}>
                Lemon Wheel Loader
              </div>
              <div style={{ fontSize: 13, color: "#A08800" }}>Segments fill as actions complete</div>
            </div>

            <div style={{ display: "flex", gap: 40, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <LemonWheelLoader progress={30} size={80} label="Uploading…" />
                <div style={{ fontSize: 11, color: "#C8B840", marginTop: 8 }}>30%</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <LemonWheelLoader progress={loaderProgress} size={100} label={loaderProgress < 100 ? "Squeezing…" : "Fresh! ✓"} />
                <div style={{ fontSize: 11, color: "#C8B840", marginTop: 8 }}>Live demo</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <LemonWheelLoader progress={100} size={80} label="Sent! ✓" />
                <div style={{ fontSize: 11, color: "#C8B840", marginTop: 8 }}>100%</div>
              </div>
            </div>

            <button
              onClick={() => setDemoMode("loader")}
              className="tab-btn active"
              style={{ marginTop: -8 }}
            >
              ↺ Replay
            </button>
          </div>
        )}

        {/* ── Drops Demo ── */}
        {demoMode === "drops" && (
          <div style={{
            width: "100%", maxWidth: 420,
            background: "#FFFEF8",
            borderRadius: 20,
            border: "1.5px solid #EDE8C0",
            boxShadow: "0 4px 24px rgba(232, 168, 0, 0.1)",
            padding: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#2D2A00", marginBottom: 6 }}>
                Micro-interactions
              </div>
              <div style={{ fontSize: 13, color: "#A08800" }}>The moments that make it feel alive</div>
            </div>

            {/* Typing drops */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#A08800", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Typing indicator
                </div>
                <div style={{
                  background: "#FFFFFF", border: "1px solid #F0EAC8",
                  borderRadius: "18px 18px 18px 4px",
                  display: "inline-block",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  <TypingDrops />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#A08800", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Sent confirmation drop
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <LemonDrop visible={true} />
                  <span style={{ fontSize: 13, color: "#7AB648", fontWeight: 600 }}>Slice delivered</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#A08800", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Unread zest badges
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <ZestBadge count={1} />
                  <ZestBadge count={4} />
                  <ZestBadge count={12} />
                  <ZestBadge count={99} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#A08800", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Send button states
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <SliceButton onClick={() => {}} sending={false} />
                    <div style={{ fontSize: 10, color: "#C8B840", marginTop: 6 }}>Ready</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <SliceButton onClick={() => {}} sending={true} />
                    <div style={{ fontSize: 10, color: "#C8B840", marginTop: 6 }}>Sending</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer tokens ── */}
        <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { label: "Zest", hex: "#F5C800" },
            { label: "Segment", hex: "#E8A800" },
            { label: "Pith", hex: "#F8F4E8" },
            { label: "Rind", hex: "#2D2A00" },
            { label: "Leaf", hex: "#7AB648" },
          ].map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 14, height: 14, borderRadius: 4,
                background: t.hex,
                border: t.hex === "#F8F4E8" ? "1px solid #EDE8C0" : "none",
              }} />
              <span style={{ fontSize: 11, color: "#A08800", fontFamily: "monospace" }}>{t.label}</span>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}
