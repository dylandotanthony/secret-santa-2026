import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  subscribeToWishlists,
  subscribeToDraw,
  saveWishlist,
  saveOfficialDraw
} from './firebase';
import { 
  Gift, 
  Lock, 
  Unlock, 
  Sparkles, 
  ExternalLink, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  RefreshCw, 
  ShieldAlert, 
  Users, 
  ArrowRight, 
  Copy, 
  CheckCircle2,
  Snowflake,
  Eye,
  EyeOff,
  HeartHandshake,
  Printer,
  Star,
  Bell,
  Trees,
  Wand2,
  UserCheck,
  Search
} from 'lucide-react';

// --- Constants & Storage Keys (v3 ensures clean load of Alexis, Cody, Beth, Jayd, Patrick, Dylan) ---

const INITIAL_PARTICIPANTS = [
  { 
    id: 'alexis', 
    name: 'Alexis', 
    avatar: '🧝‍♀️',
    badge: 'Tinsel Boss',
    wishlistUrl: 'https://www.amazon.com/hz/wishlist/ls', 
    notes: 'Cozy winter knits, vanilla & cedar candles, iced coffee tumblers, self-care treats' 
  },
  { 
    id: 'cody', 
    name: 'Cody', 
    avatar: '🦌',
    badge: 'Sleigh Pilot',
    wishlistUrl: 'https://www.amazon.com/hz/wishlist/ls', 
    notes: 'Tech gadgets, outdoor gear, craft hot sauces, board games & snacks' 
  },
  { 
    id: 'beth', 
    name: 'Beth', 
    avatar: '🤶',
    badge: 'Cookie Alchemist',
    wishlistUrl: 'https://www.etsy.com', 
    notes: 'Artisan mugs, bookish accessories, fuzzy blankets, peppermint bark' 
  },
  { 
    id: 'jayd', 
    name: 'Jayd', 
    avatar: '⛄',
    badge: 'Snowflake Wizard',
    wishlistUrl: 'https://www.target.com/gift-registry', 
    notes: 'Cozy hoodies, gaming/desk accessories, gourmet snacks, travel gear' 
  },
  { 
    id: 'patrick', 
    name: 'Patrick', 
    avatar: '🎅',
    badge: 'Workshop Captain',
    wishlistUrl: 'https://www.rei.com/lists', 
    notes: 'Cast iron & grilling tools, wool socks, whiskey stones, outdoor gear' 
  },
  { 
    id: 'dylan', 
    name: 'Dylan', 
    avatar: '🦊',
    badge: 'Cocoa Connoisseur',
    wishlistUrl: 'https://www.uncommongoods.com', 
    notes: 'Vinyl records, specialty coffee beans, unique puzzles, cozy beanie hats' 
  }
];

// Couple Exclusions: ONLY Beth <-> Jayd and Patrick <-> Dylan (Alexis and Cody are NOT a couple)
const COUPLE_EXCLUSIONS = [
  ['beth', 'jayd'],
  ['patrick', 'dylan']
];

// Turn the shared draw's { giver, receiver } ids into full pairing cards with everyone's latest wishlists
function buildPairingsFromDraw(drawPairs, participants) {
  const byId = Object.fromEntries(participants.map(p => [p.id, p]));
  return drawPairs
    .filter(({ giver, receiver }) => byId[giver] && byId[receiver])
    .map(({ giver, receiver }) => ({
      id: `${giver}-${receiver}`,
      giver: { ...byId[giver] },
      receiver: { ...byId[receiver] }
    }));
}

// Last year's draw (giver id -> receiver id): nobody gets the same person two years in a row
const LAST_YEAR_PAIRINGS = {
  beth: 'dylan',
  dylan: 'alexis',
  alexis: 'jayd',
  jayd: 'cody',
  cody: 'patrick',
  patrick: 'beth'
};

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789🎄❄️🦌🔔★🎁✨🍬';

// Helper: Check if two participants are in the couple exclusions list
function isExcludedCouple(personA, personB) {
  const nameA = personA.name.trim().toLowerCase();
  const nameB = personB.name.trim().toLowerCase();
  return COUPLE_EXCLUSIONS.some(
    ([c1, c2]) => (nameA === c1 && nameB === c2) || (nameA === c2 && nameB === c1)
  );
}

// Helper: Generate a valid single-cycle Secret Santa Derangement respecting couple rules
function generateSecretSantaPairings(participants, enforceCoupleExclusions = true) {
  if (participants.length < 2) return [];

  const maxAttempts = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Shuffle to form a single closed Hamiltonian cycle (guarantees nobody gets themselves & no isolated 2-person sub-loops)
    const pool = [...participants];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let valid = true;
    const candidatePairings = [];

    for (let i = 0; i < pool.length; i++) {
      const giver = pool[i];
      const receiver = pool[(i + 1) % pool.length];

      if (giver.id === receiver.id) {
        valid = false;
        break;
      }

      if (enforceCoupleExclusions && isExcludedCouple(giver, receiver)) {
        valid = false;
        break;
      }

      if (LAST_YEAR_PAIRINGS[giver.id] === receiver.id) {
        valid = false;
        break;
      }

      candidatePairings.push({
        id: `${giver.id}-${receiver.id}`,
        giver: { ...giver },
        receiver: { ...receiver }
      });
    }

    if (valid) {
      // Sort alphabetically by Giver's name so the displayed list doesn't spoil the closed-loop order
      return candidatePairings.sort((a, b) => a.giver.name.localeCompare(b.giver.name));
    }
  }

  // Fallback if custom roster makes exclusions impossible
  const pool = [...participants];
  return pool.map((giver, idx) => ({
    id: `${giver.id}-${pool[(idx + 1) % pool.length].id}`,
    giver: { ...giver },
    receiver: { ...pool[(idx + 1) % pool.length] }
  })).sort((a, b) => a.giver.name.localeCompare(b.giver.name));
}

