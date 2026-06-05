// ─── Procedural Texture Generators ───
// All textures are generated in code — no external assets required.

/**
 * Paper grain texture: subtle warm noise simulating aged parchment.
 */
export function createPaperGrainCanvas(width = 512, height = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Base warm fill
  ctx.fillStyle = '#D8C6A0';
  ctx.fillRect(0, 0, width, height);

  // Pixel-level noise
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 25;
    data[i]     = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise * 0.9));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise * 0.7));
  }
  ctx.putImageData(imageData, 0, 0);

  // Add some larger splotches
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 40 + 10;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random() > 0.5 ? 'rgba(180,150,100,' : 'rgba(200,180,130,';
    grad.addColorStop(0, tone + (Math.random() * 0.06 + 0.02) + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return canvas;
}

/**
 * Charcoal/darkness background texture: deep black with subtle grain.
 */
export function createCharcoalCanvas(width = 512, height = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep black base
  ctx.fillStyle = '#050405';
  ctx.fillRect(0, 0, width, height);

  // Very subtle noise
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 12;
    data[i]     = Math.min(20, data[i] + noise);
    data[i + 1] = Math.min(16, data[i + 1] + noise * 0.7);
    data[i + 2] = Math.min(18, data[i + 2] + noise * 0.8);
  }
  ctx.putImageData(imageData, 0, 0);

  // Charcoal streaks
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * height;
    const x1 = Math.random() * width * 0.3;
    const x2 = x1 + Math.random() * width * 0.7;
    ctx.strokeStyle = Math.random() > 0.5 ? '#1a1418' : '#0d0a0e';
    ctx.lineWidth = Math.random() * 8 + 1;
    ctx.beginPath();
    ctx.moveTo(x1, y + Math.random() * 20 - 10);
    ctx.quadraticCurveTo(
      (x1 + x2) / 2, y + Math.random() * 30 - 15,
      x2, y + Math.random() * 20 - 10
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

/**
 * Brush noise texture: tileable smudgy noise for painterly overlays.
 */
export function createBrushNoiseCanvas(width = 256, height = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Transparent base
  ctx.clearRect(0, 0, width, height);

  // Random brush marks
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const w = Math.random() * 30 + 5;
    const h = Math.random() * 4 + 1;
    const angle = Math.random() * Math.PI;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.random() * 0.15 + 0.02;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Stipple dots
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 2 + 0.5;
    ctx.globalAlpha = Math.random() * 0.1 + 0.01;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

/**
 * Edge noise texture: used for dry-brush edge breakup on silhouette edges.
 */
export function createEdgeNoiseCanvas(width = 256, height = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Multi-scale noise
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);

    // Low frequency
    const lo = Math.sin(px * 0.05) * Math.cos(py * 0.07) * 30;
    // High frequency
    const hi = (Math.random() - 0.5) * 80;
    // Mid frequency
    const mid = Math.sin(px * 0.15 + py * 0.12) * 20;

    const v = 128 + lo + hi * 0.4 + mid * 0.3;
    const clamped = Math.min(255, Math.max(0, v));
    data[i] = data[i + 1] = data[i + 2] = clamped;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}
