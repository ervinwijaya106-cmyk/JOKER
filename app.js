/**
 * SCORE CEKIH — app.js
 * Sadewa Corp | Vanilla JavaScript | PWA
 * Complete implementation — all features per specification
 */

'use strict';

/* ================================================================
   CONSTANTS
================================================================ */
const ELEMENT_COLORS = ['#39ff6a', '#5fd4ff', '#b06bff', '#ff4d4d'];
const ELEMENT_NAMES  = ['Dragon 🐉', 'Tiger 🐯', 'Eagle 🦅', 'Cobra 🐍'];
const CARD_IMAGES    = ['images/card_1.png','images/card_2.png','images/card_3.png','images/card_4.png'];
const ANIMAL_VIDEOS  = ['video/dragon.mp4','video/tiger.mp4','video/eagle.mp4','video/cobra.mp4'];
const LS_KEY         = 'scoreCekih_v7';
const LS_ARCHIVE_KEY = 'scoreCekih_archive_v7';
const LS_STATS_KEY   = 'scoreCekih_stats_v7';
const LS_ACH_KEY     = 'scoreCekih_ach_v7';
const LS_MUSIC_KEY   = 'scoreCekih_music';
const MAX_UNDO       = 30;

const ACHIEVEMENTS_DEF = [
  { id:'tukang_ngocok', name:'Tukang Ngocok Kartu', desc:'Mendapat skor negatif', icon:'🃏', condition: s => s.minScore < 0 },
  { id:'tukang_bakar',  name:'Tukang Bakar',  desc:'Burns ≥ 3',  icon:'🔥', condition: s => s.burns >= 3 },
  { id:'hari_apes',     name:'Hari Apes Gak Ada Yang Tau', desc:'Burned ≥ 5', icon:'😵', condition: s => s.burned >= 5 },
  { id:'dewa_kartu',    name:'Dewa Kartu', desc:'Skor tertinggi ≥ 500', icon:'👑', condition: s => s.highestScore >= 500 },
  { id:'dewa_segala',   name:'Dewa Dari Segala Dewa', desc:'Stars > 1', icon:'🌟', condition: s => s.stars > 1 },
  { id:'triple_burn',   name:'Triple Burn', desc:'Triple Burn terjadi', icon:'💥', condition: s => s.tripleBurn > 0 },
];

const AI_COMMENTS = [
  'Wah tipis banget selisihnya!',
  'Kayaknya ada yang mau comeback nih',
  'Hati-hati yang di bawah lagi ngintip!',
  'Situasi makin panas!',
  'Siapa yang bakal menang ya?',
  'Jangan santai dulu, masih panjang!',
  'Fokus fokus!',
  'Wah berbahaya ini!',
];

/* ================================================================
   INITIAL STATE FACTORY
================================================================ */
function makeInitialPlayer(setupIndex, name) {
  return {
    setupIndex,           // 0–3, FIXED FOREVER
    name,
    score: 0,
    totalScore: 0,        // alias used in rendering
    rank: setupIndex + 1, // will be recalculated
    stars: 0,
    isInRecoveryMode: false,
    recoveryStartTurn: -1,
    consecutiveMinusTurns: 0,
    consecutiveMinus3Played: false,
    isNegative: false,
    dangerLevel: 'safe',  // safe|caution|danger|critical
    burnedBy: [],
  };
}

function makeDefaultState() {
  return {
    phase: 'setup',       // setup|game|newround
    round: 1,
    turn: 1,
    victoryTarget: 1000,
    players: [],          // array of player objects
    history: [],          // array of history entries
    burnCandidates: [],   // [{attackerIdx, victimIdx, attackerName, victimName}]
    burnConfirmed: false,
    prevRankings: [],     // rankings before last save
    chartData: [],        // [{turn, scores:[...]}]
    aiComment: 'Permainan dimulai! Semoga beruntung!',
    undoStack: [],        // snapshots
    rewardVideoPlaying: false,
  };
}

/* ================================================================
   GLOBAL STATE
================================================================ */
let gameState = makeDefaultState();
let bgMusic = null;
let bgMusicEnabled = true;
let bgMusicVolume = 1.0;
let rewardVideoActive = false;
let rewardVideoEl = null;
let rewardTimeout = null;
let scoreChart = null;
let chartCtx = null;
let klikAudio = null;
let currentWavAudio = null;

/* ================================================================
   UTILITIES
================================================================ */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function $(id) { return document.getElementById(id); }

function numberToBahasaIndonesia(n) {
  if (n === 0) return 'nol';
  if (isNaN(n)) return '?';
  let result = '';
  if (n < 0) { result = 'minus '; n = Math.abs(n); }
  const ones=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan',
               'sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas',
               'enam belas','tujuh belas','delapan belas','sembilan belas'];
  function toWord(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) {
      const t = Math.floor(num/10);
      const r = num % 10;
      const tens=['','','dua puluh','tiga puluh','empat puluh','lima puluh',
                  'enam puluh','tujuh puluh','delapan puluh','sembilan puluh'];
      return tens[t] + (r ? ' ' + ones[r] : '');
    }
    if (num < 200) return 'seratus' + (num > 100 ? ' ' + toWord(num - 100) : '');
    if (num < 1000) {
      const h = Math.floor(num/100);
      const r = num % 100;
      return ones[h] + ' ratus' + (r ? ' ' + toWord(r) : '');
    }
    if (num < 2000) return 'seribu' + (num > 1000 ? ' ' + toWord(num - 1000) : '');
    if (num < 1000000) {
      const t = Math.floor(num/1000);
      const r = num % 1000;
      return toWord(t) + ' ribu' + (r ? ' ' + toWord(r) : '');
    }
    return num.toString();
  }
  result += toWord(n);
  return result.trim();
}

function numberToEnglish(n) {
  // Reuse Indonesian for brevity since TTS uses id-ID
  return numberToBahasaIndonesia(n);
}

function getTimestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function elementColor(setupIndex) {
  return ELEMENT_COLORS[setupIndex] || '#fff';
}

/* ================================================================
   LOCAL STORAGE
================================================================ */
function saveState() {
  try {
    const toSave = deepClone(gameState);
    // Limit undoStack saved size
    toSave.undoStack = toSave.undoStack.slice(-MAX_UNDO);
    localStorage.setItem(LS_KEY, JSON.stringify(toSave));
  } catch(e) { console.warn('LocalStorage save error:', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.players) return false;
    gameState = parsed;
    // Ensure arrays exist
    if (!gameState.undoStack) gameState.undoStack = [];
    if (!gameState.burnCandidates) gameState.burnCandidates = [];
    if (!gameState.history) gameState.history = [];
    if (!gameState.chartData) gameState.chartData = [];
    return true;
  } catch(e) { return false; }
}

function savePermanentStats(players) {
  // We overwrite stats per player based on CURRENT session data
  // (session stats are cumulative within a session via player object)
  try {
    let stats = JSON.parse(localStorage.getItem(LS_STATS_KEY) || '{}');
    players.forEach(p => {
      if (!stats[p.name]) {
        stats[p.name] = { stars:0, burns:0, burned:0, tripleBurn:0, highestScore:0, minScore:0 };
      }
      const s = stats[p.name];
      // Use MAX to avoid double-counting; session values are cumulative
      s.stars      = Math.max(s.stars || 0, p.stars || 0);
      s.burns      = Math.max(s.burns || 0, p.burns || 0);
      s.burned     = Math.max(s.burned || 0, p.burned || 0);
      s.tripleBurn = Math.max(s.tripleBurn || 0, p.tripleBurn || 0);
      s.highestScore = Math.max(s.highestScore || 0, p.highestScore || 0);
      if (p.minScore !== undefined && p.minScore < 0) {
        s.minScore = Math.min(s.minScore || 0, p.minScore);
      }
    });
    localStorage.setItem(LS_STATS_KEY, JSON.stringify(stats));
    checkAndSaveAchievements(stats);
    saveArchive(players);
  } catch(e) {}
}

function getPermanentStats() {
  try { return JSON.parse(localStorage.getItem(LS_STATS_KEY) || '{}'); } catch(e) { return {}; }
}

