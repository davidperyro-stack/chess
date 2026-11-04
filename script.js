import { Chess } from "https://esm.sh/chess.js";

const game = new Chess();

let difficulty = "Medium";

let gameMode = "bot";

const difficultyButtons = Array.from(document.querySelectorAll("#difficulty .difficulty-btn"));

function setDifficulty(level) {
    difficulty = level;
    difficultyButtons.forEach(b => {
        const isActive = b.dataset.level === level;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    console.log("Difficulty:", difficulty);
    alert(`Difficulty set to ${difficulty}`);
}

setDifficulty(difficulty);

difficultyButtons.forEach(button => {
    button.addEventListener("click", () => {
        setDifficulty(button.dataset.level);
    });
});

const modeButtons = Array.from(document.querySelectorAll("#mode-select .mode-btn"));
const difficultyEl = document.getElementById("difficulty");

function setGameMode(mode) {
    gameMode = mode;
    modeButtons.forEach(b => {
        b.classList.toggle("active", b.dataset.mode === mode);
    });
    difficultyEl.style.display = mode === "bot" ? "" : "none";
    resetGame();
}

modeButtons.forEach(button => {
    button.addEventListener("click", () => {
        setGameMode(button.dataset.mode);
    });
});

const depths = {
    Easy: 2,
    Medium: 6,
    Hard: 10
};

let lastMove = null;

const engine = new Worker("js/stockfish-18-lite-single.js");

engine.onerror = (e) => {
    console.error("ENGINE ERROR:", e);
};

engine.onmessageerror = (e) => {
    console.error("MESSAGE ERROR:", e);
};

engine.onmessage = (e) => {
    console.log("ENGINE:", e.data);
};

engine.postMessage("uci");
engine.postMessage("isready");
engine.postMessage("ucinewgame");

const board = document.getElementById("board");

let pendingMove = null;
let selectedSquare = null;
let legalMoves = [];
const promotionOverlay = document.getElementById("promotion-overlay");
const promotionMenu = document.getElementById("promotion-menu");
const promotionCancel = document.getElementById("promotion-cancel");
const promotionOptionButtons = Array.from(document.querySelectorAll(".promotion-option"));

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(frequency, duration, type = "sine", volume = 0.15) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    oscillator.stop(audioCtx.currentTime + duration);
}

function playMoveSound() {
    playTone(440, 0.1);
}

function playCaptureSound() {
    playTone(220, 0.15, "square");
}

function playCheckSound() {
    playTone(660, 0.12, "triangle");
    setTimeout(() => playTone(880, 0.12, "triangle"), 100);
}

function playGameOverSound() {
    playTone(300, 0.2, "sawtooth");
    setTimeout(() => playTone(200, 0.3, "sawtooth"), 200);
}

function getPieceCode(piece) {
    if (!piece) return null;
    return piece.color + piece.type;
}

function toSquare(row, col) {
    const files = "abcdefgh";
    return files[col] + (8 - row);
}

function clearSelection() {
    selectedSquare = null;
    legalMoves = [];
}

function setSelectedSquare(square) {
    selectedSquare = square;
    legalMoves = game.moves({
        square,
        verbose: true
    });
}

function showPromotionMenu() {
    const color = game.turn();
    promotionOptionButtons.forEach(button => {
        const piece = button.dataset.piece;
        const img = button.querySelector("img");
        img.src = `assets/pieces/${color}${piece}.svg`;
    });

    promotionOverlay.classList.remove("hidden");
}

function hidePromotionMenu() {
    promotionOverlay.classList.add("hidden");
    clearSelection();
}

function applyMove(from, to, promotion) {

    const move = game.move({ from, to, promotion });

    if (move) {

        lastMove = move;

        if (move.captured) {
            playCaptureSound();
        } else {
            playMoveSound();
        }

        if (game.inCheck()) {
            playCheckSound();
        }

        clearSelection();
        drawBoard();
        checkGameOver();
        updateMoveHistory();

        if (gameMode === "bot") {
            engine.postMessage("position fen " + game.fen());
            engine.postMessage("go depth " + depths[difficulty]);
        }
    }
}

function checkGameOver() {

    if (game.isCheckmate()) {

        const winner = game.turn() === "w" ? "Black" : "White";
        showGameOverMessage(`Checkmate!\n${winner} wins!`);

    } else if (game.isStalemate()) {

        showGameOverMessage("Draw by stalemate.");

    } else if (game.isThreefoldRepetition()) {

        showGameOverMessage("Draw by threefold repetition.");

    } else if (game.isInsufficientMaterial()) {

        showGameOverMessage("Draw by insufficient material.");

    } else if (game.isDraw()) {

        showGameOverMessage("Draw.");

    }
}

promotionOptionButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (!pendingMove) return;
        const promotion = button.dataset.piece;
        applyMove(pendingMove.from, pendingMove.to, promotion);
        pendingMove = null;
        hidePromotionMenu();
    });
});