// --- Subcomponent: North Pole Elf Cipher Letter Scrambler ---
const ScrambleText = ({ targetText, isActive, startDelay = 0, duration = 1700, onComplete }) => {
  const [display, setDisplay] = useState(targetText);
  const [isDone, setIsDone] = useState(!isActive);

  useEffect(() => {
    if (!isActive) {
      setDisplay(targetText);
      setIsDone(true);
      return;
    }

    setIsDone(false);
    let intervalId = null;

    // Immediately show scrambled characters while waiting for startDelay
    const initialScramble = targetText
      .split('')
      .map(ch => (ch === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]))
      .join('');
    setDisplay(initialScramble);

    const preScrambleInterval = setInterval(() => {
      setDisplay(
        targetText
          .split('')
          .map(ch => (ch === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]))
          .join('')
      );
    }, 55);

    const timeoutId = setTimeout(() => {
      clearInterval(preScrambleInterval);
      const startTime = Date.now();

      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const lockedCount = Math.floor(progress * targetText.length);

        let result = '';
        for (let i = 0; i < targetText.length; i++) {
          if (targetText[i] === ' ') {
            result += ' ';
          } else if (i < lockedCount) {
            result += targetText[i];
          } else {
            result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }

        setDisplay(result);

        if (progress >= 1) {
          clearInterval(intervalId);
          setDisplay(targetText);
          setIsDone(true);
          if (onComplete) onComplete();
        }
      }, 45);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(preScrambleInterval);
      if (intervalId) clearInterval(intervalId);
    };
  }, [targetText, isActive, startDelay, duration]);

  return (
    <span className="inline-block font-mono tracking-wide">
      {display.split('').map((char, index) => {
        const isLocked = isDone || (index < targetText.length && char === targetText[index]);
        return (
          <span
            key={index}
            className={`transition-all duration-150 ${
              isLocked
                ? 'text-amber-950 font-extrabold'
                : 'text-red-600 font-bold bg-amber-200/70 px-0.5 rounded animate-pulse'
            }`}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

// --- Pre-computed Falling Snowflakes for Whimsical Atmosphere ---
const SNOWFLAKES = Array.from({ length: 28 }).map((_, i) => ({
  id: i,
  left: `${(i * 3.7) % 100}%`,
  animationDuration: `${9 + (i % 8) * 2}s`,
  animationDelay: `${(i % 7) * 1.1}s`,
  size: `${10 + (i % 4) * 4}px`,
  opacity: 0.25 + (i % 5) * 0.12
}));

export default function App() {
  // --- Persistent State ---
  // --- Shared State (lives in Firebase so everyone sees the same draw & wishlists) ---
  const [sharedWishlists, setSharedWishlists] = useState({});
  const [drawDoc, setDrawDoc] = useState(null);
  const [drawLoaded, setDrawLoaded] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const drawSeenRef = useRef(false);

  const participants = useMemo(
    () => INITIAL_PARTICIPANTS.map(p => ({ ...p, ...sharedWishlists[p.id] })),
    [sharedWishlists]
  );
  const pairings = useMemo(
    () => (drawDoc ? buildPairingsFromDraw(drawDoc.pairs, participants) : []),
    [drawDoc, participants]
  );
  const isLocked = !!drawDoc;
  const generatedTimestamp = drawDoc ? drawDoc.drawnAt : null;

  const [enforceCouples, setEnforceCouples] = useState(true);

  // --- Interactive UI State ---
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('ALL'); // 'ALL' or participant.id
  const [codeError, setCodeError] = useState('');

  // Scrambling Cipher Sequence State
  const [isScrambling, setIsScrambling] = useState(false);
  const [scramblePhaseText, setScramblePhaseText] = useState('');

  // Wishlist & Participant Editing State
  const [editingId, setEditingId] = useState(null);
  const [editWishlist, setEditWishlist] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Modals & Toast Notifications
  const [toastMessage, setToastMessage] = useState('');

  // --- Live Sync with Firebase ---
  useEffect(() => {
    const onError = (e) => {
      console.error('Firebase sync failed', e);
      setConnectionError('Couldn’t reach the North Pole server. Check your connection and refresh the page.');
    };

    const stopWishlists = subscribeToWishlists(setSharedWishlists, onError);
    const stopDraw = subscribeToDraw((draw) => {
      // Play the cipher scramble for anyone watching when the draw happens live (not on a normal page load)
      if (draw && drawSeenRef.current === 'empty') {
        playScrambleSequence(draw.pairs.length);
      }
      drawSeenRef.current = draw ? 'drawn' : 'empty';
      setDrawDoc(draw);
      setDrawLoaded(true);
    }, onError);

    return () => {
      stopWishlists();
      stopDraw();
    };
  }, []);

  const playScrambleSequence = (pairCount) => {
    setIsScrambling(true);
    setSelectedPersonFilter('ALL');

    const phases = [
      '🎄 WARMING UP THE NORTH POLE CIPHER ENGINE...',
      '🦌 CHECKING MISTLETOE EXCLUSIONS (BETH ↔ JAYD & PATRICK ↔ DYLAN)...',
      '✨ SKIPPING LAST YEAR’S MATCHES & LOCKING 1-WAY LOOP...',
      '🎁 DECODING OFFICIAL 2026 SECRET SANTA PAIRINGS...'
    ];

    setScramblePhaseText(phases[0]);
    setTimeout(() => setScramblePhaseText(phases[1]), 950);
    setTimeout(() => setScramblePhaseText(phases[2]), 1950);
    setTimeout(() => setScramblePhaseText(phases[3]), 2950);

    setTimeout(() => {
      setIsScrambling(false);
      triggerToast('🎅 Official 2026 Pairings Drawn & Permanently Posted to the Reference Board!');
    }, 2300 + pairCount * 400);
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3200);
  };

  const formatUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  // --- Edit / Add Participant & Sync Live Reference Board ---
  const startEditing = (person) => {
    setEditingId(person.id);
    setEditWishlist(person.wishlistUrl || '');
    setEditNotes(person.notes || '');
    // Smooth scroll to wishlist editor card if clicked from the Reference Board
    const el = document.getElementById(`wishlist-card-${person.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const saveEdit = async (id) => {
    const person = participants.find(p => p.id === id);
    if (!person) return;

    const formattedUrl = formatUrl(editWishlist);
    const trimmedNotes = editNotes.trim();

    try {
      // Saved to Firebase, so the live listener updates every open page (including this one)
      await saveWishlist(id, formattedUrl, trimmedNotes);
      setEditingId(null);
      triggerToast(`✨ Updated ${person.name}'s Christmas Wishlist & Gift Hints!`);
    } catch (e) {
      console.error('Failed to save wishlist', e);
      triggerToast('⚠️ Couldn’t save that wishlist. Check the link isn’t too long and try again.');
    }
  };

  // --- Trigger One-Time Code-Protected Cipher Draw (shared with everyone via Firebase) ---
  const handleTriggerRandomizer = async (e) => {
    e.preventDefault();
    setCodeError('');

    if (isLocked) {
      setCodeError('This year’s pairings have already been drawn and locked!');
      return;
    }

    if (!window.confirm('🎅 This draws the official pairings for everyone and can’t be undone. Draw now?')) {
      return;
    }

    const computedPairings = generateSecretSantaPairings(participants, enforceCouples);
    const nowStr = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    try {
      await saveOfficialDraw(
        computedPairings.map(p => [p.giver.id, p.receiver.id]),
        nowStr,
        enforceCouples
      );
    } catch (err) {
      setCodeError(
        err.message === 'already-drawn'
          ? 'Someone already drew this year’s pairings! Refresh to see them.'
          : 'Couldn’t reach the North Pole server. Check your connection and try again.'
      );
    }
  };

  // --- Copy Formatted Reference Board Summary ---
  const handleCopyPairings = () => {
    if (!pairings.length) return;
    const lines = pairings.map(
      (p, idx) =>
        `${idx + 1}. ${p.giver.avatar || '🎅'} ${p.giver.name}  ➔  🎁 ${p.receiver.avatar || '🎄'} ${p.receiver.name}${
          p.receiver.wishlistUrl ? `\n   🔗 Wishlist: ${p.receiver.wishlistUrl}` : ''
        }${p.receiver.notes ? `\n   💡 Hints: ${p.receiver.notes}` : ''}`
    );
    const text =
      `🎄✨ OFFICIAL 2026 SECRET SANTA PAIRINGS ✨🎄\n` +
      `Drawn & Locked: ${generatedTimestamp}\n` +
      `----------------------------------------\n` +
      lines.join('\n\n') +
      `\n----------------------------------------\n🎅 Happy Holidays from the North Pole Workshop!`;

    navigator.clipboard.writeText(text);
    triggerToast('📋 Copied all 6 Official Pairings & Wishlists for your group chat!');
  };

  // Find spotlight details if a specific person pill is clicked on the Reference Board
  const spotlightGiverPair =
    selectedPersonFilter !== 'ALL'
      ? pairings.find(p => p.giver.id === selectedPersonFilter)
      : null;

  const spotlightReceiverPair =
    selectedPersonFilter !== 'ALL'
      ? pairings.find(p => p.receiver.id === selectedPersonFilter)
      : null;

  return (
    <div className="min-h-screen bg-[#0c261c] text-stone-100 relative overflow-x-hidden pb-24 selection:bg-amber-400 selection:text-red-950" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      {/* Load Whimsical Christmas Google Fonts & Custom Keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Mountains+of+Christmas:wght@700&family=Quicksand:wght@500;600;700&display=swap');

        .font-christmas {
          font-family: 'Mountains of Christmas', cursive;
        }
        .font-whimsy {
          font-family: 'Fredoka', sans-serif;
        }

        @keyframes snowfall {
          0% {
            transform: translateY(-20px) translateX(0px) rotate(0deg);
          }
          50% {
            transform: translateY(50vh) translateX(18px) rotate(180deg);
          }
          100% {
            transform: translateY(105vh) translateX(-12px) rotate(360deg);
          }
        }

        @keyframes twinkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.88); }
        }

        .candy-cane-border {
          background: repeating-linear-gradient(
            45deg,
            #dc2626,
            #dc2626 14px,
            #fffbeb 14px,
            #fffbeb 28px,
            #16a34a 28px,
            #16a34a 42px,
            #fffbeb 42px,
            #fffbeb 56px
          );
        }

        .parchment-card {
          background: linear-gradient(180deg, #fffdf7 0%, #fef7e6 100%);
        }

        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* Animated Snowfall Layer */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 no-print">
        {SNOWFLAKES.map(flake => (
          <div
            key={flake.id}
            className="absolute top-0 text-white select-none"
            style={{
              left: flake.left,
              fontSize: flake.size,
              opacity: flake.opacity,
              animation: `snowfall ${flake.animationDuration} linear ${flake.animationDelay} infinite`
            }}
          >
            ❄
          </div>
        ))}
        {/* Warm Festive Glow Blobs */}
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-red-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl" />
      </div>

      {/* Twinkling Christmas String Lights Across the Top */}
      <div className="relative z-20 w-full bg-[#071710] border-b-2 border-amber-400/40 py-2 px-3 overflow-hidden no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5">
            {Array.from({ length: 16 }).map((_, idx) => {
              const bulbColors = [
                'bg-red-500 shadow-red-500/80',
                'bg-amber-400 shadow-amber-400/80',
                'bg-emerald-400 shadow-emerald-400/80',
                'bg-sky-400 shadow-sky-400/80'
              ];
              const colorClass = bulbColors[idx % bulbColors.length];
              return (
                <span
                  key={idx}
                  className={`w-3 h-4 rounded-full shadow-lg ${colorClass} shrink-0`}
                  style={{
                    animation: `twinkle ${1.8 + (idx % 4) * 0.4}s ease-in-out infinite`,
                    animationDelay: `${idx * 0.15}s`
                  }}
                />
              );
            })}
          </div>
          <div className="text-xs font-whimsy tracking-wide text-amber-200 flex items-center gap-1.5 shrink-0">
            <Bell className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span>North Pole Official 2026 Gift Exchange</span>
          </div>
        </div>
      </div>

      {/* Floating Festive Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-red-900 border-2 border-amber-300 text-amber-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce no-print">
          <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Whimsical Workshop Hero Header */}
      <header className="relative z-10 max-w-6xl mx-auto pt-7 pb-5 px-4 sm:px-6">
        <div className="candy-cane-border p-2 rounded-3xl shadow-2xl">
          <div className="bg-gradient-to-br from-[#133829] via-[#0e2c20] to-[#19221e] rounded-2xl p-6 sm:p-8 border-2 border-amber-300/40 relative overflow-hidden">
            {/* Corner Holly Accents */}
            <div className="absolute -top-6 -right-6 text-7xl opacity-15 select-none pointer-events-none">🎄</div>
            <div className="absolute -bottom-6 -left-4 text-7xl opacity-15 select-none pointer-events-none">🛷</div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
              <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-red-600 via-red-700 to-red-900 border-2 border-amber-300 flex items-center justify-center shadow-xl shrink-0 transform -rotate-3">
                  <span className="text-4xl sm:text-5xl">🎅</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full text-xs font-whimsy uppercase tracking-wider bg-red-700/90 text-amber-200 border border-amber-300/50 shadow">
                      ✨ 2026 Holiday Edition ✨
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-whimsy border ${
                      isLocked
                        ? 'bg-amber-400/20 border-amber-300 text-amber-200'
                        : 'bg-emerald-500/20 border-emerald-300 text-emerald-200'
                    }`}>
                      {isLocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-amber-300" />
                          <span>Official Pairings Drawn & Posted!</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Awaiting the Big Draw</span>
                        </>
                      )}
                    </span>
                  </div>

                  <h1 className="font-christmas text-4xl sm:text-5xl md:text-6xl font-bold text-amber-100 tracking-wide mt-2 drop-shadow">
                    Annual Secret Santa Exchange
                  </h1>
                  <p className="text-emerald-100/90 text-sm sm:text-base mt-1 font-medium">
                    Featuring <strong className="text-amber-300">Alexis, Cody, Beth, Jayd, Patrick &amp; Dylan</strong> • Official Pairings Reference Board &amp; Wishlist Hub
                  </p>
                </div>
              </div>

              {/* Quick Roster Badges Pill Strip */}
              <div className="flex flex-wrap items-center gap-2 bg-[#081b13]/90 p-3 rounded-2xl border border-emerald-700/70 self-start lg:self-center">
                {participants.map(person => (
                  <div
                    key={person.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-900/70 border border-emerald-700/70 text-xs font-bold text-amber-100"
                  >
                    <span>{person.avatar || '🎄'}</span>
                    <span>{person.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN CONTENT AREA
         ===================================================================== */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-10 mt-4">

        {/* ===================================================================
            SECTION A: WHEN LOCKED -> PROMINENT OFFICIAL 2026 PAIRINGS REFERENCE BOARD
           =================================================================== */}
        {!drawLoaded && (
          <div className="text-center text-amber-100 font-whimsy py-10">
            {connectionError || '❄️ Checking the North Pole for this year’s pairings...'}
          </div>
        )}

        {drawLoaded && isLocked && (
          <section aria-label="This Year's Official Secret Santa Pairings" className=" candy-cane-border p-2.5 rounded-3xl shadow-2xl">
            <div className="parchment-card text-stone-900 rounded-2xl p-5 sm:p-8 border-2 border-amber-500/60 relative overflow-hidden">
              {/* Top Ribbon & Action Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b-2 border-dashed border-red-300">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-red-700 text-amber-100 flex items-center justify-center shadow-md shrink-0 border-2 border-amber-300">
                    <Gift className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-800 text-xs font-whimsy uppercase tracking-wider">
                        📌 Pinned Season Reference Board
                      </span>
                      {generatedTimestamp && (
                        <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                          Drawn &amp; Locked: {generatedTimestamp}
                        </span>
                      )}
                    </div>
                    <h2 className="font-christmas text-3xl sm:text-4xl font-bold text-red-900 mt-1">
                      {isScrambling
                        ? '🔮 North Pole Elf Cipher is Decoding This Year’s Pairings...'
                        : '🎄 This Year’s Official Secret Santa Pairings (2026) 🎄'}
                    </h2>
                    <p className="text-sm text-stone-600 font-medium">
                      {isScrambling
                        ? scramblePhaseText
                        : 'Bookmark this page! Everyone can reference who they have and open their recipient’s wishlist link below all season long.'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons: Copy for Group Chat, Print, or Organizer Unlock */}
                {!isScrambling && (
                  <div className="flex flex-wrap items-center gap-2.5 no-print">
                    <button
                      onClick={handleCopyPairings}
                      className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-amber-50 font-whimsy text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95"
                    >
                      <Copy className="w-4 h-4 text-amber-300" />
                      <span>Copy Pairings to Group Chat</span>
                    </button>

                    <button
                      onClick={() => window.print()}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 font-whimsy text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Print Reference Sheet"
                    >
                      <Printer className="w-4 h-4 text-red-700" />
                      <span>Print</span>
                    </button>

                  </div>
                )}
              </div>

              {/* "Highlight My Assignment" Quick Selector Bar */}
              {!isScrambling && (
                <div className="mt-5 bg-amber-100/80 border-2 border-amber-300 rounded-2xl p-4 no-print">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-950 font-whimsy text-sm">
                      <Search className="w-4 h-4 text-red-700 shrink-0" />
                      <span>Quick Spotlight — Click your name to highlight your assignment:</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setSelectedPersonFilter('ALL')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-whimsy transition-all cursor-pointer ${
                          selectedPersonFilter === 'ALL'
                            ? 'bg-red-700 text-white shadow-sm scale-105'
                            : 'bg-white hover:bg-red-50 text-stone-700 border border-amber-300'
                        }`}
                      >
                        ✨ Show Everyone ({pairings.length})
                      </button>
                      {participants.map(person => (
                        <button
                          key={person.id}
                          onClick={() =>
                            setSelectedPersonFilter(
                              selectedPersonFilter === person.id ? 'ALL' : person.id
                            )
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-whimsy flex items-center gap-1.5 transition-all cursor-pointer ${
                            selectedPersonFilter === person.id
                              ? 'bg-emerald-800 text-amber-200 shadow-sm scale-105 ring-2 ring-amber-400'
                              : 'bg-white hover:bg-emerald-50 text-stone-800 border border-amber-300'
                          }`}
                        >
                          <span>{person.avatar || '🎅'}</span>
                          <span>{person.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Personal Spotlight Banner when a specific person is clicked */}
                  {spotlightGiverPair && (
                    <div className="mt-4 pt-3.5 border-t border-amber-300/80 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/90 rounded-xl p-4 border border-emerald-300 shadow-sm">
                      <div className="space-y-1">
                        <div className="text-xs font-whimsy uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>{spotlightGiverPair.giver.name}’s Official 2026 Assignment</span>
                        </div>
                        <p className="text-base sm:text-lg font-bold text-stone-900">
                          {spotlightGiverPair.giver.avatar} <span className="text-red-800">{spotlightGiverPair.giver.name}</span> is buying a Christmas gift for{' '}
                          <span className="underline decoration-red-500 decoration-2 text-emerald-900">
                            {spotlightGiverPair.receiver.avatar} {spotlightGiverPair.receiver.name}
                          </span>
                          ! 🎁
                        </p>
                        {spotlightReceiverPair && (
                          <p className="text-xs text-stone-600">
                            (And <strong className="text-stone-800">{spotlightReceiverPair.giver.avatar} {spotlightReceiverPair.giver.name}</strong> is {spotlightGiverPair.giver.name}’s Secret Santa!)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {spotlightGiverPair.receiver.wishlistUrl && (
                          <a
                            href={spotlightGiverPair.receiver.wishlistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-amber-50 font-whimsy text-xs sm:text-sm flex items-center gap-1.5 shadow"
                          >
                            <Gift className="w-4 h-4 text-amber-300" />
                            <span>Open {spotlightGiverPair.receiver.name}’s Wishlist</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => startEditing(spotlightGiverPair.giver)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-whimsy text-xs flex items-center gap-1.5 border border-emerald-300 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Update {spotlightGiverPair.giver.name}’s Own Wishlist</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===============================================================
                  OFFICIAL PAIRINGS GRID (ALL 6 PAIRINGS ALWAYS VISIBLE FOR REFERENCE)
                 =============================================================== */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {pairings.map((pair, idx) => {
                  const rowDelay = idx * 360;
                  const isHighlighted =
                    selectedPersonFilter === 'ALL' ||
                    pair.giver.id === selectedPersonFilter ||
                    pair.receiver.id === selectedPersonFilter;

                  return (
                    <div
                      key={pair.id}
                      className={`rounded-2xl p-4 sm:p-5 border-2 transition-all relative overflow-hidden ${
                        selectedPersonFilter !== 'ALL' && isHighlighted
                          ? 'bg-white border-red-600 shadow-xl ring-4 ring-amber-300/60 scale-[1.01]'
                          : selectedPersonFilter !== 'ALL' && !isHighlighted
                          ? 'bg-stone-100/70 border-stone-300 opacity-60'
                          : 'bg-white hover:bg-amber-50/40 border-amber-300/90 shadow-md'
                      }`}
                    >
                      {/* Top Badge Strip */}
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-amber-200">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-800 text-amber-100 font-whimsy text-xs">
                          <span>🎄 Pairing #{idx + 1}</span>
                        </span>

                        {!isScrambling && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                            ✓ Official 2026 Match
                          </span>
                        )}
                      </div>

                      {/* Giver ---> Receiver Row */}
                      <div className="grid grid-cols-11 items-center gap-2 my-2">
                        {/* GIVER BOX */}
                        <div className="col-span-5 bg-emerald-50/90 border border-emerald-300 rounded-xl p-3">
                          <div className="text-[10px] font-whimsy uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                            <span>🎅 Secret Santa</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-2xl select-none">{pair.giver.avatar || '🎅'}</span>
                            <div className="text-base sm:text-lg font-whimsy text-stone-900 truncate">
                              <ScrambleText
                                targetText={pair.giver.name}
                                isActive={isScrambling}
                                startDelay={rowDelay}
                                duration={1250}
                              />
                            </div>
                          </div>
                          {pair.giver.badge && (
                            <div className="text-[11px] text-emerald-700 font-medium mt-0.5 truncate">
                              {pair.giver.badge}
                            </div>
                          )}
                        </div>

                        {/* FESTIVE ARROW */}
                        <div className="col-span-1 flex flex-col items-center justify-center text-red-600">
                          <span className="text-xs font-whimsy uppercase text-red-700 hidden sm:block">Gifts</span>
                          <div className={`w-8 h-8 rounded-full bg-red-100 border border-red-300 flex items-center justify-center shadow-sm ${isScrambling ? 'animate-spin' : ''}`}>
                            <ArrowRight className="w-4 h-4 text-red-700" />
                          </div>
                        </div>

                        {/* RECEIVER BOX */}
                        <div className="col-span-5 bg-red-50/90 border border-red-300 rounded-xl p-3">
                          <div className="text-[10px] font-whimsy uppercase tracking-wider text-red-800 flex items-center gap-1">
                            <Gift className="w-3 h-3 text-red-600 shrink-0" />
                            <span>Buying Gift For</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-2xl select-none">{pair.receiver.avatar || '🎁'}</span>
                            <div className="text-base sm:text-lg font-whimsy text-stone-900 truncate">
                              <ScrambleText
                                targetText={pair.receiver.name}
                                isActive={isScrambling}
                                startDelay={rowDelay + 350}
                                duration={1550}
                              />
                            </div>
                          </div>
                          {pair.receiver.badge && (
                            <div className="text-[11px] text-red-700 font-medium mt-0.5 truncate">
                              {pair.receiver.badge}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Recipient Wishlist Button & Gift Notes Footer */}
                      {!isScrambling ? (
                        <div className="mt-3 pt-3 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="text-xs text-stone-700 flex-1">
                            {pair.receiver.notes ? (
                              <span>
                                <strong className="text-red-800 font-whimsy">💡 {pair.receiver.name}’s Gift Ideas:</strong>{' '}
                                {pair.receiver.notes}
                              </span>
                            ) : (
                              <span className="italic text-stone-400">No gift hints added yet</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 no-print">
                            {pair.receiver.wishlistUrl ? (
                              <a
                                href={pair.receiver.wishlistUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-amber-50 font-whimsy text-xs flex items-center gap-1.5 shadow-sm transition-all"
                              >
                                <Gift className="w-3.5 h-3.5 text-amber-300" />
                                <span>{pair.receiver.name}’s Wishlist</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <button
                                onClick={() => startEditing(pair.receiver)}
                                className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-whimsy text-xs cursor-pointer"
                              >
                                + Add {pair.receiver.name}’s Link
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-2.5 border-t border-amber-200/80 text-center text-xs font-mono text-emerald-800 animate-pulse">
                          SCRAMBLING ELF CIPHER &amp; VERIFYING WISHLIST LINK...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION B: WHEN UNLOCKED -> NORTH POLE CIPHER RANDOMIZER MACHINE
            ( Plus Couple Exclusions Toggle for Beth<->Jayd & Patrick<->Dylan )
           =================================================================== */}
        {drawLoaded && !isLocked && (
          <section className="candy-cane-border p-2 rounded-3xl shadow-2xl">
            <div className="parchment-card text-stone-900 rounded-2xl p-6 sm:p-8 border-2 border-amber-400">
              <div className="grid lg:grid-cols-12 gap-8 items-center">
                {/* Left Column: Explanation & Mistletoe Couple Rules */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-100 border border-red-300 text-red-800 font-whimsy text-xs">
                    <Wand2 className="w-4 h-4 text-red-600" />
                    <span>One-Time North Pole Cipher Machine</span>
                  </div>

                  <h2 className="font-christmas text-3xl sm:text-4xl font-bold text-red-900">
                    Ready to Draw This Year’s Secret Santa Pairings?
                  </h2>

                  <p className="text-stone-700 text-sm sm:text-base leading-relaxed">
                    With one press of the button, the North Pole Cipher Machine will scramble everyone’s letters while it thinks and then permanently post <strong>this year’s official pairings</strong> right here on the site for <strong className="text-red-800">Alexis, Cody, Beth, Jayd, Patrick, and Dylan</strong> to reference!
                  </p>

                  {/* Mistletoe Couple Exclusions Card (Beth <-> Jayd & Patrick <-> Dylan ONLY) */}
                  <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-700 text-amber-200 shrink-0 mt-0.5">
                        <HeartHandshake className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-whimsy text-sm sm:text-base text-emerald-950">
                            Mistletoe Couple Exclusions
                          </h3>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            enforceCouples
                              ? 'bg-emerald-700 text-amber-100'
                              : 'bg-stone-300 text-stone-700'
                          }`}>
                            {enforceCouples ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-900/80 mt-0.5">
                          Prevents couples from drawing each other: <strong>Beth ↔ Jayd</strong> and <strong>Patrick ↔ Dylan</strong>.{' '}
                          <span className="underline decoration-emerald-500">Alexis &amp; Cody have no restriction</span> and can match with anyone!
                        </p>
                        <p className="text-xs text-emerald-900/80 mt-1">
                          🔁 <strong>No repeats:</strong> nobody draws the same person they had last year (always on).
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEnforceCouples(!enforceCouples)}
                      className={`px-4 py-2 rounded-xl font-whimsy text-xs shrink-0 transition-all cursor-pointer border ${
                        enforceCouples
                          ? 'bg-emerald-800 text-amber-200 border-emerald-950 shadow'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {enforceCouples ? '✓ Couples Excluded' : 'Allow Any Match'}
                    </button>
                  </div>
                </div>

                {/* Right Column: Draw Button Box */}
                <div className="lg:col-span-5 bg-gradient-to-br from-[#123526] to-[#0a2117] text-amber-50 rounded-2xl p-6 border-2 border-amber-400/60 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-amber-300 font-whimsy text-sm">
                      <Sparkles className="w-4 h-4" />
                      <span>Ready When Everyone Is!</span>
                    </div>
                  </div>

                  <form onSubmit={handleTriggerRandomizer} className="space-y-3.5">

                    {codeError && (
                      <div className="p-2.5 rounded-xl bg-red-950/90 border border-red-400 text-red-200 text-xs flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{codeError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-3.5 px-5 rounded-xl font-whimsy text-base bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-500 hover:to-red-700 text-amber-100 border-2 border-amber-300 shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                    >
                      <Sparkles className="w-5 h-5 text-amber-300" />
                      <span>Scramble &amp; Draw 2026 Pairings!</span>
                    </button>

                    <p className="text-[11px] text-center text-emerald-200/70">
                      🔒 Runs once and locks the official pairings onto the page for everyone to view.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION C: EVERYONE'S GIFT LISTS & WISHLIST DIRECTORY
           =================================================================== */}
        <section aria-label="Everyone's Gift Lists & Wishlists" className="bg-[#113325]/90 border-2 border-amber-400/50 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-emerald-700/80">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border-2 border-amber-300 text-amber-300 flex items-center justify-center shadow">
                <Trees className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-christmas text-3xl sm:text-4xl font-bold text-amber-100">
                  🎁 Everyone’s Christmas Wishlists &amp; Gift Hints
                </h2>
                <p className="text-xs sm:text-sm text-emerald-200/80">
                  Click <strong className="text-amber-300">&ldquo;Edit Wishlist / Notes&rdquo;</strong> on your card anytime to paste your Amazon, Etsy, or gift registry link!
                </p>
              </div>
            </div>

          </div>

          {/* Grid of 6 Participant Wishlist Cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {participants.map((person) => {
              const isEditing = editingId === person.id;
              // Check if this person has a partner in the couple exclusion rule
              const partnerName =
                person.name.toLowerCase() === 'beth'
                  ? 'Jayd'
                  : person.name.toLowerCase() === 'jayd'
                  ? 'Beth'
                  : person.name.toLowerCase() === 'patrick'
                  ? 'Dylan'
                  : person.name.toLowerCase() === 'dylan'
                  ? 'Patrick'
                  : null;

              // Find who they are buying for if locked
              const assignedPair = isLocked
                ? pairings.find(p => p.giver.id === person.id)
                : null;

              return (
                <div
                  id={`wishlist-card-${person.id}`}
                  key={person.id}
                  className="parchment-card text-stone-900 rounded-2xl p-5 border-2 border-amber-300 shadow-lg flex flex-col justify-between transition-all hover:-translate-y-0.5"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-amber-300 pb-2">
                        <span className="font-whimsy text-sm text-red-800 flex items-center gap-1.5">
                          <span>{person.avatar || '🎅'}</span>
                          <span>Edit {person.name}’s Gift List</span>
                        </span>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-stone-400 hover:text-stone-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold uppercase text-stone-600">
                          Wishlist URL (Amazon, Etsy, Registry, etc.)
                        </label>
                        <input
                          type="text"
                          value={editWishlist}
                          onChange={(e) => setEditWishlist(e.target.value)}
                          placeholder="https://www.amazon.com/hz/wishlist/..."
                          className="w-full mt-0.5 bg-white border border-amber-400 rounded-xl px-3 py-2 text-sm text-stone-900"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold uppercase text-stone-600">
                          Gift Hints, Sizes &amp; Favorite Treats
                        </label>
                        <textarea
                          rows={2}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Favorite colors, snacks, sizes, or gift ideas..."
                          className="w-full mt-0.5 bg-white border border-amber-400 rounded-xl px-3 py-2 text-sm text-stone-900"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-xl bg-stone-200 text-stone-700 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(person.id)}
                          className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-whimsy text-xs flex items-center gap-1 cursor-pointer shadow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Gift List</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-red-100 border-2 border-red-300 flex items-center justify-center text-2xl shadow-sm shrink-0">
                              {person.avatar || '🎅'}
                            </div>
                            <div>
                              <h3 className="font-whimsy text-lg text-stone-900 leading-tight">
                                {person.name}
                              </h3>
                              <span className="inline-block text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 mt-0.5">
                                {person.badge || 'Secret Santa Elf'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 no-print">
                            <button
                              onClick={() => startEditing(person)}
                              className="p-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
                              title={`Edit ${person.name}'s wishlist link or notes`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Couple Exclusion Note Badge (Only for Beth/Jayd and Patrick/Dylan) */}
                        {enforceCouples && partnerName && (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-[11px] font-semibold text-red-800">
                            <HeartHandshake className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>Mistletoe Rule: Won’t draw {partnerName}</span>
                          </div>
                        )}

                        {/* Gift Hints Box */}
                        <div className="mt-3 bg-amber-50/90 border border-amber-200/90 rounded-xl p-3">
                          <div className="text-[10px] font-whimsy uppercase tracking-wider text-amber-900 mb-1">
                            ✨ Gift Hints &amp; Wishes
                          </div>
                          {person.notes ? (
                            <p className="text-xs text-stone-700 leading-relaxed">
                              {person.notes}
                            </p>
                          ) : (
                            <p className="text-xs italic text-stone-400">
                              No gift notes added yet — click edit to add hints!
                            </p>
                          )}
                        </div>

                        {/* If pairings are drawn, show a mini badge of who they are gifting to */}
                        {isLocked && !isScrambling && assignedPair && (
                          <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-emerald-100/80 border border-emerald-300 text-xs text-emerald-950 flex items-center justify-between">
                            <span>
                              🎅 Gifting to: <strong>{assignedPair.receiver.avatar} {assignedPair.receiver.name}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Direct Wishlist Link & Edit Button */}
                      <div className="mt-4 pt-3 border-t border-amber-200 flex items-center justify-between gap-2 no-print">
                        {person.wishlistUrl ? (
                          <a
                            href={person.wishlistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-amber-50 font-whimsy text-xs flex items-center justify-center gap-1.5 shadow transition-all"
                          >
                            <Gift className="w-3.5 h-3.5 text-amber-300" />
                            <span>Open {person.name}’s Gift List</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            onClick={() => startEditing(person)}
                            className="flex-1 py-2.5 px-3.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-whimsy text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add {person.name}’s Wishlist Link</span>
                          </button>
                        )}

                        <button
                          onClick={() => startEditing(person)}
                          className="py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 text-xs font-semibold cursor-pointer"
                        >
                          Edit Link
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

    </div>
  );
}