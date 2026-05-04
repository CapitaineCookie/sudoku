'use strict';

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
    // Canonical valid grid, then apply random symmetry-preserving transforms
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

    // Remap digits to random permutation
    const perm = this.shuffle([1,2,3,4,5,6,7,8,9]);
    let g = base.map(row => row.map(n => perm[n - 1]));

    // Shuffle rows within each band
    for (let b = 0; b < 3; b++) {
      const [i0, i1, i2] = this.shuffle([0, 1, 2]);
      const rows = [g[b*3+i0], g[b*3+i1], g[b*3+i2]];
      g[b*3] = rows[0]; g[b*3+1] = rows[1]; g[b*3+2] = rows[2];
    }

    // Shuffle cols within each stack
    for (let s = 0; s < 3; s++) {
      const [j0, j1, j2] = this.shuffle([0, 1, 2]);
      for (let r = 0; r < 9; r++) {
        const orig = [...g[r]];
        g[r][s*3]   = orig[s*3+j0];
        g[r][s*3+1] = orig[s*3+j1];
        g[r][s*3+2] = orig[s*3+j2];
      }
    }

    // Shuffle bands
    const [b0, b1, b2] = this.shuffle([0, 1, 2]);
    g = [...g.slice(b0*3, b0*3+3), ...g.slice(b1*3, b1*3+3), ...g.slice(b2*3, b2*3+3)];

    // Shuffle stacks
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

  // Returns number of solutions, capped at 2 (early exit after finding 2)
  static countSolutions(g) {
    let count = 0;
    const solve = () => {
      // Find first empty cell
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
      // Only remove if puzzle still has a unique solution
      if (this.countSolutions(puzzle.map(row => [...row])) === 1) {
        removed++;
      } else {
        puzzle[r][c] = val;
      }
    }

    return { puzzle, solution };
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────

class SudokuGame {
  constructor() {
    this.difficulty = 'easy';
    this.cellEls = new Array(81);
    this.selected = null;
    this.notesMode = false;

    this.bindDOM();
    this.newGame();
    this.registerSW();
  }

  bindDOM() {
    this.boardEl   = document.getElementById('board');
    this.timerEl   = document.getElementById('timer');
    this.mistakesEl = document.getElementById('mistakes');
    this.notesBtn  = document.getElementById('notesBtn');
    this.winOverlay = document.getElementById('winOverlay');
    this.winTimeEl = document.getElementById('winTime');

    document.querySelectorAll('.diff-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelector('.diff-btn.active').classList.remove('active');
        btn.classList.add('active');
        this.difficulty = btn.dataset.difficulty;
        this.newGame();
      })
    );

    document.getElementById('newGame').addEventListener('click', () => this.newGame());
    document.getElementById('winNewGame').addEventListener('click', () => {
      this.winOverlay.hidden = true;
      this.newGame();
    });

    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('eraseBtn').addEventListener('click', () => this.erase());
    this.notesBtn.addEventListener('click', () => this.toggleNotes());
    document.getElementById('hintBtn').addEventListener('click', () => this.hint());

    document.querySelectorAll('.num-btn').forEach(btn =>
      btn.addEventListener('click', () => this.enterNumber(+btn.dataset.num))
    );

    document.addEventListener('keydown', e => this.handleKey(e));
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  newGame() {
    this.stopTimer();
    const { puzzle, solution } = SudokuGenerator.generate(this.difficulty);
    this.solution = solution;
    this.board = puzzle.map(r => [...r]);
    this.given = puzzle.map(r => r.map(v => v !== 0));
    this.notes = Array.from({length: 9}, () =>
      Array.from({length: 9}, () => new Set())
    );
    this.history = [];
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.seconds = 0;
    this.complete = false;
    this.selected = null;
    this.notesMode = false;
    this.notesBtn.classList.remove('active');
    this.updateMistakesDisplay();
    this.buildBoard();
    this.updateNumpad();
    this.startTimer();
  }

  startTimer() {
    this.timerEl.textContent = '0:00';
    this.timerInterval = setInterval(() => {
      this.seconds++;
      const m = Math.floor(this.seconds / 60);
      const s = String(this.seconds % 60).padStart(2, '0');
      this.timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  // ── Board rendering ─────────────────────────────────────────────────────────

  buildBoard() {
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
  }

  updateBoard() {
    const sel = this.selected;
    const selVal = sel ? this.board[sel.row][sel.col] : 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        this.refreshCell(r, c, sel, selVal);
  }

  refreshCell(r, c, sel, selVal) {
    const el = this.cellEls[r*9+c];
    const val = this.board[r][c];
    const notes = this.notes[r][c];

    // Highlight class
    let cls = 'cell';
    if (sel) {
      if (r === sel.row && c === sel.col) {
        cls += ' selected';
      } else {
        const isPeer = r === sel.row || c === sel.col ||
          (Math.floor(r/3) === Math.floor(sel.row/3) &&
           Math.floor(c/3) === Math.floor(sel.col/3));
        if (isPeer) {
          cls += (selVal && val === selVal) ? ' same-val' : ' peer';
        } else if (selVal && val === selVal) {
          cls += ' same-val';
        }
      }
    }

    if (this.given[r][c]) {
      cls += ' given';
    } else if (val && val !== this.solution[r][c]) {
      cls += ' error';
    } else if (val) {
      cls += ' user-filled';
    }

    el.className = cls;

    if (val) {
      el.textContent = val;
    } else if (notes.size) {
      el.innerHTML = '';
      const ng = document.createElement('div');
      ng.className = 'notes-grid';
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement('span');
        span.className = 'note';
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
    } else {
      if (this.board[r][c] === num) {
        // Tap same number to clear
        this.board[r][c] = 0;
      } else {
        const wasWrong = this.board[r][c] !== 0 && this.board[r][c] !== this.solution[r][c];
        this.board[r][c] = num;
        if (num !== this.solution[r][c] && !wasWrong) {
          this.mistakes++;
          this.updateMistakesDisplay();
          if (this.mistakes >= 3) {
            this.updateBoard();
            setTimeout(() => this.gameOver(), 200);
            return;
          }
        }
        if (num === this.solution[r][c]) this.clearRelatedNotes(r, c, num);
      }
    }

    this.updateBoard();
    this.updateNumpad();
    if (this.checkWin()) setTimeout(() => this.showWin(), 300);
  }

  erase() {
    if (!this.selected || this.complete) return;
    const { row: r, col: c } = this.selected;
    if (this.given[r][c]) return;
    this.history.push({ r, c, val: this.board[r][c], notes: new Set(this.notes[r][c]) });
    this.board[r][c] = 0;
    this.notes[r][c].clear();
    this.updateBoard();
    this.updateNumpad();
  }

  undo() {
    if (!this.history.length) return;
    const { r, c, val, notes } = this.history.pop();
    this.board[r][c] = val;
    this.notes[r][c] = notes;
    this.selected = { row: r, col: c };
    this.updateBoard();
    this.updateNumpad();
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
    this.updateBoard();
    this.updateNumpad();
    if (this.checkWin()) setTimeout(() => this.showWin(), 300);
  }

  handleKey(e) {
    if (this.complete) return;

    if (e.key >= '1' && e.key <= '9') { this.enterNumber(+e.key); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { this.erase(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
    if (e.key === 'n') { this.toggleNotes(); return; }

    if (!this.selected) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))
        this.selectCell(0, 0);
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
    alert('Game over — too many mistakes. The solution has been revealed.');
  }

  showWin() {
    const m = Math.floor(this.seconds / 60);
    const s = this.seconds % 60;
    const time = m ? `${m}m ${s}s` : `${s}s`;
    const hint = this.hintsUsed ? ` · ${this.hintsUsed} hint${this.hintsUsed > 1 ? 's' : ''}` : '';
    this.winTimeEl.textContent = `Solved in ${time}${hint}`;
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
    document.querySelectorAll('.num-btn').forEach(btn =>
      btn.classList.toggle('complete', counts[+btn.dataset.num] >= 9)
    );
  }

  registerSW() {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', () => { new SudokuGame(); });
