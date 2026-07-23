import { Chess } from "https://esm.sh/chess.js";

const game = new Chess();

let difficulty = "Medium";

const difficultyButtons = Array.from(document.querySelectorAll("#difficulty .difficulty-btn"));

function setDifficulty(level) {
    difficulty = level;
    difficultyButtons.forEach(b => {
        const isActive = b.dataset.level === level;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    console.log("Difficulty:", difficulty);
}

setDifficulty(difficulty);

difficultyButtons.forEach(button => {
    button.addEventListener("click", () => {
        setDifficulty(button.dataset.level);
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

        clearSelection();
        drawBoard();
        checkGameOver();
        updateMoveHistory();

        engine.postMessage("position fen " + game.fen());

        engine.postMessage("go depth " + depths[difficulty]);
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
                img.style.width = "80%";
                img.style.height = "80%";
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
    const popup = document.getElementById("game-over-message");
    popup.textContent = message;
    popup.classList.remove("hidden");
}

drawBoard();
updateMoveHistory();

engine.onmessage = function (event) {

    const line = event.data;

    console.log(line);

    if (!line.startsWith("bestmove")) return;

    const move = line.split(" ")[1];

   const playedMove = game.move({
    from: move.substring(0,2),
    to: move.substring(2,4),
    promotion: move.length === 5 ? move[4] : undefined
});

lastMove = playedMove;

    drawBoard();
    checkGameOver();
    updateMoveHistory();
};
