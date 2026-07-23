import { Chess } from "https://esm.sh/chess.js";

const game = new Chess();

const boardEl = document.getElementById("analyze-board");
const analyzeBtn = document.getElementById("analyze-btn");
const depthInput = document.getElementById("depth");
const analysisOutput = document.getElementById("analysis-output");
const fenInput = document.getElementById("fen-input");
const loadFenBtn = document.getElementById("load-fen");
const resetPosBtn = document.getElementById("reset-pos");

let selected = null;
let legalMoves = [];
let lastMove = null;

const engine = new Worker("js/stockfish-18-lite-single.js");
engine.postMessage("uci");
engine.postMessage("isready");
engine.postMessage("ucinewgame");

// Evaluation UI elements
const evalBar = document.getElementById('eval-bar');
const evalFill = document.getElementById('eval-fill');
const evalLabel = document.getElementById('eval-label');

function updateEvalBarFromScore(scoreMatch) {
    if (!evalBar || !evalFill || !evalLabel) return;
    if (!scoreMatch) {
        // reset
        evalBar.classList.remove('negative');
        evalFill.style.left = '50%';
        evalFill.style.width = '0%';
        evalLabel.textContent = '0.00';
        return;
    }
    const type = scoreMatch[1];
    const val = parseInt(scoreMatch[2], 10);
    if (type === 'cp') {
        const cp = val;
        const maxCp = 800;
        const ratio = Math.min(Math.abs(cp) / maxCp, 1);
        const fillPercent = ratio * 50; // 0..50
        if (cp >= 0) {
            evalBar.classList.remove('negative');
            evalFill.style.left = '50%';
            evalFill.style.width = fillPercent + '%';
        } else {
            evalBar.classList.add('negative');
            evalFill.style.left = (50 - fillPercent) + '%';
            evalFill.style.width = fillPercent + '%';
        }
        const pawns = (cp / 100).toFixed(2);
        evalLabel.textContent = (cp >= 0 ? '+' : '') + pawns;
    } else if (type === 'mate') {
        const mate = val;
        const fillPercent = 50;
        if (mate >= 0) {
            evalBar.classList.remove('negative');
            evalFill.style.left = '50%';
            evalFill.style.width = fillPercent + '%';
            evalLabel.textContent = 'M+' + mate;
        } else {
            evalBar.classList.add('negative');
            evalFill.style.left = '0%';
            evalFill.style.width = fillPercent + '%';
            evalLabel.textContent = 'M' + mate;
        }
    }
}



function getPieceCode(piece) {
    if (!piece) return null;
    return piece.color + piece.type;
}

function toSquare(row, col) {
    const files = "abcdefgh";
    return files[col] + (8 - row);
}

function drawBoard() {
    boardEl.innerHTML = "";
    const boardPos = game.board();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement("div");
            sq.className = "square" + (((r + c) % 2 === 0) ? " light" : " dark");
            const sqName = toSquare(r, c);

            if (lastMove && (sqName === lastMove.from || sqName === lastMove.to)) {
                sq.classList.add("last-move");
            }

            const piece = boardPos[r][c];
            const code = getPieceCode(piece);

            sq.addEventListener("click", () => {
                if (!selected) {
                    if (piece && piece.color === game.turn()) {
                        selected = sqName;
                        legalMoves = game.moves({ square: selected, verbose: true });
                        drawBoard();
                    }
                    return;
                }

                if (selected === sqName) {
                    selected = null;
                    legalMoves = [];
                    drawBoard();
                    return;
                }

                const possible = legalMoves.filter(m => m.to === sqName);
                if (possible.length === 0) {
                    // select new if own piece
                    if (piece && piece.color === game.turn()) {
                        selected = sqName;
                        legalMoves = game.moves({ square: selected, verbose: true });
                        drawBoard();
                        return;
                    }
                    selected = null;
                    legalMoves = [];
                    drawBoard();
                    return;
                }

                // apply first possible (auto-queen promotions)
                const moveObj = { from: selected, to: sqName };
                if (possible[0].promotion) moveObj.promotion = 'q';

                const mv = game.move(moveObj);
                if (mv) {
                    lastMove = mv;
                    selected = null;
                    legalMoves = [];
                    drawBoard();
                                    try { fenInput.value = game.fen(); } catch (e) {}
                                    // Automatically run analysis after a move
                                    try { autoAnalyze(); } catch (e) {}
                                }
            });

            if (code) {
                const img = document.createElement("img");
                img.src = `assets/pieces/${code}.svg`;
                img.style.width = "80%";
                img.style.height = "80%";
                sq.appendChild(img);
            }

            // highlight legal moves
            if (selected === sqName) {
                sq.classList.add("selected");
            }

            const isLegal = legalMoves.find(m => m.to === sqName);
            if (isLegal) sq.classList.add("legal");

            boardEl.appendChild(sq);
        }
    }
}