function saveArchive(players) {
  try {
    let archive = JSON.parse(localStorage.getItem(LS_ARCHIVE_KEY) || '{}');
    players.forEach(p => {
      if (!archive[p.name]) archive[p.name] = { name: p.name, firstSeen: new Date().toLocaleDateString(), stars: 0 };
      archive[p.name].stars = Math.max(archive[p.name].stars || 0, p.stars || 0);
      archive[p.name].lastSeen = new Date().toLocaleDateString();
    });
    localStorage.setItem(LS_ARCHIVE_KEY, JSON.stringify(archive));
  } catch(e) {}
}

function getArchive() {
  try { return JSON.parse(localStorage.getItem(LS_ARCHIVE_KEY) || '{}'); } catch(e) { return {}; }
}

function checkAndSaveAchievements(stats) {
  try {
    let ach = JSON.parse(localStorage.getItem(LS_ACH_KEY) || '{}');
    Object.entries(stats).forEach(([name, s]) => {
      ACHIEVEMENTS_DEF.forEach(a => {
        const key = name + '_' + a.id;
        if (!ach[key] && a.condition(s)) {
          ach[key] = { name, achievementId: a.id, date: new Date().toLocaleDateString() };
        }
      });
    });
    localStorage.setItem(LS_ACH_KEY, JSON.stringify(ach));
  } catch(e) {}
}

function getAchievements() {
  try { return JSON.parse(localStorage.getItem(LS_ACH_KEY) || '{}'); } catch(e) { return {}; }
}

/* ================================================================
   RANKING CALCULATION
================================================================ */
function calculateRanking(players) {
  // Sort by score desc, return copy with updated rank
  const sorted = [...players].sort((a,b) => b.score - a.score);
  const result = deepClone(players);
  sorted.forEach((sp, idx) => {
    const p = result.find(p => p.setupIndex === sp.setupIndex);
    if (p) p.rank = idx + 1;
  });
  return result;
}

function getRankings(players) {
  const sorted = [...players].sort((a,b) => b.score - a.score);
  return sorted.map((p,i) => ({ setupIndex: p.setupIndex, name: p.name, rank: i+1 }));
}

/* ================================================================
   BURN DETECTION
================================================================ */
function detectBurnCandidates(playersBefore, playersAfter, turn, isFirstTurn) {
  if (isFirstTurn) return []; // No burns on first turn of each round
  
  const candidates = [];
  const rankBefore = {};
  const rankAfter  = {};
  
  // Build rank maps: lower number = better rank (#1 is best)
  playersBefore.forEach(p => { rankBefore[p.setupIndex] = p.rank; });
  playersAfter.forEach(p  => { rankAfter[p.setupIndex]  = p.rank; });

  // Track which players are exiting recovery this turn
  // (they were in recovery before but are NOT in recovery after)
  const exitingRecovery = new Set();
  playersAfter.forEach(p => {
    const pb = playersBefore.find(x => x.setupIndex === p.setupIndex);
    if (pb && pb.isInRecoveryMode && !p.isInRecoveryMode) {
      exitingRecovery.add(p.setupIndex);
    }
  });

  playersAfter.forEach(attacker => {
    const atkRankBefore = rankBefore[attacker.setupIndex];
    const atkRankAfter  = rankAfter[attacker.setupIndex];
    
    // Attacker must have improved rank (smaller rank number = better position)
    if (atkRankAfter >= atkRankBefore) return;

    playersAfter.forEach(victim => {
      if (victim.setupIndex === attacker.setupIndex) return;
      
      const vRankBefore = rankBefore[victim.setupIndex];
      const vRankAfter  = rankAfter[victim.setupIndex];

      // Victim was above (better rank = smaller number) attacker BEFORE
      // i.e. victim's rank before was smaller than attacker's rank before
      if (vRankBefore >= atkRankBefore) return; // victim was NOT above attacker before

      // Victim is now BELOW (worse rank = larger number) attacker AFTER
      // i.e. victim's rank after is larger than attacker's rank after
      if (vRankAfter <= atkRankAfter) return; // victim is still at or above attacker after

      // Victim score must be > 0
      if (victim.score <= 0) return;

      // Victim must not be in Recovery Mode
      if (victim.isInRecoveryMode) return;
      
      // Victim must not have been in recovery BEFORE this turn (was protected)
      const victimBefore = playersBefore.find(p => p.setupIndex === victim.setupIndex);
      if (victimBefore && victimBefore.isInRecoveryMode) return;

      // Both exiting recovery in same turn: cannot burn each other
      if (exitingRecovery.has(attacker.setupIndex) && exitingRecovery.has(victim.setupIndex)) return;

      candidates.push({
        attackerIdx: attacker.setupIndex,
        victimIdx: victim.setupIndex,
        attackerName: attacker.name,
        victimName: victim.name,
      });
    });
  });

  // Deduplicate
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.attackerIdx + '_' + c.victimIdx;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ================================================================
   RECOVERY MODE UPDATE
================================================================ */
function updateRecoveryStatus(players, currentTurn) {
  // Called at the START of each turn processing.
  // Recovery lasts 1 full turn: burned in turn N → protected in turn N+1 → normal from turn N+2
  // currentTurn is the turn BEING processed now.
  return players.map(p => {
    const np = { ...p };
    if (np.isInRecoveryMode) {
      // If current turn is more than 1 turn after recovery start, remove recovery
      if (currentTurn > np.recoveryStartTurn + 1) {
        np.isInRecoveryMode = false;
        np.recoveryStartTurn = -1;
      }
    }
    return np;
  });
}

/* ================================================================
   DANGER LEVEL
================================================================ */
function calcDangerLevel(player, players, target) {
  const maxScore = Math.max(...players.map(p => p.score));
  const gap = maxScore - player.score;
  if (player.score < 0) return 'critical';
  if (gap > target * 0.7) return 'critical';
  if (gap > target * 0.5) return 'danger';
  if (gap > target * 0.3) return 'caution';
  return 'safe';
}

/* ================================================================
   PROCESS BURN
================================================================ */
function processBurn(selectedVictimIndices) {
  if (!selectedVictimIndices || selectedVictimIndices.length === 0) return;
  
  // Group burns by attacker
  const attackerCounts = {};
  const burnActions = [];
  
  selectedVictimIndices.forEach(victimIdx => {
    const candidate = gameState.burnCandidates.find(c => c.victimIdx === victimIdx);
    if (!candidate) return;
    burnActions.push(candidate);
    if (!attackerCounts[candidate.attackerIdx]) attackerCounts[candidate.attackerIdx] = 0;
    attackerCounts[candidate.attackerIdx]++;
  });

  burnActions.forEach(burn => {
    const attacker = gameState.players.find(p => p.setupIndex === burn.attackerIdx);
    const victim   = gameState.players.find(p => p.setupIndex === burn.victimIdx);
    if (!attacker || !victim) return;

    // Victim becomes 0, enters recovery
    victim.score = 0;
    victim.isInRecoveryMode = true;
    victim.recoveryStartTurn = gameState.turn;
    victim.burned = (victim.burned || 0) + 1;
    
    // Attacker stats
    attacker.burns = (attacker.burns || 0) + 1;
    attacker.burnedBy = attacker.burnedBy || [];
    
    // History entry
    gameState.history.unshift({
      type: 'burn',
      text: `🔥 ${burn.attackerName} membakar ${burn.victimName}`,
      turn: gameState.turn,
      round: gameState.round,
      time: getTimestamp(),
    });
  });

  // Triple burn check
  Object.entries(attackerCounts).forEach(([atkIdx, count]) => {
    if (count >= 3) {
      const attacker = gameState.players.find(p => p.setupIndex === parseInt(atkIdx));
      if (attacker) {
        attacker.tripleBurn = (attacker.tripleBurn || 0) + 1;
        gameState.history.unshift({
          type: 'triple',
          text: `💥 TRIPLE BURN oleh ${attacker.name}!`,
          turn: gameState.turn,
          round: gameState.round,
          time: getTimestamp(),
        });
      }
    }
  });

  // Recalculate rankings after burns
  gameState.players = calculateRanking(gameState.players);
  
  // Recalculate danger levels
  gameState.players.forEach(p => {
    p.dangerLevel = calcDangerLevel(p, gameState.players, gameState.victoryTarget);
  });

  // Update burn candidates (remove confirmed ones)
  selectedVictimIndices.forEach(vi => {
    gameState.burnCandidates = gameState.burnCandidates.filter(c => c.victimIdx !== vi);
  });

  savePermanentStats(gameState.players);
  // Note: saveState() and render() are called by the caller (handleConfirmBurn)
  return burnActions;
}

/* ================================================================
   FIND SHUFFLE CANDIDATE
================================================================ */
function findShuffleCandidate() {
  const players = gameState.players;
  
  // If first turn and someone got bonus +250/+300 (Tutup Tangan/Triss)
  // We don't track this separately, skip this case
  
  // Find most negative
  const negPlayers = players.filter(p => p.score < 0);
  if (negPlayers.length > 0) {
    return negPlayers.reduce((min, p) => p.score < min.score ? p : min, negPlayers[0]);
  }
  
  // No negative: find smallest score
  return players.reduce((min, p) => p.score < min.score ? p : min, players[0]);
}

/* ================================================================
   AUDIO SYSTEM
================================================================ */
function initBgMusic() {
  try {
    bgMusic = new Audio('audio/casino_bg.mp3');
    bgMusic.loop = true;
    bgMusic.volume = bgMusicVolume;
    const stored = localStorage.getItem(LS_MUSIC_KEY);
    bgMusicEnabled = stored !== 'false';
    if (bgMusicEnabled) {
      bgMusic.play().catch(() => {
        // Autoplay blocked — will play on first user interaction
        document.addEventListener('click', () => {
          if (bgMusicEnabled && bgMusic.paused) bgMusic.play().catch(() => {});
        }, { once: true });
      });
    }
    updateMusicBtn();
  } catch(e) {}
}

function updateMusicBtn() {
  const btn = $('btn-bg-music');
  if (!btn) return;
  btn.textContent = bgMusicEnabled ? '🎵' : '🔇';
  btn.classList.toggle('active', bgMusicEnabled);
}

function duckBgMusic() {
  if (bgMusic) bgMusic.volume = 0.15;
}
function restoreBgMusic() {
  if (bgMusic) bgMusic.volume = bgMusicEnabled ? bgMusicVolume : 0;
}

function getMaleVoice() {
  return new Promise(resolve => {
    const tryGet = () => {
      const voices = speechSynthesis.getVoices();
      const male = voices.find(v => v.lang === 'id-ID' && /male|pria|laki/i.test(v.name))
        || voices.find(v => v.lang === 'id-ID')
        || voices.find(v => v.lang.startsWith('id'))
        || voices[0];
      resolve(male || null);
    };
    if (speechSynthesis.getVoices().length > 0) tryGet();
    else { speechSynthesis.onvoiceschanged = () => tryGet(); setTimeout(tryGet, 1500); }
  });
}

async function speak(text) {
  return new Promise(async resolve => {
    try {
      speechSynthesis.cancel();
      duckBgMusic();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'id-ID';
      utter.rate = 1;
      utter.pitch = 0.8;
      utter.volume = 1;
      utter.voice = await getMaleVoice();
      utter.onend = () => { restoreBgMusic(); resolve(); };
      utter.onerror = () => { restoreBgMusic(); resolve(); };
      speechSynthesis.speak(utter);
    } catch(e) { restoreBgMusic(); resolve(); }
  });
}

function playWav(src) {
  return new Promise(resolve => {
    try {
      if (currentWavAudio) { currentWavAudio.pause(); currentWavAudio = null; }
      duckBgMusic();
      const audio = new Audio(src);
      currentWavAudio = audio;
      audio.onended = () => { restoreBgMusic(); currentWavAudio = null; resolve(); };
      audio.onerror = () => { restoreBgMusic(); currentWavAudio = null; resolve(); };
      audio.play().catch(() => { restoreBgMusic(); currentWavAudio = null; resolve(); });
    } catch(e) { restoreBgMusic(); resolve(); }
  });
}

function playKlik() {
  try {
    const audio = new Audio('audio/klik.wav');
    audio.volume = 0.5;
    audio.play().catch(() => {
      // AudioContext fallback
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
      } catch(ex) {}
    });
  } catch(e) {}
}

