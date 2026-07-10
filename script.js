$(document).ready(function () {
  const boardEl = $('#board');
  const urlInput = $('#gameUrl');
  const loadBtn = $('#loadBtn');
  const showDataCheckbox = $('#showData');
  const dataPanel = $('#dataPanel');
  const gameInfo = $('#gameInfo');
  const moveList = $('#moveList');

  let board = null;
  let game = null;
  let currentMoveIndex = -1;
  let moveHistory = [];

  // Initialize chessboard.js
  function initBoard() {
    board = Chessboard('board', {
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      position: 'start',
      draggable: false,
      showNotation: true,
    });

    // Resize board to fit container
    $(window).on('resize', function () {
      if (board) board.resize();
    });
  }

  // Parse chess.com game URL to extract game ID
  function parseGameUrl(url) {
    // Patterns:
    // https://www.chess.com/game/live/123456789
    // https://www.chess.com/game/daily/123456789
    const match = url.match(/chess\.com\/game\/(?:live|daily)\/(\d+)/);
    return match ? match[1] : null;
  }

  // Show error message
  function showError(message) {
    const existing = $('.error-message');
    if (existing.length) existing.remove();

    $('<p class="error-message"></p>')
      .text(message)
      .appendTo('.input-group')
      .delay(3000)
      .fadeOut(300, function () { $(this).remove(); });
  }

  // Set loading state
  function setLoading(isLoading) {
    loadBtn.prop('disabled', isLoading);
    loadBtn.html(isLoading
      ? '<span class="loading-spinner"></span> Loading...'
      : 'Load Game'
    );
  }

  // Parse PGN string into game details
  function parsePgn(pgnStr) {
    const chess = new Chess();
    chess.loadPgn(pgnStr);
    const header = chess.header();

    // Rebuild move history with FEN positions
    chess.reset();
    const fullHistory = chess.history({ verbose: true });

    return {
      header: header,
      moves: fullHistory.map((m, i) => ({
        num: Math.floor(i / 2) + 1,
        color: m.color,
        san: m.san,
        fen: m.after,
      })),
      pgn: pgnStr,
    };
  }

  // Build game info display
  function displayGameInfo(parsed) {
    const h = parsed.header;
    const result = h.Result || '*';
    const white = h.White || 'White';
    const black = h.Black || 'Black';
    const date = h.Date || 'Unknown';
    const eco = h.ECO || '';
    const event = h.Event || '';

    gameInfo.empty();

    const details = [
      { label: 'Event', value: event },
      { label: 'White', value: white },
      { label: 'Black', value: black },
      { label: 'Result', value: result },
      { label: 'Date', value: date },
    ];

    if (eco) details.push({ label: 'ECO', value: eco });

    details.forEach((d) => {
      if (!d.value) return;
      $('<p class="game-detail"></p>')
        .html(`<strong>${d.label}:</strong> ${d.value}`)
        .appendTo(gameInfo);
    });
  }

  // Build move list
  function displayMoveList(parsed) {
    moveList.empty();

    $('<h3>Moves</h3>').appendTo(moveList);

    const grid = $('<div class="moves-grid"></div>').appendTo(moveList);

    parsed.moves.forEach((move, i) => {
      if (move.color === 'w') {
        // White move
        const numCell = $(`<div class="move-number">${move.num}.</div>`);
        const whiteCell = $(
          `<div class="move-white" data-index="${i}">${move.san}</div>`
        );
        grid.append(numCell, whiteCell);
      } else {
        // Black move - no number cell (it spans the empty space)
        const blackCell = $(
          `<div class="move-black" data-index="${i}">${move.san}</div>`
        );
        grid.append(blackCell);
      }
    });

    // Click handler for moves
    grid.on('click', '.move-white, .move-black', function () {
      const index = parseInt($(this).data('index'));
      goToMove(index);
    });
  }

  // Navigate to a specific move
  function goToMove(index) {
    currentMoveIndex = index;
    const parsed = moveHistory[currentMoveIndex];

    // Update board
    board.position(parsed.fen);

    // Highlight active move
    $('.move-white, .move-black').removeClass('active');
    const activeEls = $(`.move-white[data-index="${index}"], .move-black[data-index="${index}"]`);
    activeEls.addClass('active');

    // Scroll into view
    if (activeEls.length) {
      activeEls[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Load game from chess.com PGN export
  async function loadGame(url) {
    const gameId = parseGameUrl(url);

    if (!gameId) {
      showError('Invalid chess.com game URL. Please use a game/live or game/daily URL.');
      return;
    }

    setLoading(true);
    gameInfo.empty();
    moveList.empty();
    board.position('start');

    try {
      const response = await fetch(
        `https://www.chess.com/callback/live/pgn/${gameId}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`Game not found (HTTP ${response.status})`);
      }

      // Response has a `pgn` property with the PGN string
      const data = await response.json();
      const pgnStr = data.pgn || data.game?.pgn || data;

      if (!pgnStr || pgnStr.length < 10) {
        throw new Error('Could not load PGN data for this game.');
      }

      const parsed = parsePgn(pgnStr);
      moveHistory = parsed.moves;

      displayGameInfo(parsed);
      displayMoveList(parsed);

      // Show the board start position
      board.position('start');
      currentMoveIndex = -1;

    } catch (err) {
      showError(`Failed to load game: ${err.message}`);
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Show Data toggle
  showDataCheckbox.on('change', function () {
    if ($(this).is(':checked')) {
      dataPanel.removeClass('hidden');
    } else {
      dataPanel.addClass('hidden');
    }
  });

  // Load button click
  loadBtn.on('click', function () {
    const url = urlInput.val().trim();
    if (!url) {
      showError('Please enter a chess.com game URL.');
      return;
    }
    loadGame(url);
  });

  // Enter key in input field
  urlInput.on('keydown', function (e) {
    if (e.key === 'Enter') {
      loadBtn.click();
    }
  });

  // Initialize
  initBoard();
  dataPanel.removeClass('hidden');
});