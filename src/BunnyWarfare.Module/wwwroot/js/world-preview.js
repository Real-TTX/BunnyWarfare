// The preview of an island on the world form: asks the server for the height map of the current values and draws it from above
// (water blue, beach, land by height in the colours of the theme). Updates while the values change.
(function () {
  'use strict';
  var canvas = document.getElementById('world-preview');
  var form = document.getElementById('world-form');
  if (!canvas || !form) { return; }
  var info = document.getElementById('world-preview-info');
  var ctx = canvas.getContext('2d');
  var timer = 0;
  var palettes = {
    Meadow: { low: [214, 196, 140], mid: [98, 160, 70], high: [60, 110, 50], peak: [120, 112, 100] },
    Snow: { low: [170, 180, 190], mid: [225, 232, 240], high: [245, 248, 252], peak: [255, 255, 255] },
    Desert: { low: [222, 196, 140], mid: [230, 186, 120], high: [196, 140, 80], peak: [160, 110, 70] },
    Moon: { low: [90, 90, 96], mid: [140, 140, 146], high: [180, 180, 186], peak: [210, 210, 214] },
    Autumn: { low: [214, 196, 140], mid: [196, 150, 60], high: [186, 90, 40], peak: [130, 118, 104] },
    Volcano: { low: [40, 36, 42], mid: [70, 60, 66], high: [50, 44, 52], peak: [130, 60, 40] },
    Jungle: { low: [214, 200, 150], mid: [70, 150, 50], high: [36, 104, 40], peak: [110, 122, 100] }
  };

  function value(name) {
    var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function draw(data) {
    var bytes = Uint8Array.from(atob(data.heights), function (c) { return c.charCodeAt(0); });
    var heights = new Float32Array(bytes.buffer);
    var size = data.size;
    var image = ctx.createImageData(size, size);
    var theme = palettes[value('Theme')] || palettes.Meadow;
    var top = Math.max(1, data.hillHeight);
    var land = 0;
    for (var i = 0; i < heights.length; i++) {
      var h = heights[i] - data.waterLevel;
      var c;
      if (h < 0) {
        c = value('Theme') === 'Moon' ? [12, 12, 24] : value('Theme') === 'Volcano' ? mix([255, 120, 30], [150, 40, 10], Math.min(1, -h / 3)) : mix([40, 110, 170], [10, 40, 90], Math.min(1, -h / 3));
      } else {
        land++;
        var t = Math.min(1, h / top);
        c = h < 0.35 ? theme.low : t < 0.45 ? mix(theme.mid, theme.high, t / 0.45) : mix(theme.high, theme.peak, (t - 0.45) / 0.55);
      }
      image.data[i * 4] = c[0]; image.data[i * 4 + 1] = c[1]; image.data[i * 4 + 2] = c[2]; image.data[i * 4 + 3] = 255;
    }
    var off = document.createElement('canvas');
    off.width = size; off.height = size;
    off.getContext('2d').putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (info) {
      info.textContent = 'Insel ' + data.width.toFixed(1).replace('.', ',') + ' × ' + data.width.toFixed(1).replace('.', ',') + ' m, ' + Math.round(100 * land / heights.length) + ' % Land.';
    }
  }

  function refresh() {
    var query = new URLSearchParams({
      gridSize: value('GridSize'), seed: value('Seed'), hillHeight: value('HillHeight'), roughness: value('Roughness'), waterLevel: value('WaterLevel'), theme: value('Theme')
    });
    fetch(canvas.getAttribute('data-preview-url') + '&' + query.toString(), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data) { draw(data); } })
      .catch(function () { /* the preview is only a help */ });
  }

  form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(refresh, 250); });
  form.addEventListener('change', function () { clearTimeout(timer); timer = setTimeout(refresh, 100); });
  refresh();
})();