promotionCancel.addEventListener("click", () => {
    pendingMove = null;
    hidePromotionMenu();
});

promotionOverlay.addEventListener("click", event => {
    if (event.target === promotionOverlay) {
        pendingMove = null;
        hidePromotionMenu();
    }
});

let dragState = null;

function showDragHighlights(fromSquare) {
    const dragLegalMoves = game.moves({ square: fromSquare, verbose: true });
    const squares = document.querySelectorAll(".square");

    squares.forEach(squareEl => {
        const squareName = squareEl.dataset.square;

        if (squareName === fromSquare) {
            squareEl.classList.add("selected");
        }

        const legalMove = dragLegalMoves.find(move => move.to === squareName);
        if (legalMove) {
            squareEl.classList.add("legal");
            if (legalMove.captured) {
                squareEl.classList.add("legal-capture");
            }
        }
    });
}

function startDrag(event, fromSquare, img) {
    event.preventDefault();
    event.stopPropagation();
    img.setPointerCapture(event.pointerId);
    dragState = { from: fromSquare, img };

    showDragHighlights(fromSquare);

    const grabScale = 0.85;
    const startWidth = img.offsetWidth;
    const startHeight = img.offsetHeight;

    img.style.position = "fixed";
    img.style.zIndex = "1000";
    img.style.pointerEvents = "none";
    img.style.userSelect = "none";
    img.style.width = (startWidth * grabScale) + "px";
    img.style.height = (startHeight * grabScale) + "px";

    moveDraggedImage(event.clientX, event.clientY);

    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragEnd);
}

function moveDraggedImage(x, y) {
    if (!dragState) return;
    const img = dragState.img;
    img.style.left = (x - img.offsetWidth / 2) + "px";
    img.style.top = (y - img.offsetHeight / 2) + "px";
}

function onDragMove(event) {
    moveDraggedImage(event.clientX, event.clientY);
}

function onDragEnd(event) {
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragEnd);

    if (!dragState) return;

    const img = dragState.img;
    const from = dragState.from;
    dragState = null;

    if (img) {
        img.style.position = "absolute";
        img.style.left = "";
        img.style.top = "";
        img.style.zIndex = "";
        img.style.pointerEvents = "auto";
    }

    const targetEl = document.elementFromPoint(event.clientX, event.clientY);
    const targetSquareEl = targetEl ? targetEl.closest(".square") : null;

    drawBoard();

    if (!targetSquareEl) return;
    const toSquare = targetSquareEl.dataset.square;
    if (!toSquare || toSquare === from) return;

    const movingPiece = game.get(from);
    if (!movingPiece || movingPiece.color !== game.turn()) return;

    const possibleMoves = game.moves({ square: from, verbose: true })
        .filter(move => move.to === toSquare);
    if (possibleMoves.length === 0) return;

    const promotionMoves = possibleMoves.filter(move => move.promotion);
    if (promotionMoves.length > 0) {
        pendingMove = { from, to: toSquare };
        showPromotionMenu();
        return;
    }

    applyMove(from, toSquare);
}

