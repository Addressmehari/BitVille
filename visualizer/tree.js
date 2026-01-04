function drawTree(gx, gy, ctx) {
    if (typeof gridToWorld !== 'function') return;

    const pos = gridToWorld(gx, gy);

    // Deterministic random
    const seed = (gx * 123 + gy * 456);
    // Simple pseudo-random function
    const rand = (mod) => Math.abs((Math.sin(seed) * 10000) % mod);

    // Palette (Premium & Vibrant)
    const colors = {
        trunk: "#795548",      // Rich Brown
        trunkDark: "#4E342E",  // Deep Brown Shadow
        leavesDark: "#2E7D32", // Deep Green
        leavesBase: "#4CAF50", // Vivid Green
        leavesLight: "#81C784", // Soft Light Green
        highlight: "#C8E6C9"   // Pale Green Highlight
    };

    // Variation
    const scale = 1.0 + (rand(20) * 0.01); // 1.0 to 1.2

    // Wind Animation
    // We use Date.now() to get a continuous time value
    const time = Date.now() * 0.002;
    // Sway depends on time and position (for offset between trees)
    const sway = Math.sin(time + gx * 0.5) * 3;

    // 0. Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 22 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Trunk (With Flare at base)
    const trunkW = 12 * scale;
    const trunkH = 45 * scale;
    const tx = pos.x;
    const ty = pos.y + 2; // Slight offset into ground

    ctx.fillStyle = colors.trunk;
    ctx.beginPath();
    // Base (Flared)
    ctx.moveTo(tx - trunkW / 2 - 2, ty);
    ctx.lineTo(tx + trunkW / 2 + 2, ty);
    // Top (Joined to foliage, sways slightly)
    ctx.lineTo(tx + trunkW / 2 + sway * 0.2, ty - trunkH);
    ctx.lineTo(tx - trunkW / 2 + sway * 0.2, ty - trunkH);
    ctx.fill();

    // Trunk Shade (Right half)
    ctx.fillStyle = colors.trunkDark;
    ctx.beginPath();
    ctx.moveTo(tx, ty); // Center bottom
    ctx.lineTo(tx + trunkW / 2 + 2, ty); // Right bottom
    ctx.lineTo(tx + trunkW / 2 + sway * 0.2, ty - trunkH); // Right top
    ctx.lineTo(tx + sway * 0.2, ty - trunkH); // Center top
    ctx.fill();

    // 2. Foliage (Clusters)
    // Draw blobs that move more with height (sway) to simulate flexibility

    const drawBlob = (ox, oy, r, color, highlight = false) => {
        // Calculate sway offset based on height (negative oy)
        // Higher up (more negative oy) = more sway
        const swayFactor = Math.abs(oy) / 50;
        const x = pos.x + ox + (sway * swayFactor);
        const y = pos.y + oy;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner Shadow (Bottom Right)
        ctx.save();
        ctx.clip(); // Clip to the circle we just drew
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.beginPath();
        ctx.arc(x + r * 0.2, y + r * 0.2, r, 0, Math.PI * 2);
        ctx.fill();

        // Specular Highlight (Top Left - "Glossy/Fresh" look)
        if (highlight) {
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.4, r * 0.25, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    };

    // Compose Tree Canopy (Back to Front)

    // Bottom Layer (Dark / Shadow)
    drawBlob(-20 * scale, -45 * scale, 22 * scale, colors.leavesDark);
    drawBlob(20 * scale, -42 * scale, 24 * scale, colors.leavesDark);
    drawBlob(0, -40 * scale, 26 * scale, colors.leavesDark);

    // Middle Layer (Main Body)
    drawBlob(-15 * scale, -65 * scale, 24 * scale, colors.leavesBase);
    drawBlob(15 * scale, -60 * scale, 22 * scale, colors.leavesBase);
    drawBlob(0, -58 * scale, 28 * scale, colors.leavesBase);

    // Top Layer (Highlights / Crown)
    drawBlob(-8 * scale, -82 * scale, 20 * scale, colors.leavesLight);
    drawBlob(10 * scale, -78 * scale, 18 * scale, colors.leavesLight);
    drawBlob(0, -88 * scale, 24 * scale, colors.leavesLight, true); // Main Crown with highlight

    // Tiny decorative details (optional "fruit" or "flowers" could go here)
    if (rand(100) > 80) { // 20% chance of flowers
        ctx.fillStyle = "#FFEB3B"; // Yellow flowers
        const flowerX = pos.x + sway * 1.5;
        const flowerY = pos.y - 70 * scale;
        ctx.beginPath(); ctx.arc(flowerX - 10, flowerY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(flowerX + 12, flowerY + 10, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(flowerX + 2, flowerY - 15, 3, 0, Math.PI * 2); ctx.fill();
    }
}
