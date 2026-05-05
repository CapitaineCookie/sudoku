'use strict';

// ── Sound manager ─────────────────────────────────────────────────────────────

class SoundManager {
  constructor() {
    this.enabled = localStorage.getItem('sound') !== 'false';
    this.ctx = null;
    this.active = new Map();
  }

  get context() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq, type, start, duration, gain = 0.22) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.01);
  }

  play(type, freq = null) {
    if (!this.enabled) return;
    const maxConcurrent = { correct: 2, error: 1, erase: 1, hint: 1, win: 1, lose: 1 };
    const count = this.active.get(type) || 0;
    if (count >= (maxConcurrent[type] ?? 1)) return;
    const durations = { correct: 75, error: 200, erase: 80, hint: 300, win: 700, lose: 700 };
    this.active.set(type, count + 1);
    setTimeout(() => this.active.set(type, (this.active.get(type) || 1) - 1), durations[type] ?? 200);
    try {
      switch (type) {
        case 'correct': this.tone(freq ?? 380, 'sine', 0, 0.15); break;
        case 'error':   this.tone(180, 'triangle', 0,    0.2,  0.15); break;
        case 'erase':   this.tone(380, 'sine',     0,    0.07, 0.12); break;
        case 'hint':
          this.tone(600, 'sine', 0,    0.12);
          this.tone(900, 'sine', 0.12, 0.15);
          break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) =>
            this.tone(f, 'sine', i * 0.15, 0.25)
          );
          break;
        case 'lose':
          [523, 440, 349, 262].forEach((f, i) =>
            this.tone(f, 'sine', i * 0.15, 0.25)
          );
          break;
      }
    } catch {}
  }
}

// ── Puzzle generator ──────────────────────────────────────────────────────────

class SudokuGenerator {
  static shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  static createSolvedGrid() {
    const base = [
      [1,2,3,4,5,6,7,8,9],
      [4,5,6,7,8,9,1,2,3],
      [7,8,9,1,2,3,4,5,6],
      [2,3,4,5,6,7,8,9,1],
      [5,6,7,8,9,1,2,3,4],
      [8,9,1,2,3,4,5,6,7],
      [3,4,5,6,7,8,9,1,2],
      [6,7,8,9,1,2,3,4,5],
      [9,1,2,3,4,5,6,7,8],
    ];
    const perm = this.shuffle([1,2,3,4,5,6,7,8,9]);
    let g = base.map(row => row.map(n => perm[n - 1]));

    for (let b = 0; b < 3; b++) {
      const [i0, i1, i2] = this.shuffle([0, 1, 2]);
      const rows = [g[b*3+i0], g[b*3+i1], g[b*3+i2]];
      g[b*3] = rows[0]; g[b*3+1] = rows[1]; g[b*3+2] = rows[2];
    }
    for (let s = 0; s < 3; s++) {
      const [j0, j1, j2] = this.shuffle([0, 1, 2]);
      for (let r = 0; r < 9; r++) {
        const orig = [...g[r]];
        g[r][s*3]   = orig[s*3+j0];
        g[r][s*3+1] = orig[s*3+j1];
        g[r][s*3+2] = orig[s*3+j2];
      }
    }
    const [b0, b1, b2] = this.shuffle([0, 1, 2]);
    g = [...g.slice(b0*3, b0*3+3), ...g.slice(b1*3, b1*3+3), ...g.slice(b2*3, b2*3+3)];
    const [s0, s1, s2] = this.shuffle([0, 1, 2]);
    g = g.map(row => [
      row[s0*3], row[s0*3+1], row[s0*3+2],
      row[s1*3], row[s1*3+1], row[s1*3+2],
      row[s2*3], row[s2*3+1], row[s2*3+2],
    ]);
    return g;
  }