function drawBoard() {
    board.innerHTML = "";
    const boardPosition = game.board();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("div");
            square.classList.add("square");

            if ((row + col) % 2 === 0) {
                square.classList.add("light");
            } else {
                square.classList.add("dark");
            }

            const piece = boardPosition[row][col];
            const pieceCode = getPieceCode(piece);
            const clickedSquare = toSquare(row, col);
            square.dataset.square = clickedSquare;

            if (row === 7) {
                const fileLabel = document.createElement("span");
                fileLabel.className = "file-label";
                fileLabel.textContent = "abcdefgh"[col];
                square.appendChild(fileLabel);
            }

            if (col === 0) {
                const rankLabel = document.createElement("span");
                rankLabel.className = "rank-label";
                rankLabel.textContent = 8 - row;
                square.appendChild(rankLabel);
            }

            if (
                lastMove &&
                (
                    clickedSquare === lastMove.from ||
                    clickedSquare === lastMove.to
                )
            ) {
                square.classList.add("last-move");
            }

            if (selectedSquare === clickedSquare) {
                square.classList.add("selected");
            }

            const legalMove = legalMoves.find(
                move => move.to === clickedSquare
            );

            if (legalMove) {
                square.classList.add("legal");

                if (legalMove.captured) {
                    square.classList.add("legal-capture");
                }
            }

            if (game.inCheck() && piece && piece.type === "k" && piece.color === game.turn()) {
                square.classList.add("check");
            }

            square.addEventListener("click", function () {
                if (pendingMove) {
                    return;
                }

                if (selectedSquare === null) {
                    if (piece && piece.color === game.turn()) {
                        setSelectedSquare(clickedSquare);
                        drawBoard();
                    }
                    return;
                }

                if (clickedSquare === selectedSquare) {
                    clearSelection();
                    drawBoard();
                    return;
                }

                if (piece && piece.color === game.turn()) {
                    setSelectedSquare(clickedSquare);
                    drawBoard();
                    return;
                }

                const possibleMoves = legalMoves.filter(move => move.to === clickedSquare);
                if (possibleMoves.length === 0) {
                    clearSelection();
                    drawBoard();
                    return;
                }

                const promotionMoves = possibleMoves.filter(move => move.promotion);
                if (promotionMoves.length > 0) {
                    pendingMove = { from: selectedSquare, to: clickedSquare };
                    showPromotionMenu();
                    return;
                }

                applyMove(selectedSquare, clickedSquare);
            });

            if (pieceCode) {
                const img = document.createElement("img");
                img.src = `assets/pieces/${pieceCode}.svg`;
                img.className = "piece";
                img.draggable = false;

                if (piece.color === game.turn()) {
                    img.style.cursor = "grab";
                    img.addEventListener("pointerdown", function (event) {
                        startDrag(event, clickedSquare, img);
                    });
                }

                square.appendChild(img);
            }

            board.appendChild(square);
        }
    }
}

drawBoard();

function updateMoveHistory() {
    const moveHistoryEl = document.getElementById("move-history");
    if (!moveHistoryEl) return;

    moveHistoryEl.innerHTML = "";
    const history = game.history();

    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = (i / 2) + 1;
        const white = history[i] || "";
        const black = history[i + 1] || "";

        const row = document.createElement("div");
        row.className = "move-row";
        row.innerHTML = `<span class="move-number">${moveNumber}.</span> <span class="white-move">${white}</span> <span class="black-move">${black}</span>`;
        moveHistoryEl.appendChild(row);
    }
}

function showGameOverMessage(message) {
    playGameOverSound();
    const popup = document.getElementById("game-over-message");
    popup.textContent = message;
    popup.classList.remove("hidden");
}

drawBoard();
updateMoveHistory();

function resetGame() {
    game.reset();
    lastMove = null;
    pendingMove = null;
    clearSelection();
    promotionOverlay.classList.add("hidden");
    document.getElementById("game-over-message").classList.add("hidden");
    engine.postMessage("stop");
    engine.postMessage("ucinewgame");
    drawBoard();
    updateMoveHistory();
}

engine.onmessage = function (event) {

    const line = event.data;

    console.log(line);

    if (!line.startsWith("bestmove")) return;

    if (gameMode !== "bot") return;

    let move = line.split(" ")[1];

    const mistakeChance = {
        Easy: 0.50,
        Medium: 0.15,
        Hard: 0.05
    };

    if (Math.random() < mistakeChance[difficulty]) {
        const legalMoves = game.moves({ verbose: true });
        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];

        move =
            randomMove.from +
            randomMove.to +
            (randomMove.promotion || "");
    }

    setTimeout(() => {

        const playedMove = game.move({
            from: move.substring(0, 2),
            to: move.substring(2, 4),
            promotion: move.length === 5 ? move[4] : undefined
        });

        if (!playedMove) return;

        lastMove = playedMove;

        if (playedMove.captured) {
            playCaptureSound();
        } else {
            playMoveSound();
        }

        if (game.inCheck()) {
            playCheckSound();
        }

        drawBoard();
        checkGameOver();
        updateMoveHistory();

    }, 1500);
};