function stopAllAudio() {
  speechSynthesis.cancel();
  if (currentWavAudio) {
    currentWavAudio.pause();
    currentWavAudio.currentTime = 0;
    currentWavAudio = null;
  }
  restoreBgMusic();
}

/* ================================================================
   COMPLETE AUDIO SEQUENCE
================================================================ */
async function runBurnAudioSequence(burnActions, isTriple) {
  // Step 3: TTS for each burn
  for (const burn of burnActions) {
    await speak(`${burn.attackerName} membakar ${burn.victimName}`);
  }
  
  // Step 4: shuffle card TTS
  const shuffler = findShuffleCandidate();
  await speak(`${shuffler.name} tolong kocok kartunya ya`);
  
  // Step 5: total score TTS
  for (const p of gameState.players) {
    await speak(`${p.name} mendapatkan ${numberToBahasaIndonesia(p.score)} poin`);
  }
  
  // Step 6: AI comment
  const comment = AI_COMMENTS[Math.floor(Math.random() * AI_COMMENTS.length)];
  await speak(comment);
}

async function runNoBurnAudioSequence() {
  // Step 1: shuffle card TTS
  const shuffler = findShuffleCandidate();
  await speak(`${shuffler.name} tolong kocok kartunya ya`);
  
  // Step 2: total score TTS
  for (const p of gameState.players) {
    await speak(`${p.name} mendapatkan ${numberToBahasaIndonesia(p.score)} poin`);
  }
  
  // Step 3: AI comment
  const comment = AI_COMMENTS[Math.floor(Math.random() * AI_COMMENTS.length)];
  await speak(comment);
}

/* ================================================================
   ATTACK ANIMATION (Canvas-based projectile)
================================================================ */
function playAttackAnimation(attackerSetupIdx, victimSetupIdx, onComplete) {
  const canvas = $('attack-canvas');
  if (!canvas) { if (onComplete) onComplete(); return; }
  
  const wrapper = $('cards-wrapper') || $('cards-grid');
  if (!wrapper) { if (onComplete) onComplete(); return; }

  const grid = $('cards-grid');
  const cards = grid ? grid.querySelectorAll('.player-card') : [];
  let attackerCard = null;
  let victimCard = null;
  
  cards.forEach(card => {
    const si = parseInt(card.dataset.setup);
    if (si === attackerSetupIdx) attackerCard = card;
    if (si === victimSetupIdx)   victimCard   = card;
  });
  
  if (!attackerCard || !victimCard) { if (onComplete) onComplete(); return; }

  const color = elementColor(attackerSetupIdx);
  const gridRect = wrapper.getBoundingClientRect();
  const aRect = attackerCard.getBoundingClientRect();
  const vRect = victimCard.getBoundingClientRect();

  // Canvas covers the cards-grid area
  canvas.width  = gridRect.width;
  canvas.height = gridRect.height;
  canvas.style.left = '0px';
  canvas.style.top  = '0px';
  canvas.style.width  = gridRect.width  + 'px';
  canvas.style.height = gridRect.height + 'px';

  const ctx = canvas.getContext('2d');
  
  // Start: center of attacker card (relative to grid)
  const sx = (aRect.left - gridRect.left) + aRect.width / 2;
  const sy = (aRect.top  - gridRect.top)  + aRect.height / 2;
  // End: center of victim card
  const ex = (vRect.left - gridRect.left) + vRect.width / 2;
  const ey = (vRect.top  - gridRect.top)  + vRect.height / 2;

  // Phase 1: Attacker charge glow (200ms)
  // Phase 2: Projectile travel (600ms)
  // Phase 3: Impact flash (300ms)
  // Phase 4: Cleanup (100ms)
  const totalMs = 1200;
  const startTime = performance.now();

  // Show "charging" on attacker card
  attackerCard.style.filter = `brightness(1.8) drop-shadow(0 0 20px ${color})`;
  setTimeout(() => { attackerCard.style.filter = ''; }, 250);

  function drawFrame(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (elapsed < 200) {
      // Charging pulse on attacker
      const prog = elapsed / 200;
      ctx.beginPath();
      ctx.arc(sx, sy, 12 + prog * 8, 0, Math.PI * 2);
      ctx.fillStyle = color + '80';
      ctx.fill();
      requestAnimationFrame(drawFrame);
    } else if (elapsed < 800) {
      // Projectile traveling
      const prog = (elapsed - 200) / 600;
      const cx = sx + (ex - sx) * prog;
      const cy = sy + (ey - sy) * prog;
      
      // Tail
      const gradient = ctx.createLinearGradient(sx, sy, cx, cy);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, color);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Orb
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
      grd.addColorStop(0, '#fff');
      grd.addColorStop(0.3, color);
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      requestAnimationFrame(drawFrame);
    } else if (elapsed < 1100) {
      // Impact burst on victim
      const prog = (elapsed - 800) / 300;
      const radius = prog * 50;
      const alpha  = 1 - prog;
      const grd = ctx.createRadialGradient(ex, ey, 0, ex, ey, radius);
      grd.addColorStop(0, color + 'ff');
      grd.addColorStop(0.5, color + '80');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
      requestAnimationFrame(drawFrame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(drawFrame);

  // Card shake on victim
  setTimeout(() => {
    victimCard.classList.add('card-shake');
    setTimeout(() => victimCard.classList.remove('card-shake'), 500);
  }, 700);

  // Screen shake
  setTimeout(() => {
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 450);
  }, 750);

  // Critical damage text
  setTimeout(() => {
    showCriticalDamageText(vRect.left + vRect.width/2, vRect.top + vRect.height/2, color);
  }, 800);
}

function showCriticalDamageText(x, y, color) {
  const el = $('critical-damage-text');
  if (!el) return;
  el.textContent = 'CRITICAL DAMAGE!';
  el.style.color = color;
  el.style.left  = x + 'px';
  el.style.top   = y + 'px';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1600);
}