  static isValid(g, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (g[row][i] === num || g[i][col] === num) return false;
    }
    const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
    for (let r = br; r < br+3; r++)
      for (let c = bc; c < bc+3; c++)
        if (g[r][c] === num) return false;
    return true;
  }

  static countSolutions(g) {
    let count = 0;
    const solve = () => {
      let er = -1, ec = -1;
      outer: for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (!g[r][c]) { er = r; ec = c; break outer; }
      if (er === -1) { count++; return count > 1; }
      for (let n = 1; n <= 9; n++) {
        if (this.isValid(g, er, ec, n)) {
          g[er][ec] = n;
          if (solve()) return true;
          g[er][ec] = 0;
        }
      }
      return false;
    };
    solve();
    return count;
  }

  static generate(difficulty) {
    const solution = this.createSolvedGrid();
    const puzzle = solution.map(r => [...r]);
    const clues = { easy: 36, medium: 28, hard: 22 }[difficulty];
    const positions = this.shuffle([...Array(81).keys()]);
    let removed = 0;
    for (const pos of positions) {
      if (removed >= 81 - clues) break;
      const r = Math.floor(pos / 9), c = pos % 9;
      const val = puzzle[r][c];
      puzzle[r][c] = 0;
      if (this.countSolutions(puzzle.map(row => [...row])) === 1) {
        removed++;
      } else {
        puzzle[r][c] = val;
      }
    }
    return { puzzle, solution };
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('themeColor').content = dark ? '#111827' : '#3b5bdb';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  const toggle = document.getElementById('darkToggle');
  if (toggle) toggle.checked = dark;
}

// ── Game ──────────────────────────────────────────────────────────────────────

class SudokuGame {
  constructor() {
    this.difficulty = 'easy';
    this.cellEls = new Array(81);
    this.selected = null;
    this.notesMode = false;
    this.settings = {
      showHints:      localStorage.getItem('showHints')      === 'true',
      showTimer:      localStorage.getItem('showTimer')      !== 'false',
      countMistakes:  localStorage.getItem('countMistakes')  !== 'false',
    };
    this.sound = new SoundManager();

    this.bindDOM();
    if (!this.restoreState()) this.newGame();
    this.registerSW();
  }

  bindDOM() {
    this.boardEl    = document.getElementById('board');
    this.timerEl    = document.getElementById('timer');
    this.mistakesEl = document.getElementById('mistakes');
    this.notesBtn   = document.getElementById('notesBtn');
    this.winOverlay = document.getElementById('winOverlay');
    this.winTimeEl  = document.getElementById('winTime');

    // Init theme (syncs checkbox too)
    applyTheme(document.documentElement.classList.contains('dark'));

    // ── New Game button ───────────────────────────────────────────────────────
    document.getElementById('newGameBtn').addEventListener('click', () => this.openNewGameModal());

    document.getElementById('modalCancel').addEventListener('click', () => {
      document.getElementById('newGameModal').hidden = true;
    });
    document.getElementById('newGameModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.hidden = true;
    });
    document.querySelectorAll('.diff-card').forEach(card =>
      card.addEventListener('click', () => {
        this.difficulty = card.dataset.difficulty;
        document.getElementById('newGameModal').hidden = true;
        this.newGame();
      })
    );

    // ── Win overlay ───────────────────────────────────────────────────────────
    document.getElementById('winNewGame').addEventListener('click', () => {
      this.winOverlay.hidden = true;
    });
    document.getElementById('gameOverNewGame').addEventListener('click', () => {
      document.getElementById('gameOverOverlay').hidden = true;
    });

    // ── Gear / settings popover ───────────────────────────────────────────────
    const popover = document.getElementById('settingsPopover');
    document.getElementById('gearBtn').addEventListener('click', e => {
      e.stopPropagation();
      popover.hidden = !popover.hidden;
    });
    document.addEventListener('click', () => { popover.hidden = true; });
    popover.addEventListener('click', e => e.stopPropagation());

    document.getElementById('darkToggle').addEventListener('change', e => applyTheme(e.target.checked));
    document.getElementById('soundToggle').addEventListener('change', e => {
      this.sound.enabled = e.target.checked;
      localStorage.setItem('sound', e.target.checked);
    });

    document.getElementById('hintsToggle').addEventListener('change', e => {
      this.settings.showHints = e.target.checked;
      localStorage.setItem('showHints', e.target.checked);
      this.applySettings();
    });
    document.getElementById('timerToggle').addEventListener('change', e => {
      this.settings.showTimer = e.target.checked;
      localStorage.setItem('showTimer', e.target.checked);
      this.applySettings();
    });
    document.getElementById('mistakesToggle').addEventListener('change', e => {
      this.settings.countMistakes = e.target.checked;
      localStorage.setItem('countMistakes', e.target.checked);
      this.applySettings();
    });

