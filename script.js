$(document).ready(function () {
  const boardEl = $('#board');
  const pgnInput = $('#pgnInput');
  const loadBtn = $('#loadBtn');
  const showDataCheckbox = $('#showData');
  const dataPanel = $('#dataPanel');
  const gameInfo = $('#gameInfo');
  const moveList = $('#moveList');

  let board = null;
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

    // Get move history with FEN positions (must be read before any reset)
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

  // Load game from PGN text
  function loadGame(pgnText) {
    if (!pgnText || typeof pgnText !== 'string') {
      showError('Please paste a PGN.');
      return;
    }

    const trimmed = pgnText.trim();
    if (!trimmed) {
      showError('Please paste a PGN.');
      return;
    }

    gameInfo.empty();
    moveList.empty();
    board.position('start');
    currentMoveIndex = -1;

    try {
      const parsed = parsePgn(trimmed);

      if (!parsed.moves || parsed.moves.length === 0) {
        throw new Error('No moves found in PGN. Make sure it contains valid chess moves.');
      }

      moveHistory = parsed.moves;

      displayGameInfo(parsed);
      displayMoveList(parsed);

      // Reset board to start position
      board.position('start');

    } catch (err) {
      showError(`Failed to load game: ${err.message}`);
      console.error('Load error:', err);
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
    const pgn = pgnInput.val();
    loadGame(pgn);
  });

  // Ctrl+Enter / Cmd+Enter in textarea
  pgnInput.on('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      loadBtn.click();
    }
  });

  // Initialize
  initBoard();
  dataPanel.removeClass('hidden');
});