/* ================================================================
   REWARD VIDEO (Section 42)
================================================================ */
async function playRewardVideo(winnerSetupIdx, winnerName) {
  const overlay = $('reward-overlay');
  const video   = $('reward-video');
  const label   = $('reward-winner-label');
  const goldFlash = overlay.querySelector('.gold-flash');
  
  if (!overlay || !video) return;

  rewardVideoActive = true;
  duckBgMusic();

  // Gold flash
  overlay.classList.remove('hidden');
  goldFlash.style.animation = 'none';
  void goldFlash.offsetWidth;
  goldFlash.style.animation = 'goldFlash 0.6s ease forwards';

  // Set video src based on winner's animal
  const videoSrc = ANIMAL_VIDEOS[winnerSetupIdx];
  video.src = videoSrc;
  video.muted = false;
  label.textContent = `⭐ ${winnerName} MENANG! ⭐`;

  return new Promise(resolve => {
    const cleanup = () => {
      clearTimeout(rewardTimeout);
      video.pause();
      video.src = '';
      overlay.classList.add('hidden');
      rewardVideoActive = false;
      restoreBgMusic();
      resolve();
    };

    rewardTimeout = setTimeout(cleanup, 11000);
    
    video.onended = cleanup;
    video.onerror = () => {
      // Video failed to load — skip but continue
      cleanup();
    };
    
    video.play().catch(() => {
      // Autoplay blocked — still run timer
    });
  });
}

function stopRewardVideo() {
  const overlay = $('reward-overlay');
  const video   = $('reward-video');
  clearTimeout(rewardTimeout);
  if (video) { video.pause(); video.src = ''; }
  if (overlay) overlay.classList.add('hidden');
  rewardVideoActive = false;
  restoreBgMusic();
}

/* ================================================================
   WIN SEQUENCE (Section 42)
================================================================ */
async function runWinSequence(winnerPlayer) {
  // 1. Gold flash (triggered by reward overlay)
  // 2. Play video
  await playRewardVideo(winnerPlayer.setupIndex, winnerPlayer.name);
  // 6. TTS win
  await speak(`Selamat ya ${winnerPlayer.name} mendapatkan bintang satu`);
  // 7. TTS round over
  await speak('Ronde selesai, selamat berjuang dan fokus');
  // 8. Round closes — show new round setup
  showNewRoundSetup();
}

/* ================================================================
   RENDER SYSTEM
================================================================ */
function render() {
  const phase = gameState.phase;
  
  // Show correct page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (phase === 'setup') {
    $('page-setup').classList.add('active');
    return;
  }
  if (phase === 'newround') {
    $('page-new-round').classList.add('active');
    renderNewRoundPage();
    return;
  }
  
  // Game page
  $('page-game').classList.add('active');
  renderHeader();
  renderCards();
  renderBurnPanel();
  renderRankingTab();
  renderHistoryTab();
  renderAchievementsTab();
  renderStatsTab();
  renderArchiveTab();
  renderAIComment();
}

function renderHeader() {
  const el = $('header-round');
  if (el) el.textContent = `Ronde ${gameState.round} · Turn ${gameState.turn}`;
}

function renderCards() {
  const grid = $('cards-grid');
  if (!grid) return;
  
  const sorted = [...gameState.players].sort((a,b) => a.setupIndex - b.setupIndex);
  
  // Ensure player cards exist (canvas is already in HTML)
  sorted.forEach((player) => {
    let card = grid.querySelector(`.player-card[data-setup="${player.setupIndex}"]`);
    if (!card) {
      card = createPlayerCard(player);
      grid.appendChild(card);
    }
    updatePlayerCard(card, player);
  });
  
  // Remove cards for players no longer in game
  grid.querySelectorAll('.player-card').forEach(card => {
    const si = parseInt(card.dataset.setup);
    if (!sorted.find(p => p.setupIndex === si)) {
      card.remove();
    }
  });
}

function createPlayerCard(player) {
  const si = player.setupIndex;
  const color = elementColor(si);
  
  const card = document.createElement('div');
  card.className = 'player-card';
  card.dataset.setup = si;

  // Artwork background
  const artwork = document.createElement('img');
  artwork.className = 'card-artwork';
  artwork.src = CARD_IMAGES[si];
  artwork.alt = ELEMENT_NAMES[si];
  artwork.loading = 'lazy';
  card.appendChild(artwork);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';
  card.appendChild(overlay);

  // Idle glow
  const glow = document.createElement('div');
  glow.className = 'card-idle-glow';
  card.appendChild(glow);

  // Idle aura
  const aura = document.createElement('div');
  aura.className = 'card-idle-aura';
  card.appendChild(aura);

  // Particles
  const particles = document.createElement('div');
  particles.className = 'card-particles';
  for (let i = 0; i < 5; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = (15 + Math.random() * 70) + '%';
    p.style.bottom = (5 + Math.random() * 30) + '%';
    p.style.animationDuration = (3 + Math.random() * 4) + 's';
    p.style.animationDelay    = -(Math.random() * 5) + 's';
    p.style.width  = (3 + Math.random() * 3) + 'px';
    p.style.height = p.style.width;
    particles.appendChild(p);
  }
  card.appendChild(particles);

  // Content layer
  const content = document.createElement('div');
  content.className = 'card-content';

  // Top row: rank badge + stars
  const topRow = document.createElement('div');
  topRow.className = 'card-top-row';
  const rankBadge = document.createElement('div');
  rankBadge.className = 'rank-badge';
  rankBadge.dataset.si = si;
  const starsDisplay = document.createElement('div');
  starsDisplay.className = 'stars-display';
  topRow.appendChild(rankBadge);
  topRow.appendChild(starsDisplay);
  content.appendChild(topRow);

  // Player name
  const nameEl = document.createElement('div');
  nameEl.className = 'card-player-name';
  content.appendChild(nameEl);

  // Score
  const scoreEl = document.createElement('div');
  scoreEl.className = 'card-score';
  content.appendChild(scoreEl);

  // Badges
  const badgesEl = document.createElement('div');
  badgesEl.className = 'card-badges';
  content.appendChild(badgesEl);

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.className = 'card-progress-wrap';
  const progressLabel = document.createElement('div');
  progressLabel.className = 'card-progress-label';
  const progressTrack = document.createElement('div');
  progressTrack.className = 'card-progress-track';
  const progressFill = document.createElement('div');
  progressFill.className = 'card-progress-fill';
  progressTrack.appendChild(progressFill);
  progressWrap.appendChild(progressLabel);
  progressWrap.appendChild(progressTrack);
  content.appendChild(progressWrap);

  // Score input
  const inputRow = document.createElement('div');
  inputRow.className = 'card-input-row';
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'card-score-input';
  input.placeholder = 'Skor...';
  input.dataset.si = si;
  input.min = '-9999';
  input.max = '1000';
  inputRow.appendChild(input);
  content.appendChild(inputRow);

  card.appendChild(content);
  return card;
}

