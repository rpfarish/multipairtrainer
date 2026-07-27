import { useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { Menu, X, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import "./PairTrainer.css";
import { motion, AnimatePresence } from "framer-motion";

const LETTERS = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i),
);
const STORAGE_KEY = "ptr:session";

/**
 * Thin wrapper around window.localStorage that mirrors the shape of the
 * async `window.storage` API this component originally used, so the rest
 * of the component logic (await window.storage.get/set) didn't need to
 * change. Works in any standard Create React App / Vite / Next.js client
 * component running in a real browser.
 */
const storage = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === null) return null;
      return { key, value };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generatePairs(letters) {
  const pairs = [];
  for (const l1 of letters)
    for (const l2 of letters) if (l1 !== l2) pairs.push(l1 + l2);
  return pairs;
}

function freshSession(letters) {
  const sel = letters && letters.length ? letters : LETTERS;
  return {
    letters: sel,
    pairs: shuffle(generatePairs(sel)),
    index: 0,
    startTime: Date.now(),
    pairTimes: [],
    lastAdvance: Date.now(),
  };
}

function fmtDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtStat(ms) {
  if (ms === null || ms === undefined) return "--";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function fmtETA(ms) {
  if (!ms || ms <= 0) return "--";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PairTrainer() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftLetters, setDraftLetters] = useState(new Set(LETTERS));
  const [autoSeconds, setAutoSeconds] = useState("");
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const inputFocusedRef = useRef(false);
  const autoTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSession(parsed);
          setDraftLetters(new Set(parsed.letters));
        } else {
          const fresh = freshSession(LETTERS);
          setSession(fresh);
          await storage.set(STORAGE_KEY, JSON.stringify(fresh));
        }
      } catch (e) {
        setSession(freshSession(LETTERS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (s) => {
    try {
      const r = await storage.set(STORAGE_KEY, JSON.stringify(s));
      if (!r) setSaveError(true);
      else setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      if (prev.index >= prev.pairs.length - 1) return prev;

      const duration = Date.now() - prev.lastAdvance;
      const newIndex = prev.index + 1;

      // Fire confetti when reaching the last pair.
      if (newIndex === prev.pairs.length - 1) {
        const durationMs = 500;
        const end = Date.now() + durationMs;

        (function frame() {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 120,
            origin: { x: 0 },
          });

          confetti({
            particleCount: 3,
            angle: 120,
            spread: 120,
            origin: { x: 1 },
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        })();
      }

      const updated = {
        ...prev,
        index: newIndex,
        pairTimes: [...prev.pairTimes, duration],
        lastAdvance: Date.now(),
      };

      persist(updated);
      return updated;
    });

    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  }, [persist]);
  const prev = useCallback(() => {
    setSession((p) => {
      if (!p || p.index <= 0) return p;
      const updated = { ...p, index: p.index - 1, lastAdvance: Date.now() };
      persist(updated);
      return updated;
    });
  }, [persist]);

  const reshuffle = useCallback(() => {
    setSession((p) => {
      const fresh = freshSession(p ? p.letters : LETTERS);
      persist(fresh);
      return fresh;
    });
    setMenuOpen(false);
  }, [persist]);

  const confirmMenu = useCallback(() => {
    if (draftLetters.size === 0) return;
    const letters = LETTERS.filter((l) => draftLetters.has(l));
    const fresh = freshSession(letters);
    setSession(fresh);
    persist(fresh);
    setMenuOpen(false);
  }, [draftLetters, persist]);

  useEffect(() => {
    if (menuOpen && session) setDraftLetters(new Set(session.letters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  useEffect(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    if (
      autoSeconds > 0 &&
      session &&
      session.index < session.pairs.length - 1
    ) {
      autoTimerRef.current = setTimeout(() => next(), autoSeconds * 1000);
    }
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [autoSeconds, session?.index, session?.pairs?.length, next]);

  useEffect(() => {
    function onKey(e) {
      if (inputFocusedRef.current) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (menuOpen) {
        if (e.key === "Escape") {
          setMenuOpen(false);
          e.preventDefault();
        } else if (e.key === "Enter") {
          confirmMenu();
          e.preventDefault();
        } else if (e.key === "A" && e.shiftKey) {
          setDraftLetters(new Set(LETTERS));
          e.preventDefault();
        } else if (e.key === "N" && e.shiftKey) {
          setDraftLetters(new Set());
          e.preventDefault();
        }
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "r":
        case "R":
          e.preventDefault();
          reshuffle();
          break;
        case "m":
        case "M":
          e.preventDefault();
          setMenuOpen((o) => !o);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, next, prev, reshuffle, confirmMenu]);

  if (loading || !session) {
    return <div className="pt-loading">loading...</div>;
  }

  const total = session.pairs.length;
  const currentPair = session.pairs[session.index];
  const isComplete = session.index >= total;
  const elapsed = now - session.startTime;
  const pairTimes = session.pairTimes;
  const avg = pairTimes.length
    ? pairTimes.reduce((a, b) => a + b, 0) / pairTimes.length
    : 0;
  const max = pairTimes.length ? Math.max(...pairTimes) : 0;
  const min = pairTimes.length ? Math.min(...pairTimes) : 0;
  const remaining = total - (session.index + 1);
  const etaMs = avg > 0 ? remaining * avg : 0;

  function toggleDraft(letter) {
    setDraftLetters((prev) => {
      const s = new Set(prev);
      if (s.has(letter)) s.delete(letter);
      else s.add(letter);
      return s;
    });
  }

  return (
    <div className="pt-root">
      {/* top bar */}
      <div className="pt-topbar">
        <span className="pt-topbar-label">Pair Memo · AA–ZZ</span>
        <button onClick={() => setMenuOpen(true)} className="pt-menu-btn">
          <Menu size={16} />
          Letters
          <span className="pt-kbd-badge">M</span>
        </button>
      </div>

      {/* main */}
      <div className="pt-main">
        <span className="pt-counter">
          {session.index + 1} / {total}
        </span>

        <div className="pt-card">
          <div className="pt-corner pt-corner-tl" />
          <div className="pt-corner pt-corner-tr" />
          <div className="pt-corner pt-corner-bl" />
          <div className="pt-corner pt-corner-br" />

          <span className={`pt-pair-text${flash ? " pt-flash" : ""}`}>
            {currentPair}
          </span>

          {isComplete && (
            <span className="pt-complete-label">
              Deck complete — press R to reshuffle
            </span>
          )}
        </div>

        {/* stats */}
        <div className="pt-stats">
          <Stat label="Elapsed" value={fmtDuration(elapsed)} />
          <Stat label="Avg" value={fmtStat(avg)} />
          <Stat label="Max" value={fmtStat(max)} />
          <Stat label="Min" value={fmtStat(min)} />
          <Stat label="ETA" value={fmtETA(etaMs)} />
        </div>

        {/* controls */}
        <div className="pt-controls">
          <button
            onClick={prev}
            disabled={session.index === 0}
            className="pt-btn"
          >
            <ChevronLeft size={16} />
            Prev
            <span className="pt-kbd-badge">←</span>
          </button>

          <button
            onClick={next}
            disabled={isComplete}
            className="pt-btn pt-btn-primary"
          >
            Next
            <ChevronRight size={16} />
            <span className="pt-kbd-badge">→</span>
          </button>

          <button onClick={reshuffle} className="pt-btn">
            <Shuffle size={16} />
            Reshuffle
            <span className="pt-kbd-badge">R</span>
          </button>

          <div className="pt-auto-wrap">
            <label className="pt-auto-label">Auto (s)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={autoSeconds}
              onFocus={() => (inputFocusedRef.current = true)}
              onBlur={() => (inputFocusedRef.current = false)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setAutoSeconds(Number.isFinite(v) && v >= 0 ? v : "");
              }}
              className="pt-auto-input"
            />
          </div>
        </div>
      </div>

      {/* footer shortcuts legend */}
      <div className="pt-footer">
        <span>
          <Kbd>→</Kbd>/<Kbd>Space</Kbd> next
        </span>
        <span>
          <Kbd>←</Kbd> prev
        </span>
        <span>
          <Kbd>R</Kbd> reshuffle
        </span>
        <span>
          <Kbd>M</Kbd> letters menu
        </span>
        <span>
          <Kbd>Esc</Kbd> close menu
        </span>
        {saveError && (
          <span className="pt-save-error">
            storage unavailable — progress may not persist
          </span>
        )}
      </div>

      {/* backdrop */}
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} className="pt-backdrop" />
      )}

      {/* slide-out menu */}
      <div className={`pt-side-menu${menuOpen ? " pt-open" : ""}`}>
        <div className="pt-side-menu-header">
          <span className="pt-side-menu-title">Letters</span>
          <button onClick={() => setMenuOpen(false)} className="pt-close-btn">
            <X size={18} />
          </button>
        </div>

        <div className="pt-quick-select">
          <button
            onClick={() => setDraftLetters(new Set(LETTERS))}
            className="pt-quick-btn"
          >
            All <span className="pt-quick-btn-hint">(⇧A)</span>
          </button>
          <button
            onClick={() => setDraftLetters(new Set())}
            className="pt-quick-btn"
          >
            None <span className="pt-quick-btn-hint">(⇧N)</span>
          </button>
        </div>

        <div className="pt-letter-grid">
          {LETTERS.map((l) => {
            const checked = draftLetters.has(l);
            return (
              <label
                key={l}
                className={`pt-letter-cell${checked ? " pt-checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDraft(l)}
                />
                {l}
              </label>
            );
          })}
        </div>

        <div className="pt-pairs-count">
          {draftLetters.size} letter{draftLetters.size !== 1 ? "s" : ""}{" "}
          selected · {draftLetters.size * Math.max(draftLetters.size - 1, 0)}{" "}
          pairs
        </div>

        <button
          onClick={confirmMenu}
          disabled={draftLetters.size === 0}
          className="pt-confirm-btn"
        >
          Confirm & restart
          <span className="pt-kbd-badge">Enter</span>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="pt-stat-label">{label}</div>
      <div className="pt-stat-value">{value}</div>
    </div>
  );
}

function Kbd({ children }) {
  return <span className="pt-kbd">{children}</span>;
}
