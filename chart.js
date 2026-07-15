// Chess Review — Eval Chart Module
// Chart.js evaluation graph rendering

(function () {
  const R = window.ChessReview;

  const classificationColors = {
    'move-brilliant': '#9b59b6',
    'move-best': '#f1c40f',
    'move-great': '#1abc9c',
    'move-excellent': '#2ecc71',
    'move-good': '#3498db',
    'move-inaccuracy': '#f39c12',
    'move-miss': '#95a5a6',
    'move-mistake': '#e67e22',
    'move-blunder': '#e74c3c',
  };

  function classificationToColor(classClass, alpha) {
    var base = classificationColors[classClass] || '#4a90d9';
    if (alpha !== undefined) {
      return hexToRgba(base, alpha);
    }
    return base;
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  R.renderEvalChart = function () {
    if (R.evalChartInstance) {
      R.evalChartInstance.destroy();
      R.evalChartInstance = null;
    }

    const canvas = document.getElementById('evalChart');
    if (!canvas) return;

    const labels = ['Start'];
    const data = [];

    var startScore = 0;
    if (R.startPositionEval) {
      startScore = R.startPositionEval.scoreType === 'mate'
        ? (R.startPositionEval.score > 0 ? 10000 - R.startPositionEval.score : -10000 + R.startPositionEval.score)
        : R.startPositionEval.score;
    }
    data.push(startScore / 100);

    R.moveHistory.forEach(function (move, i) {
      const moveLabel = move.num + (move.color === 'w' ? '.' : '...') + ' ' + move.san;
      labels.push(moveLabel);

      var score = move.eval || 0;
      if (move.evalType === 'mate') {
        score = score > 0 ? 10000 - score : -10000 + score;
      }
      data.push(score / 100);
    });

    const clampedData = data.map(function (v) { return Math.max(-10, Math.min(10, v)); });

    const segmentColors = [];
    for (var i = 0; i < R.moveHistory.length; i++) {
      var move = R.moveHistory[i];
      var classClass = move.classification ? move.classification.classClass : '';
      segmentColors.push(classificationToColor(classClass, 0.4));
    }

    R.currentChartIndex = R.currentMoveIndex + 1;

    const ctx = canvas.getContext('2d');
    R.evalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Evaluation (pawns)',
          data: clampedData,
          borderColor: '#4a90d9',
          backgroundColor: 'rgba(74, 144, 217, 0)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: (function () {
            var colors = ['#4a90d9'];
            for (var i = 0; i < R.moveHistory.length; i++) {
              var move = R.moveHistory[i];
              var classClass = move.classification ? move.classification.classClass : '';
              colors.push(classificationToColor(classClass));
            }
            return colors;
          })(),
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          fill: false,
          tension: 0.3,
          spanGaps: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                const sign = val > 0 ? '+' : '';
                var label = 'Evaluation: ' + sign + val.toFixed(2);
                var dataIndex = context.dataIndex;
                if (dataIndex > 0) {
                  var move = R.moveHistory[dataIndex - 1];
                  if (move && move.classification) {
                    label += ' (' + move.classification.classification + ')';
                  }
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#a0a0c0',
              font: { size: 9 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 30,
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            ticks: {
              color: '#a0a0c0',
              font: { size: 10 },
              callback: function (value) {
                const sign = value > 0 ? '+' : '';
                return sign + value.toFixed(1);
              }
            },
            grid: { color: 'rgba(255,255,255,0.08)' },
            title: {
              display: true,
              text: 'Pawns',
              color: '#a0a0c0',
              font: { size: 10 },
            }
          }
        },
        elements: {
          line: { borderWidth: 2 }
        }
      },
      plugins: [
        {
          id: 'zeroLine',
          beforeDraw: function (chart) {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const yScale = chart.scales.y;
            const zeroY = yScale.getPixelForValue(0);
            if (zeroY >= chartArea.top && zeroY <= chartArea.bottom) {
              ctx.save();
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(255,255,255,0.2)';
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.moveTo(chartArea.left, zeroY);
              ctx.lineTo(chartArea.right, zeroY);
              ctx.stroke();
              ctx.restore();
            }
          }
        },
        {
          id: 'segmentFill',
          beforeDraw: function (chart) {
            var ctx = chart.ctx;
            var chartArea = chart.chartArea;
            var yScale = chart.scales.y;
            var meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || meta.data.length < 2) return;

            ctx.save();
            for (var i = 0; i < R.moveHistory.length; i++) {
              var move = R.moveHistory[i];
              var classClass = move.classification ? move.classification.classClass : '';
              var color = classificationToColor(classClass, 0.15);

              var p0 = meta.data[i];
              var p1 = meta.data[i + 1];
              if (!p0 || !p1) continue;

              var x0 = p0.x;
              var y0 = p0.y;
              var x1 = p1.x;
              var y1 = p1.y;
              var zeroY = yScale.getPixelForValue(0);

              ctx.beginPath();
              ctx.moveTo(x0, y0);
              ctx.lineTo(x1, y1);
              ctx.lineTo(x1, zeroY);
              ctx.lineTo(x0, zeroY);
              ctx.closePath();
              ctx.fillStyle = color;
              ctx.fill();
            }
            ctx.restore();
          }
        },
        {
          id: 'positionMarker',
          afterDraw: function (chart) {
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;

            const x = xScale.getPixelForValue(R.currentChartIndex);
            if (x < chartArea.left || x > chartArea.right) return;

            const top = chartArea.top;
            const bottom = chartArea.bottom;

            const ctx = chart.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();

            const y = yScale.getPixelForValue(clampedData[R.currentChartIndex]);
            if (y >= top && y <= bottom) {
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.strokeStyle = '#4a90d9';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      ]
    });
  };
})();