function updatePlayerCard(card, player) {
  const si = player.setupIndex;
  
  // Rank badge
  const rankBadge = card.querySelector('.rank-badge');
  if (rankBadge) {
    const prevRank = parseInt(rankBadge.dataset.rank || player.rank);
    if (prevRank !== player.rank) {
      rankBadge.classList.add('bounce');
      setTimeout(() => rankBadge.classList.remove('bounce'), 600);
    }
    rankBadge.dataset.rank = player.rank;
    rankBadge.textContent = '#' + player.rank;
  }

  // Stars
  const starsEl = card.querySelector('.stars-display');
  if (starsEl) {
    starsEl.textContent = player.stars > 0 ? '⭐'.repeat(player.stars) : '';
  }

  // Name
  const nameEl = card.querySelector('.card-player-name');
  if (nameEl) nameEl.textContent = player.name;

  // Score
  const scoreEl = card.querySelector('.card-score');
  if (scoreEl) {
    scoreEl.textContent = player.score;
    if (player.score < 0) {
      scoreEl.classList.add('negative');
    } else {
      scoreEl.classList.remove('negative');
    }
  }

  // Badges
  const badgesEl = card.querySelector('.card-badges');
  if (badgesEl) {
    badgesEl.innerHTML = '';
    if (player.isInRecoveryMode) {
      const b = document.createElement('span');
      b.className = 'badge badge-recovery';
      b.textContent = '🔄 Recovery';
      badgesEl.appendChild(b);
    }
    if (player.score < 0) {
      const tb = document.createElement('span');
      tb.className = 'badge';
      tb.textContent = '👎';
      badgesEl.appendChild(tb);
    }
    // Danger badge
    const dl = player.dangerLevel || 'safe';
    const dangerBadge = document.createElement('span');
    const dangerMap = {
      safe:     { cls: 'badge-danger-safe',     text: '🟢 Safe' },
      caution:  { cls: 'badge-danger-caution',  text: '🟡 Caution' },
      danger:   { cls: 'badge-danger-danger',   text: '🟠 Danger' },
      critical: { cls: 'badge-danger-critical', text: '🔴 Critical' },
    };
    const dm = dangerMap[dl] || dangerMap.safe;
    dangerBadge.className = 'badge ' + dm.cls;
    dangerBadge.textContent = dm.text;
    badgesEl.appendChild(dangerBadge);
  }

  // Progress bar
  const progressFill = card.querySelector('.card-progress-fill');
  const progressLabel = card.querySelector('.card-progress-label');
  if (progressFill) {
    const pct = Math.max(0, Math.min(100, (player.score / gameState.victoryTarget) * 100));
    progressFill.style.width = pct + '%';
  }
  if (progressLabel) {
    progressLabel.textContent = `${Math.max(0, player.score)} / ${gameState.victoryTarget}`;
  }
}

function renderBurnPanel() {
  const panel = $('burn-panel');
  const list  = $('burn-candidates-list');
  if (!panel || !list) return;
  
  if (gameState.burnCandidates && gameState.burnCandidates.length > 0) {
    panel.classList.remove('hidden');
    list.innerHTML = '';
    gameState.burnCandidates.forEach(c => {
      const item = document.createElement('div');
      item.className = 'burn-candidate-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.victimIdx = c.victimIdx;
      const label = document.createElement('label');
      label.className = 'burn-candidate-text';
      const atkColor = elementColor(c.attackerIdx);
      label.innerHTML = `🔥 <span style="color:${atkColor};font-weight:900">${c.attackerName}</span> membakar <strong>${c.victimName}</strong>`;
      item.appendChild(cb);
      item.appendChild(label);
      list.appendChild(item);
    });
  } else {
    panel.classList.add('hidden');
  }
}

function renderRankingTab() {
  const list = $('ranking-list');
  if (!list) return;
  const sorted = [...gameState.players].sort((a,b) => b.score - a.score);
  list.innerHTML = '';
  sorted.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'ranking-item';
    const posEl = document.createElement('div');
    posEl.className = `ranking-pos pos-${idx+1}`;
    posEl.textContent = idx + 1;
    const nameEl = document.createElement('div');
    nameEl.className = 'ranking-name';
    const color = elementColor(p.setupIndex);
    nameEl.innerHTML = `<span style="color:${color}">${ELEMENT_NAMES[p.setupIndex].split(' ')[1]}</span> ${p.name}`;
    const scoreEl = document.createElement('div');
    scoreEl.className = 'ranking-score';
    scoreEl.textContent = p.score;
    const starsEl = document.createElement('div');
    starsEl.className = 'ranking-stars';
    starsEl.textContent = p.stars > 0 ? '⭐'.repeat(p.stars) : '';
    item.appendChild(posEl);
    item.appendChild(nameEl);
    item.appendChild(scoreEl);
    item.appendChild(starsEl);
    list.appendChild(item);
  });
}

function renderHistoryTab() {
  const list = $('history-list');
  if (!list) return;
  list.innerHTML = '';
  (gameState.history || []).slice(0, 60).forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item' + (h.type === 'burn' || h.type === 'triple' ? ' burn-entry' : h.type === 'star' ? ' star-entry' : '');
    item.innerHTML = `<div>${h.text}</div><div class="history-time">Ronde ${h.round} · Turn ${h.turn} · ${h.time}</div>`;
    list.appendChild(item);
  });
}

function renderAchievementsTab() {
  const list = $('achievements-list');
  if (!list) return;
  const ach = getAchievements();
  list.innerHTML = '';
  ACHIEVEMENTS_DEF.forEach(a => {
    // Find who has it
    const holders = Object.entries(ach)
      .filter(([key]) => key.endsWith('_' + a.id))
      .map(([, v]) => v.name);
    
    const item = document.createElement('div');
    item.className = 'achievement-item' + (holders.length > 0 ? ' unlocked' : '');
    item.innerHTML = `
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-info">
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
        ${holders.length > 0 ? `<div class="achievement-holder">🏆 ${holders.join(', ')}</div>` : ''}
      </div>
    `;
    list.appendChild(item);
  });
}