    // ── Controls ──────────────────────────────────────────────────────────────
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('eraseBtn').addEventListener('click', () => this.erase());
    this.notesBtn.addEventListener('click', () => this.toggleNotes());
    document.getElementById('hintBtn').addEventListener('click', () => this.hint());

    document.querySelectorAll('.num-btn').forEach(btn =>
      btn.addEventListener('click', () => this.enterNumber(+btn.dataset.num))
    );

    document.addEventListener('keydown', e => this.handleKey(e));
    window.addEventListener('beforeunload', () => this.saveState());
  }

  openNewGameModal() {
    document.getElementById('modalWarning').hidden = this.complete || this.seconds === 0;
    document.getElementById('newGameModal').hidden = false;
  }

  applySettings() {
    document.getElementById('hintBtn').style.display = this.settings.showHints ? '' : 'none';
    this.timerEl.style.visibility = this.settings.showTimer ? '' : 'hidden';
    this.mistakesEl.style.display = this.settings.countMistakes ? '' : 'none';
    document.getElementById('hintsToggle').checked    = this.settings.showHints;
    document.getElementById('timerToggle').checked    = this.settings.showTimer;
    document.getElementById('mistakesToggle').checked = this.settings.countMistakes;
    document.getElementById('soundToggle').checked    = this.sound.enabled;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  newGame() {
    this.stopTimer();
    const { puzzle, solution } = SudokuGenerator.generate(this.difficulty);
    this.solution = solution;
    this.board    = puzzle.map(r => [...r]);
    this.given    = puzzle.map(r => r.map(v => v !== 0));
    this.notes    = Array.from({length: 9}, () => Array.from({length: 9}, () => new Set()));
    this.history  = [];
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.seconds  = 0;
    this.complete = false;
    this.selected = null;
    this.notesMode = false;
    this.notesBtn.classList.remove('active');
    this.updateMistakesDisplay();
    document.getElementById('currentDiff').textContent =
      this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1);
    this.buildBoard(true);
    this.updateNumpad();
    this.applySettings();
    this.startTimer();
    this.saveState();
  }

  startTimer() {
    const tick = () => {
      const m = Math.floor(this.seconds / 60);
      const s = String(this.seconds % 60).padStart(2, '0');
      this.timerEl.textContent = `${m}:${s}`;
    };
    tick();
    this.timerInterval = setInterval(() => { this.seconds++; tick(); }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  // ── Board ───────────────────────────────────────────────────────────────────

  buildBoard(animate = false) {
    this.boardEl.innerHTML = '';
    const boxes = Array.from({length: 9}, () => {
      const box = document.createElement('div');
      box.className = 'box';
      this.boardEl.appendChild(box);
      return box;
    });
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const bi = Math.floor(r/3)*3 + Math.floor(c/3);
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.row = r;
        el.dataset.col = c;
        el.addEventListener('click', () => this.selectCell(r, c));
        boxes[bi].appendChild(el);
        this.cellEls[r*9+c] = el;
      }
    }
    this.updateBoard();
    if (animate) {
      let i = 0;
      const totalGiven = this.given.flat().filter(Boolean).length;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (!this.given[r][c]) continue;
          const span = this.cellEls[r*9+c].querySelector('span');
          if (!span) continue;
          const delay = i * 18;
          span.style.animationDelay = `${delay}ms`;
          span.classList.add('num-appear');
          span.addEventListener('animationend', () => {
            span.classList.remove('num-appear');
            span.style.animationDelay = '';
          }, { once: true });
          const freq = Math.round(300 + (i / Math.max(totalGiven - 1, 1)) * 280);
          if (i % 3 === 0) setTimeout(() => this.sound.play('correct', freq), delay);
          i++;
        }
      }
    }
  }

  updateBoard() {
    const sel = this.selected;
    const selVal = sel ? this.board[sel.row][sel.col] : 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        this.refreshCell(r, c, sel, selVal);
  }

  refreshCell(r, c, sel, selVal) {
    const el  = this.cellEls[r*9+c];
    const val = this.board[r][c];
    const notes = this.notes[r][c];

    let cls = 'cell';
    if (sel) {
      if (r === sel.row && c === sel.col) {
        cls += ' selected';
      } else {
        const isPeer = r === sel.row || c === sel.col ||
          (Math.floor(r/3) === Math.floor(sel.row/3) && Math.floor(c/3) === Math.floor(sel.col/3));
        if (isPeer) {
          cls += (selVal && val === selVal) ? ' same-val' : ' peer';
        } else if (selVal && val === selVal) {
          cls += ' same-val';
        }
      }
    }

    if (this.given[r][c])                          cls += ' given';
    else if (val && val !== this.solution[r][c])   cls += ' error';
    else if (val)                                  cls += ' user-filled';

    el.className = cls;

    if (val) {
      el.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = val;
      el.appendChild(span);
    } else if (notes.size) {
      el.innerHTML = '';
      const ng = document.createElement('div');
      ng.className = 'notes-grid';
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement('span');
        span.className = 'note' + (notes.has(n) && selVal && n === selVal ? ' note-highlight' : '');
        span.textContent = notes.has(n) ? n : '';
        ng.appendChild(span);
      }
      el.appendChild(ng);
    } else {
      el.textContent = '';
    }
  }

  selectCell(row, col) {
    this.selected = { row, col };
    this.updateBoard();
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  enterNumber(num) {
    if (!this.selected || this.complete) return;
    const { row: r, col: c } = this.selected;
    if (this.given[r][c]) return;

    this.history.push({ r, c, val: this.board[r][c], notes: new Set(this.notes[r][c]) });

    if (this.notesMode) {
      const ns = this.notes[r][c];
      ns.has(num) ? ns.delete(num) : ns.add(num);
      this.board[r][c] = 0;
      this.sound.play('erase');
    } else {
      if (this.board[r][c] === num) {
        this.board[r][c] = 0;
        this.sound.play('erase');
      } else {
        const wasWrong = this.board[r][c] !== 0 && this.board[r][c] !== this.solution[r][c];
        this.board[r][c] = num;
        if (num !== this.solution[r][c] && !wasWrong) {
          this.mistakes++;
          this.updateMistakesDisplay();
          this.sound.play('error');
          if (this.mistakes >= 3 && this.settings.countMistakes) {
            this.updateBoard();
            setTimeout(() => this.gameOver(), 200);
            return;
          }
        } else {
          this.sound.play('correct');
        }
        if (num === this.solution[r][c]) this.clearRelatedNotes(r, c, num);
      }
    }

    this.updateBoard();
    this.updateNumpad();
    this.saveState();
    if (this.checkWin()) setTimeout(() => this.showWin(), 300);
  }

  erase() {
    if (!this.selected || this.complete) return;
    const { row: r, col: c } = this.selected;
    if (this.given[r][c]) return;
    this.history.push({ r, c, val: this.board[r][c], notes: new Set(this.notes[r][c]) });
    this.board[r][c] = 0;
    this.notes[r][c].clear();
    this.sound.play('erase');
    this.updateBoard();
    this.updateNumpad();
    this.saveState();
  }

  undo() {
    if (this.complete || !this.history.length) return;
    const { r, c, val, notes } = this.history.pop();
    this.board[r][c] = val;
    this.notes[r][c] = notes;
    this.selected = { row: r, col: c };
    this.updateBoard();
    this.updateNumpad();
    this.saveState();
  }

  toggleNotes() {
    this.notesMode = !this.notesMode;
    this.notesBtn.classList.toggle('active', this.notesMode);
  }

  hint() {
    if (this.complete) return;
    const candidates = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!this.given[r][c] && this.board[r][c] !== this.solution[r][c])
          candidates.push([r, c]);
    if (!candidates.length) return;

    const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
    this.history.push({ r, c, val: this.board[r][c], notes: new Set(this.notes[r][c]) });
    this.board[r][c] = this.solution[r][c];
    this.notes[r][c].clear();
    this.clearRelatedNotes(r, c, this.solution[r][c]);
    this.selected = { row: r, col: c };
    this.hintsUsed++;
    this.sound.play('hint');
    this.updateBoard();
    this.updateNumpad();
    this.saveState();
    if (this.checkWin()) setTimeout(() => this.showWin(), 300);
  }

  handleKey(e) {
    if (this.complete) return;
    if (e.key >= '1' && e.key <= '9') { this.enterNumber(+e.key); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { this.erase(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
    if (e.key === 'n') { this.toggleNotes(); return; }

    if (!this.selected) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) this.selectCell(0, 0);
      return;
    }
    const { row, col } = this.selected;
    const dirs = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };
    if (dirs[e.key]) {
      e.preventDefault();
      const [dr, dc] = dirs[e.key];
      this.selectCell(Math.max(0, Math.min(8, row+dr)), Math.max(0, Math.min(8, col+dc)));
    }
  }

  // ── Game logic ──────────────────────────────────────────────────────────────

  clearRelatedNotes(row, col, num) {
    for (let i = 0; i < 9; i++) {
      this.notes[row][i].delete(num);
      this.notes[i][col].delete(num);
    }
    const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
    for (let r = br; r < br+3; r++)
      for (let c = bc; c < bc+3; c++)
        this.notes[r][c].delete(num);
  }

  checkWin() {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (this.board[r][c] !== this.solution[r][c]) return false;
    this.complete = true;
    this.stopTimer();
    return true;
  }

  gameOver() {
    this.complete = true;
    this.stopTimer();
    this.board = this.solution.map(r => [...r]);
    this.given = Array.from({length: 9}, () => Array(9).fill(true));
    this.updateBoard();
    this.saveState();
    setTimeout(() => {
      this.sound.play('lose');
      document.getElementById('gameOverOverlay').hidden = false;
    }, 300);
  }

  showWin() {
    const m = Math.floor(this.seconds / 60);
    const s = this.seconds % 60;
    const time = m ? `${m}m ${s}s` : `${s}s`;
    const hint = this.hintsUsed ? ` · ${this.hintsUsed} hint${this.hintsUsed > 1 ? 's' : ''}` : '';
    this.winTimeEl.textContent = `Solved in ${time}${hint}`;
    this.sound.play('win');
    this.winOverlay.hidden = false;
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────

  updateMistakesDisplay() {
    this.mistakesEl.textContent = `Mistakes: ${this.mistakes}/3`;
  }

  updateNumpad() {
    const counts = new Array(10).fill(0);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (this.board[r][c] && this.board[r][c] === this.solution[r][c])
          counts[this.board[r][c]]++;
    document.querySelectorAll('.num-btn').forEach(btn => {
      const remaining = 9 - counts[+btn.dataset.num];
      btn.classList.toggle('complete', remaining === 0);
      btn.querySelector('.num-count').textContent = remaining;
    });
  }

  saveState() {
    try {
      localStorage.setItem('gameState', JSON.stringify({
        solution:   this.solution,
        board:      this.board,
        given:      this.given,
        notes:      this.notes.map(row => row.map(cell => [...cell])),
        difficulty: this.difficulty,
        seconds:    this.seconds,
        mistakes:   this.mistakes,
        hintsUsed:  this.hintsUsed,
        complete:   this.complete,
      }));
    } catch {}
  }

  restoreState() {
    try {
      const raw = localStorage.getItem('gameState');
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.solution   = s.solution;
      this.board      = s.board;
      this.given      = s.given;
      this.notes      = s.notes.map(row => row.map(cell => new Set(cell)));
      this.difficulty = s.difficulty;
      this.seconds    = s.seconds;
      this.mistakes   = s.mistakes;
      this.hintsUsed  = s.hintsUsed;
      this.complete   = s.complete;
      this.history    = [];
      this.selected   = null;
      this.notesMode  = false;
      this.notesBtn.classList.remove('active');
      this.updateMistakesDisplay();
      document.getElementById('currentDiff').textContent =
        this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1);
      this.buildBoard();
      this.updateNumpad();
      this.applySettings();
      if (!this.complete) this.startTimer();
      return true;
    } catch { return false; }
  }

  registerSW() {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', () => { new SudokuGame(); });
