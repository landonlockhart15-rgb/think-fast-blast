export function isMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
}

export function drawSparks(ctx, particles, width, height, isMobile) {
  ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
  ctx.fillRect(0, 0, width, height);

  // Update positions first
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;
  }

  // Draw connections (O(N^2 / 2) instead of O(N^2))
  ctx.lineWidth = 0.5;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const other = particles[j];
      const dx = p.x - other.x;
      const dy = p.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 3600) {
        const dist = Math.sqrt(distSq);
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.12 * (1 - dist / 60)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
      }
    }
  }

  // Draw particles
  if (!isMobile) {
    ctx.shadowBlur = 5;
  }
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    if (!isMobile) {
      ctx.shadowColor = p.color;
    }
    ctx.fill();
  }
  if (!isMobile) {
    ctx.shadowBlur = 0;
  }
}

export function drawParticles(ctx, particles, isMobile) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity || 0;
    p.rotation += p.spin || 0;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;

    if (isMobile) {
      // Fast path for mobile: no save/restore, no rotation, no shadowBlur
      if (p.kind === "spark") {
        ctx.fillRect(p.x - p.size * 1.7, p.y - 0.8, p.size * 3.4, 1.6);
      } else if (p.kind === "sparkle") {
        ctx.fillRect(p.x - p.size, p.y - 1, p.size * 2, 2);
        ctx.fillRect(p.x - 1, p.y - p.size, 2, p.size * 2);
      } else if (p.kind === "shard" || p.kind === "debris") {
        ctx.fillRect(p.x - p.size, p.y - p.size * 0.45, p.size * 2, p.size * 0.9);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // High-quality path for desktop
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation || 0);
      if (p.kind === "spark") {
        ctx.fillRect(-p.size * 1.7, -0.8, p.size * 3.4, 1.6);
      } else if (p.kind === "sparkle") {
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 2);
        ctx.quadraticCurveTo(0, 0, p.size * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, p.size * 2);
        ctx.quadraticCurveTo(0, 0, -p.size * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, -p.size * 2);
        ctx.fill();
      } else if (p.kind === "shard" || p.kind === "debris") {
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1.0;
}