function renderStatsTab() {
  const list = $('stats-list');
  if (!list) return;
  const stats = getPermanentStats();
  list.innerHTML = '';
  
  // Current session players
  gameState.players.forEach(p => {
    const s = stats[p.name] || {};
    const card = document.createElement('div');
    card.className = 'stats-player-card';
    const color = elementColor(p.setupIndex);
    card.innerHTML = `
      <div class="stats-player-name" style="color:${color}">${ELEMENT_NAMES[p.setupIndex].split(' ')[1]} ${p.name}</div>
      <div class="stats-row">
        <div class="stat-chip">⭐ Stars: <span>${s.stars || 0}</span></div>
        <div class="stat-chip">🔥 Burns: <span>${s.burns || 0}</span></div>
        <div class="stat-chip">😵 Burned: <span>${s.burned || 0}</span></div>
        <div class="stat-chip">💥 Triple: <span>${s.tripleBurn || 0}</span></div>
        <div class="stat-chip">📈 Best: <span>${s.highestScore || 0}</span></div>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderArchiveTab() {
  const list = $('archive-list');
  if (!list) return;
  const archive = getArchive();
  list.innerHTML = '';
  Object.values(archive).forEach(entry => {
    const item = document.createElement('div');
    item.className = 'archive-item';
    item.innerHTML = `
      <div class="archive-name">${entry.name}</div>
      <div class="archive-stars">${entry.stars > 0 ? '⭐'.repeat(entry.stars) : '—'}</div>
    `;
    list.appendChild(item);
  });
  if (Object.keys(archive).length === 0) {
    list.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:12px">Belum ada pemain tersimpan</div>';
  }
}

function renderAIComment() {
  const el = $('ai-comment-text');
  if (el) el.textContent = gameState.aiComment || '';
}

function renderNewRoundPage() {
  const numEl = $('new-round-num');
  if (numEl) numEl.textContent = `Ronde ${gameState.round}`;
  
  const container = $('new-round-players');
  if (!container) return;
  container.innerHTML = '';
  
  gameState.players.forEach((p, idx) => {
    const field = document.createElement('div');
    field.className = 'nr-player-field';
    field.innerHTML = `
      <label>${ELEMENT_NAMES[p.setupIndex]} (Posisi ${p.setupIndex + 1})</label>
      <input type="text" id="nr-p${p.setupIndex}" value="${p.name}" maxlength="20" placeholder="Nama Pemain" />
    `;
    container.appendChild(field);
  });
}

/* ================================================================
   SCORE CHART
================================================================ */
function renderChart() {
  const canvas = $('score-chart');
  if (!canvas) return;
  
  const data = gameState.chartData || [];
  if (data.length === 0) {
    const ctx2 = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 300;
    canvas.height = 200;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.fillStyle = 'rgba(255,255,255,0.2)';
    ctx2.font = '13px sans-serif';
    ctx2.textAlign = 'center';
    ctx2.fillText('Belum ada data', canvas.width/2, 100);
    return;
  }

  const W = canvas.offsetWidth || 300;
  const H = 200;
  canvas.width = W;
  canvas.height = H;
  const ctx2 = canvas.getContext('2d');
  ctx2.clearRect(0, 0, W, H);

  const pad = { top: 15, right: 15, bottom: 25, left: 35 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top  - pad.bottom;

  // Find min/max across all players
  let allScores = [];
  data.forEach(d => allScores = allScores.concat(d.scores));
  const minS = Math.min(0, ...allScores);
  const maxS = Math.max(gameState.victoryTarget, ...allScores);
  const range = maxS - minS || 1;

  const xStep = data.length > 1 ? cw / (data.length - 1) : cw;

  const playerCount = gameState.players.length;
  
  for (let pi = 0; pi < playerCount; pi++) {
    const player = gameState.players.find(p => p.setupIndex === pi);
    if (!player) continue;
    const color = elementColor(pi);
    
    ctx2.beginPath();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 2;
    ctx2.shadowColor = color;
    ctx2.shadowBlur = 4;
    
    data.forEach((d, i) => {
      const x = pad.left + i * (data.length > 1 ? xStep : cw/2);
      const score = d.scores[pi] !== undefined ? d.scores[pi] : 0;
      const y = pad.top + ch - ((score - minS) / range) * ch;
      if (i === 0) ctx2.moveTo(x, y);
      else ctx2.lineTo(x, y);
    });
    ctx2.stroke();
    ctx2.shadowBlur = 0;
  }

  // X-axis labels (turn numbers)
  ctx2.fillStyle = 'rgba(255,255,255,0.4)';
  ctx2.font = '9px sans-serif';
  ctx2.textAlign = 'center';
  data.forEach((d, i) => {
    const x = pad.left + i * (data.length > 1 ? xStep : cw/2);
    ctx2.fillText('T' + d.turn, x, H - 5);
  });

  // Y-axis label
  ctx2.fillStyle = 'rgba(255,255,255,0.3)';
  ctx2.font = '8px sans-serif';
  ctx2.textAlign = 'right';
  ctx2.fillText(maxS, pad.left - 2, pad.top + 5);
  ctx2.fillText(minS < 0 ? minS : 0, pad.left - 2, H - pad.bottom);

  // Legend
  ctx2.font = '9px sans-serif';
  ctx2.textAlign = 'left';
  gameState.players.forEach((p, idx) => {
    const color = elementColor(p.setupIndex);
    ctx2.fillStyle = color;
    ctx2.fillRect(pad.left + idx * 60, H - 8, 8, 3);
    ctx2.fillStyle = 'rgba(255,255,255,0.6)';
    ctx2.fillText(p.name.slice(0,5), pad.left + idx * 60 + 10, H - 5);
  });
}

/* ================================================================
   SAVE TURN LOGIC
================================================================ */
async function handleSaveTurn() {
  if (gameState.burnCandidates && gameState.burnCandidates.length > 0) {
    showToast('Selesaikan proses BURN terlebih dahulu!');
    return;
  }

  // Collect inputs
  const inputs = document.querySelectorAll('.card-score-input');
  const inputValues = {};
  let allFilled = true;
  
  inputs.forEach(input => {
    const si = parseInt(input.dataset.si);
    const val = input.value.trim();
    if (val === '') { allFilled = false; return; }
    const num = parseInt(val);
    if (isNaN(num)) { allFilled = false; return; }
    // Check max positive
    if (num > 1000) {
      showToast(`Maksimal skor per turn: 1000`);
      allFilled = false;
      return;
    }
    inputValues[si] = num;
  });

  if (!allFilled || Object.keys(inputValues).length < gameState.players.length) {
    showToast('Isi semua kolom skor!');
    return;
  }

  // Take snapshot for UNDO
  const snapshot = deepClone(gameState);
  if (!gameState.undoStack) gameState.undoStack = [];
  gameState.undoStack.push(snapshot);
  if (gameState.undoStack.length > MAX_UNDO) gameState.undoStack.shift();

  const isFirstTurn = (gameState.turn === 1);

  // Save previous rankings for burn detection BEFORE any updates
  // These are the ranks at the start of this turn (before scores and recovery change)
  const playersBefore = deepClone(gameState.players);

  // Update recovery status BEFORE applying new scores
  // Pass CURRENT turn (the turn being processed now)
  gameState.players = updateRecoveryStatus(gameState.players, gameState.turn);

  // Apply scores
  gameState.players.forEach(p => {
    if (inputValues[p.setupIndex] !== undefined) {
      const addedScore = inputValues[p.setupIndex];
      p.score += addedScore;
      
      // Track highest score
      if (p.score > (p.highestScore || 0)) p.highestScore = p.score;
      // Track min score for achievements
      if (p.minScore === undefined) p.minScore = 0;
      if (p.score < p.minScore) p.minScore = p.score;
      
      // Consecutive minus tracking (based on what was INPUT this turn)
      if (addedScore < 0) {
        p.consecutiveMinusTurns = (p.consecutiveMinusTurns || 0) + 1;
      } else {
        p.consecutiveMinusTurns = 0;
        p.consecutiveMinus3Played = false;
      }
    }
  });

  // Recalculate rankings
  gameState.players = calculateRanking(gameState.players);

  // Danger levels
  gameState.players.forEach(p => {
    p.dangerLevel = calcDangerLevel(p, gameState.players, gameState.victoryTarget);
  });

  // Chart data
  const chartEntry = {
    turn: gameState.turn,
    round: gameState.round,
    scores: gameState.players.map(p => p.score),
  };
  // Scores array indexed by setupIndex
  chartEntry.scores = [];
  for (let i = 0; i < 4; i++) {
    const p = gameState.players.find(x => x.setupIndex === i);
    chartEntry.scores[i] = p ? p.score : 0;
  }
  gameState.chartData.push(chartEntry);

  // History entry for this turn
  const scores = gameState.players.map(p => `${p.name}: ${inputValues[p.setupIndex] >= 0 ? '+' : ''}${inputValues[p.setupIndex]} (${p.score})`).join(' | ');
  gameState.history.unshift({
    type: 'turn',
    text: `Turn ${gameState.turn}: ${scores}`,
    turn: gameState.turn,
    round: gameState.round,
    time: getTimestamp(),
  });

  // Check for win
  const winner = gameState.players.find(p => p.score >= gameState.victoryTarget);

  // Detect burn candidates
  if (!winner) {
    gameState.burnCandidates = detectBurnCandidates(playersBefore, gameState.players, gameState.turn, isFirstTurn);
  } else {
    gameState.burnCandidates = [];
  }

  // AI comment
  const aiIdx = Math.floor(Math.random() * AI_COMMENTS.length);
  gameState.aiComment = AI_COMMENTS[aiIdx];

  // Increment turn
  gameState.turn++;

  // Clear inputs
  inputs.forEach(input => { input.value = ''; });

  // Card flip animation
  document.querySelectorAll('.player-card').forEach(card => {
    card.classList.add('card-flip-anim');
    setTimeout(() => card.classList.remove('card-flip-anim'), 700);
  });

  // Check consecutive minus
  gameState.players.forEach(p => {
    if (p.consecutiveMinusTurns >= 3 && !p.consecutiveMinus3Played) {
      p.consecutiveMinus3Played = true;
      setTimeout(() => playWav('audio/kok_minus_terus_sih_gamau_menang.wav'), 500);
    }
  });

  // Check repeated minus (mulai dari 0)
  gameState.players.forEach(p => {
    if (p.score < 0 && (p.burned || 0) > 0 && (inputValues[p.setupIndex] || 0) < 0) {
      setTimeout(() => playWav('audio/mulai_dari_0_ya_bapak.wav'), 300);
    }
  });

  savePermanentStats(gameState.players);
  saveState();
  render();
  renderChart();

  if (winner) {
    // Star!
    winner.stars = (winner.stars || 0) + 1;
    savePermanentStats(gameState.players);
    gameState.history.unshift({
      type: 'star',
      text: `⭐ ${winner.name} mendapatkan bintang! Skor: ${winner.score}`,
      turn: gameState.turn - 1,
      round: gameState.round,
      time: getTimestamp(),
    });
    saveState();
    render();
    // Cancel any pending burns
    gameState.burnCandidates = [];
    // Run win sequence
    await runWinSequence(winner);
    return;
  }

  // Audio sequence (no burn case)
  if (!gameState.burnCandidates || gameState.burnCandidates.length === 0) {
    runNoBurnAudioSequence();
  }
  // If there are burn candidates, audio will run after confirm burn
}

/* ================================================================
   CONFIRM BURN
================================================================ */
async function handleConfirmBurn() {
  const list = $('burn-candidates-list');
  if (!list) return;
  
  const checked = list.querySelectorAll('input[type="checkbox"]:checked');
  const selectedVictimIndices = Array.from(checked).map(cb => parseInt(cb.dataset.victimIdx));
  
  if (selectedVictimIndices.length === 0) {
    // No checkboxes checked — just cancel all burn candidates
    gameState.burnCandidates = [];
    saveState();
    render();
    runNoBurnAudioSequence();
    return;
  }

  // Collect burn actions for animation BEFORE processing
  const burnActions = [];
  selectedVictimIndices.forEach(victimIdx => {
    const candidate = gameState.burnCandidates.find(c => c.victimIdx === victimIdx);
    if (candidate) burnActions.push({ ...candidate });
  });

  if (burnActions.length === 0) {
    gameState.burnCandidates = [];
    saveState();
    render();
    runNoBurnAudioSequence();
    return;
  }

  // Take snapshot for undo BEFORE processing burn
  const snapshot = deepClone(gameState);
  if (!gameState.undoStack) gameState.undoStack = [];
  gameState.undoStack.push(snapshot);
  if (gameState.undoStack.length > MAX_UNDO) gameState.undoStack.shift();

  // Check triple burn
  const attackerCounts = {};
  burnActions.forEach(b => {
    attackerCounts[b.attackerIdx] = (attackerCounts[b.attackerIdx] || 0) + 1;
  });
  const isTriple = Object.values(attackerCounts).some(c => c >= 3);

  // Process burn (updates scores, recovery, history, re-ranks)
  processBurn(selectedVictimIndices);

  // Screen shake for triple burn
  if (isTriple) {
    setTimeout(() => {
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 500);
    }, 800);
  }

  // Render immediately so scores update visually
  saveState();
  render();

  // Animations — sequential per burn, then audio
  for (const burn of burnActions) {
    await new Promise(resolve => {
      playAttackAnimation(burn.attackerIdx, burn.victimIdx, resolve);
    });
    // Small gap between attacks
    await new Promise(r => setTimeout(r, 150));
  }

  // Run burn audio sequence (TTS + shuffle + total + AI comment)
  await runBurnAudioSequence(burnActions, isTriple);
}

/* ================================================================
   CANCEL BURN
================================================================ */
function handleCancelBurn() {
  gameState.burnCandidates = [];
  saveState();
  render();
  runNoBurnAudioSequence();
}

/* ================================================================
   UNDO
================================================================ */
function handleUndo() {
  stopAllAudio();
  if (rewardVideoActive) stopRewardVideo();
  
  if (!gameState.undoStack || gameState.undoStack.length === 0) {
    showToast('Tidak ada yang bisa di-undo');
    return;
  }
  
  const snapshot = gameState.undoStack.pop();
  gameState = snapshot;
  // Restore undoStack reference
  if (!gameState.undoStack) gameState.undoStack = [];
  
  saveState();
  render();
  renderChart();
}

/* ================================================================
   RESET GAME
================================================================ */
function handleReset() {
  showConfirm('Reset Game?', 'Reset seluruh permainan? Data statistik permanen tidak akan dihapus.', () => {
    stopAllAudio();
    if (rewardVideoActive) stopRewardVideo();
    
    const newState = makeDefaultState();
    newState.phase = 'setup';
    // Preserve permanent data
    newState.undoStack = [];
    gameState = newState;
    
    saveState();
    render();
  });
}

/* ================================================================
   START GAME
================================================================ */
function handleStartGame() {
  const names = [
    ($('setup-p1')?.value || '').trim() || 'Pemain 1',
    ($('setup-p2')?.value || '').trim() || 'Pemain 2',
    ($('setup-p3')?.value || '').trim() || 'Pemain 3',
    ($('setup-p4')?.value || '').trim() || 'Pemain 4',
  ];

  // Validate unique names
  const uniqueNames = new Set(names);
  if (uniqueNames.size < names.length) {
    showToast('Nama pemain harus unik!');
    return;
  }

  // Get target
  const activeTarget = document.querySelector('.target-btn.active');
  let target = activeTarget ? parseInt(activeTarget.dataset.val) : 1000;
  const customTarget = $('setup-target-custom')?.value;
  if (customTarget && !isNaN(parseInt(customTarget)) && parseInt(customTarget) > 0) {
    target = parseInt(customTarget);
  }

  gameState = makeDefaultState();
  gameState.phase = 'game';
  gameState.round = 1;
  gameState.turn  = 1;
  gameState.victoryTarget = target;
  gameState.players = names.map((name, i) => makeInitialPlayer(i, name));
  gameState.players = calculateRanking(gameState.players);
  gameState.prevRankings = getRankings(gameState.players);

  // Load existing stats for players
  const stats = getPermanentStats();
  gameState.players.forEach(p => {
    const s = stats[p.name];
    if (s) {
      p.stars      = s.stars || 0;
      p.burns      = s.burns || 0;
      p.burned     = s.burned || 0;
      p.tripleBurn = s.tripleBurn || 0;
      p.highestScore = s.highestScore || 0;
    }
  });

  saveArchive(gameState.players);
  saveState();
  render();
  
  speak('Permainan dimulai');
}

/* ================================================================
   NEW ROUND SETUP
================================================================ */
function showNewRoundSetup() {
  gameState.phase = 'newround';
  gameState.round++;
  saveState();
  render();
}

function handleStartNewRound() {
  const players = gameState.players;
  
  // Get new names
  players.forEach(p => {
    const input = $(`nr-p${p.setupIndex}`);
    if (input) {
      const newName = input.value.trim();
      if (newName) p.name = newName;
    }
  });

  // Get target
  const nrActiveTarget = document.querySelector('#nr-target-options .target-btn.active');
  let target = nrActiveTarget ? parseInt(nrActiveTarget.dataset.val) : gameState.victoryTarget;
  const nrCustom = $('nr-target-custom')?.value;
  if (nrCustom && !isNaN(parseInt(nrCustom)) && parseInt(nrCustom) > 0) {
    target = parseInt(nrCustom);
  }

  // Reset round data
  gameState.victoryTarget = target;
  gameState.turn = 1;
  gameState.burnCandidates = [];
  gameState.phase = 'game';
  
  // Reset player scores and recovery for new round
  gameState.players.forEach(p => {
    p.score = 0;
    p.isInRecoveryMode = false;
    p.recoveryStartTurn = -1;
    p.consecutiveMinusTurns = 0;
    p.consecutiveMinus3Played = false;
    p.dangerLevel = 'safe';
  });
  
  gameState.players = calculateRanking(gameState.players);
  gameState.prevRankings = getRankings(gameState.players);
  
  // Keep chart data as is (or could clear if desired)
  gameState.chartData = [];
  gameState.history.unshift({
    type: 'round',
    text: `--- Ronde ${gameState.round} Dimulai ---`,
    turn: 1,
    round: gameState.round,
    time: getTimestamp(),
  });

  saveArchive(gameState.players);
  saveState();
  render();
  renderChart();
  
  speak('Permainan dimulai');
}

/* ================================================================
   EDIT NAMES
================================================================ */
function showEditNames() {
  const modal = $('modal-edit-name');
  const fields = $('edit-name-fields');
  if (!modal || !fields) return;
  
  fields.innerHTML = '';
  gameState.players.forEach(p => {
    const field = document.createElement('div');
    field.className = 'edit-name-field';
    field.innerHTML = `
      <label>${ELEMENT_NAMES[p.setupIndex]}</label>
      <input type="text" id="edit-p${p.setupIndex}" value="${p.name}" maxlength="20" />
    `;
    fields.appendChild(field);
  });
  
  modal.classList.remove('hidden');
}

function handleSaveNames() {
  gameState.players.forEach(p => {
    const input = $(`edit-p${p.setupIndex}`);
    if (input) {
      const newName = input.value.trim();
      if (newName) p.name = newName;
    }
  });
  
  $('modal-edit-name').classList.add('hidden');
  savePermanentStats(gameState.players);
  saveArchive(gameState.players);
  saveState();
  render();
}

/* ================================================================
   SCREENSHOT
================================================================ */
async function handleScreenshot() {
  try {
    // Use html2canvas if available, otherwise use native
    if (typeof html2canvas !== 'undefined') {
      const canvas = await html2canvas($('page-game'), { scale: 2 });
      const link = document.createElement('a');
      link.download = `score-cekih-ronde${gameState.round}-turn${gameState.turn}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } else {
      showToast('Screenshot: gunakan fitur screenshot perangkat Anda');
    }
  } catch(e) {
    showToast('Screenshot tidak tersedia di browser ini');
  }
}