// Initial layout: make the board a grid like the main site
boardEl.style.width = "min(70vw, 750px)";
boardEl.style.height = "min(70vw, 750px)";
boardEl.style.border = "4px solid #1a1a1a";
boardEl.style.display = "grid";
boardEl.style.gridTemplateColumns = "repeat(8, 1fr)";
boardEl.style.gridTemplateRows = "repeat(8, 1fr)";

// Controls
let autoAnalyzeTimer = null;
function autoAnalyze(delay = 350) {
    clearTimeout(autoAnalyzeTimer);
    autoAnalyzeTimer = setTimeout(() => {
        analysisOutput.textContent = "Starting analysis...";
        // reset eval bar while engine works
        try { updateEvalBarFromScore(null); } catch (e) {}
        const fen = fenInput.value.trim();
        if (!fen) return;
        if (fen === "startpos") {
            engine.postMessage("position startpos");
        } else {
            engine.postMessage("position fen " + fen);
        }
        engine.postMessage("isready");
        engine.postMessage("go depth " + (parseInt(depthInput.value, 10) || 10));
    }, delay);
}

analyzeBtn.addEventListener("click", () => {
    // Manual analyze still available; call the same autoAnalyze logic with no debounce
    autoAnalyze(0);
});

// re-run analysis when depth changes
depthInput.addEventListener("change", () => autoAnalyze(150));
depthInput.addEventListener("input", () => autoAnalyze(150));

loadFenBtn.addEventListener("click", () => {
    const fen = fenInput.value.trim();
    if (!fen) return;
    if (fen === "startpos") {
        game.reset();
    } else {
        const ok = game.load(fen);
        if (!ok) {
            alert("Invalid FEN");
            return;
        }
    }
    lastMove = null;
    selected = null;
    legalMoves = [];
    drawBoard();
    // Run analysis for loaded position
    autoAnalyze();
});

resetPosBtn.addEventListener("click", () => {
    game.reset();
    fenInput.value = "startpos";
    lastMove = null;
    selected = null;
    legalMoves = [];
    drawBoard();
    // Run analysis for the reset position
    autoAnalyze();
});

// Synchronize fen input when moves are played on board
const observer = new MutationObserver(() => {
    try {
        fenInput.value = game.fen();
    } catch (e) {}
});

drawBoard();
fenInput.value = "startpos";

// keep the fen updated after moves
const origMove = game.move;
// Not monkeypatching chess.js move — instead update fen after user moves via drawBoard logic where game.move is called above

// Convert a space-separated UCI move string (e.g. "e2e4 e7e5 g1f3") to SAN list based on a FEN
function uciMovesToSanList(uciMovesStr, fen) {
    if (!uciMovesStr) return [];
    const parts = uciMovesStr.trim().split(/\s+/).filter(p => p.length >= 4);
    const g = fen ? new Chess(fen) : new Chess();
    const sanList = [];
    for (const m of parts) {
        try {
            const from = m.substring(0,2);
            const to = m.substring(2,4);
            const promotion = m.length === 5 ? m[4] : undefined;
            const mv = g.move({ from, to, promotion });
            if (mv && mv.san) sanList.push(mv.san);
            else sanList.push(m);
        } catch (err) {
            sanList.push(m);
        }
    }
    return sanList;
}

function uciMovesToSanString(uciMovesStr, fen) {
    const list = uciMovesToSanList(uciMovesStr, fen);
    return list.join(' ');
}

// Also listen to engine "bestmove" and show SAN instead of raw UCI
engine.onmessage = (e) => {
    const line = e.data && e.data.toString ? e.data.toString() : "";
    if (!line) return;

    if (line.startsWith("info")) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const pvMatch = line.match(/pv (.+)$/);
        let score = "";
        let pvSan = "";
        if (scoreMatch) {
            if (scoreMatch[1] === "cp") score = `Score: ${scoreMatch[2]} (cp)`;
            else score = `Mate: ${scoreMatch[2]}`;
        }
        if (pvMatch) pvSan = uciMovesToSanString(pvMatch[1], game.fen());
        const depthMatch = line.match(/depth (\d+)/);
        const depthStr = depthMatch ? `depth ${depthMatch[1]} ` : "";
        if (score || pvSan) {
            analysisOutput.textContent = `${depthStr}${score} PV: ${pvSan}`;
        }
        // update evaluation bar from latest score info
        updateEvalBarFromScore(scoreMatch);
    }
    if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const best = parts[1] || "";
        let bestSan = '';
        if (best) {
            // convert single UCI move to SAN relative to current game position
            try {
                const tmp = new Chess(game.fen());
                const from = best.substring(0,2);
                const to = best.substring(2,4);
                const promotion = best.length === 5 ? best[4] : undefined;
                const mv = tmp.move({ from, to, promotion });
                bestSan = mv && mv.san ? mv.san : best;
            } catch (err) {
                bestSan = best;
            }
        }
        analysisOutput.textContent = `Bestmove: ${bestSan} (${best})\n` + analysisOutput.textContent;
    }
};