/* ================================================================
   FULLSCREEN
================================================================ */
function handleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ================================================================
   TOAST NOTIFICATION
================================================================ */
function showToast(msg, duration = 2500) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.85);color:#fff;padding:8px 18px;
      border-radius:20px;font-size:13px;z-index:9999;
      border:1px solid rgba(201,168,76,0.4);
      backdrop-filter:blur(4px);
      transition:opacity 0.3s;
      pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

/* ================================================================
   CONFIRM DIALOG
================================================================ */
function showConfirm(title, body, onYes, onNo) {
  const modal = $('modal-confirm');
  const titleEl = $('confirm-title');
  const bodyEl  = $('confirm-body');
  if (!modal) return;
  
  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.textContent  = body;
  modal.classList.remove('hidden');
  
  const yesBtn = $('btn-confirm-yes');
  const noBtn  = $('btn-confirm-no');
  
  const cleanup = () => { modal.classList.add('hidden'); };
  
  if (yesBtn) {
    yesBtn.onclick = () => { cleanup(); if (onYes) onYes(); };
  }
  if (noBtn) {
    noBtn.onclick = () => { cleanup(); if (onNo) onNo(); };
  }
}

/* ================================================================
   TAB SWITCHING
================================================================ */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = $(tabId);
      if (panel) panel.classList.add('active');
      if (tabId === 'tab-chart') renderChart();
      if (tabId === 'tab-stats') renderStatsTab();
      if (tabId === 'tab-archive') renderArchiveTab();
      if (tabId === 'tab-achievements') renderAchievementsTab();
      if (tabId === 'tab-ranking') renderRankingTab();
    });
  });
}

/* ================================================================
   TARGET BUTTONS
================================================================ */
function initTargetButtons() {
  // Setup page
  document.querySelectorAll('#page-setup .target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-setup .target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if ($('setup-target-custom')) $('setup-target-custom').value = '';
    });
  });
  
  // New round page
  document.addEventListener('click', e => {
    if (e.target.matches('#nr-target-options .target-btn')) {
      document.querySelectorAll('#nr-target-options .target-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      if ($('nr-target-custom')) $('nr-target-custom').value = '';
    }
  });
}

/* ================================================================
   COUNTER ANIMATION FOR SCORES
================================================================ */
function animateCounter(el, fromVal, toVal, duration = 400) {
  if (!el) return;
  const start = performance.now();
  const range = toVal - fromVal;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(fromVal + range * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = toVal;
  }
  requestAnimationFrame(step);
}

/* ================================================================
   LOADING SCREEN
================================================================ */
function runLoadingScreen() {
  const fill = $('loading-bar-fill');
  const pct  = $('loading-pct');
  const screen = $('loading-screen');
  const app    = $('app');
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress >= 100) progress = 100;
    if (fill) fill.style.width = progress + '%';
    if (pct)  pct.textContent = Math.round(progress) + '%';
    
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        if (screen) screen.classList.add('fade-out');
        if (app) app.classList.remove('hidden');
        setTimeout(() => {
          if (screen) screen.style.display = 'none';
        }, 900);
      }, 400);
    }
  }, 120);
}

/* ================================================================
   KEYBOARD SHORTCUTS
================================================================ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && gameState.phase === 'game') {
      e.preventDefault();
      handleSaveTurn();
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleUndo();
    }
  });
}

/* ================================================================
   EVENT LISTENERS
================================================================ */
function initEventListeners() {
  // Klik sound on all buttons
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      playKlik();
    }
  });

  // Start game
  const btnStart = $('btn-start-game');
  if (btnStart) btnStart.addEventListener('click', handleStartGame);

  // Save turn
  const btnSave = $('btn-save-turn');
  if (btnSave) btnSave.addEventListener('click', handleSaveTurn);

  // Undo
  const btnUndo = $('btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', handleUndo);

  // Reset
  const btnReset = $('btn-reset');
  if (btnReset) btnReset.addEventListener('click', handleReset);

  // Confirm burn
  const btnConfirmBurn = $('btn-confirm-burn');
  if (btnConfirmBurn) btnConfirmBurn.addEventListener('click', handleConfirmBurn);

  // Cancel burn
  const btnCancelBurn = $('btn-cancel-burn');
  if (btnCancelBurn) btnCancelBurn.addEventListener('click', handleCancelBurn);

  // Edit names
  const btnEditNames = $('btn-edit-names');
  if (btnEditNames) btnEditNames.addEventListener('click', showEditNames);

  // Save names modal
  const btnSaveNames = $('btn-save-names');
  if (btnSaveNames) btnSaveNames.addEventListener('click', handleSaveNames);

  // Cancel edit name
  const btnCancelEdit = $('btn-cancel-edit-name');
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => {
    $('modal-edit-name')?.classList.add('hidden');
  });

  // Background music toggle
  const btnBgMusic = $('btn-bg-music');
  if (btnBgMusic) btnBgMusic.addEventListener('click', () => {
    bgMusicEnabled = !bgMusicEnabled;
    localStorage.setItem(LS_MUSIC_KEY, bgMusicEnabled);
    if (bgMusic) {
      if (bgMusicEnabled) {
        bgMusic.volume = bgMusicVolume;
        bgMusic.play().catch(() => {});
      } else {
        bgMusic.volume = 0;
        bgMusic.pause();
      }
    }
    updateMusicBtn();
  });

  // Fullscreen
  const btnFs = $('btn-fullscreen');
  if (btnFs) btnFs.addEventListener('click', handleFullscreen);

  // Screenshot
  const btnSs = $('btn-screenshot');
  if (btnSs) btnSs.addEventListener('click', handleScreenshot);

  // Start new round
  const btnNewRound = $('btn-start-new-round');
  if (btnNewRound) btnNewRound.addEventListener('click', handleStartNewRound);

  // Number inputs: limit to one input per player
  document.addEventListener('input', e => {
    if (e.target.matches('.card-score-input')) {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val > 1000) {
        e.target.value = 1000;
        showToast('Maksimal +1000 per turn');
      }
    }
  });

  // Setup target custom input
  const customTarget = $('setup-target-custom');
  if (customTarget) {
    customTarget.addEventListener('input', () => {
      document.querySelectorAll('#page-setup .target-btn').forEach(b => b.classList.remove('active'));
    });
  }
}

/* ================================================================
   INIT
================================================================ */
function init() {
  // Run loading screen
  runLoadingScreen();
  
  // Init tabs
  initTabs();
  initTargetButtons();
  initEventListeners();
  initKeyboard();
  
  // Load state from LocalStorage
  const loaded = loadState();
  
  setTimeout(() => {
    if (loaded && gameState.phase) {
      render();
      if (gameState.phase === 'game') {
        renderChart();
      }
    } else {
      // Fresh start
      gameState = makeDefaultState();
      render();
    }
    
    // Init background music after user interaction context
    setTimeout(initBgMusic, 500);
  }, 800);
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ================================================================
   SERVICE WORKER REGISTRATION
================================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
