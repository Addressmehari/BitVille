/**
 * GitVille Isometric Engine
 * Pure HTML5 Canvas + Vanilla JS
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency on bg

// --- Configuration ---
const TILE_SIZE = 64; // Base size of a tile side in pixels (before isometric projection)
// In 2:1 isometric, the width of the tile on screen is typically related to this.
// Let's say the sprite width is TILE_WIDTH.
// A common standard: TILE_WIDTH = 2 * TILE_HEIGHT.
const TILE_WIDTH = 100;
const TILE_HEIGHT = 50;
const HOUSE_HEIGHT = 60; // Height of the cube house

// Colors
// Colors
const PALETTE = {
    day: {
        bg: '#81c784',
        groundLight: '#81c784',
        groundDark: '#66bb6a',
        grassBase: '#81c784',
        grassDark: '#66bb6a',
        grassLight: '#a5d6a7',
        windowLit: false
    },
    night: {
        bg: '#0f2027', // Deep Midnight Blue
        groundLight: '#15202b', // Dull Dark Blue-Grey
        groundDark: '#101921',
        grassBase: '#15202b',
        grassDark: '#101921',
        grassLight: '#1e2c3b', // Slightly lighter dull blue
        windowLit: true
    }
};

const GRID_LINE_COLOR = 'rgba(0, 0, 0, 0)'; // Transparent
const HOUSE_SIDE_SHADE = 0.8; // Multiplier for side face
const HOUSE_TOP_SHADE = 1.0;  // Multiplier for top face
const HOUSE_FRONT_SHADE = 0.9; // Multiplier for front face

// --- State ---
let camera = {
    x: 0,
    y: 0,
    zoom: 1.0,
    minZoom: 0.5,
    maxZoom: 2.0
};

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let currentMouseX = 0;
let currentMouseY = 0;

// Touch state for pinch zoom
let initialPinchDistance = null;
let initialZoom = null;

// World Data
let houses = []; // Will be loaded from JSON
let roads = new Set(); // Set of "x,y" strings
let worldConfig = { weather: "none" }; // Default config
let cloudSystem; // Cloud Manager
let npcManager; // NPC Manager

// --- Initialization ---
async function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    setupInputListeners();

    // Load data
    // Load data
    try {
        console.log("Fetching data...");
        const [housesRes, worldRes, roadsRes] = await Promise.all([
            fetch('stargazers_houses.json?t=' + Date.now()),
            fetch('world.json?t=' + Date.now()),
            fetch('roads.json?t=' + Date.now()).catch(e => null) // Fallback for roads
        ]);

        if (!housesRes.ok) throw new Error(`Houses fetch failed: ${housesRes.status}`);
        if (!worldRes.ok) throw new Error(`World fetch failed: ${worldRes.status}`);

        houses = await housesRes.json();
        console.log("Loaded houses:", houses.length);

        worldConfig = await worldRes.json();

        if (roadsRes && roadsRes.ok) {
            try {
                const roadData = await roadsRes.json();
                if (Array.isArray(roadData)) {
                    roadData.forEach(r => roads.add(`${r.x},${r.y}`));
                }
            } catch (e) { console.log("No roads found or invalid JSON"); }
        }

        // Initialize animation state
        houses.forEach(h => h.hoverAnim = 0);
    } catch (e) {
        console.error("Failed to load data detailed:", e);
        // Fallback for visual debugging
        houses = [{ x: 0, y: 0, color: "#ff6b6b", hoverAnim: 0, username: "Error" }];
        alert("Failed to load data. Check console (F12) for details.\n" + e.message);
    }

    // Init Clouds
    cloudSystem = new CloudSystem();
    // Init NPCs
    npcManager = new NPCManager(15);

    requestAnimationFrame(render);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // initial center if needed, but (0,0) is fine for now
}

// --- Input Handling ---
function setupInputListeners() {
    // Mouse
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    // Interaction Click
    canvas.addEventListener('click', e => {
        // Prevent click if we dragged
        // We can track drag distance, but for now let's assume if it wasn't a long drag
        // Wait, standard click behavior is fine usually.

        // 1. Get World Pos
        const worldPos = screenToWorld(e.clientX, e.clientY);
        // 2. Get Grid Pos
        const gridPos = worldToGrid(worldPos.x, worldPos.y);
        const gx = Math.round(gridPos.x);
        const gy = Math.round(gridPos.y);

        // 3. Check House
        const house = houses.find(h => h.x === gx && h.y === gy);
        if (house && !house.obstacle) {
            // Spawn NPC from this house center
            // NPC coords are Cartesian (Grid * Scale)
            // Scale = TILE_WIDTH / 2
            const scale = TILE_WIDTH / 2;
            if (npcManager) {
                // Offset to spawn outside door
                // Default door is at local Y+, Right-facing door is at local X+
                let spawnX = gx * scale;
                let spawnY = gy * scale;
                const offset = 20; // House depth (18) + Buffer

                if (house.facing === 'right') {
                    spawnX += offset;
                } else {
                    spawnY += offset;
                }

                npcManager.spawnNPC(spawnX, spawnY);
            }
        }
    });

    window.addEventListener('mouseup', () => isDragging = false);

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        // Update current mouse always (for hover)
        currentMouseX = e.clientX;
        currentMouseY = e.clientY;

        camera.x -= dx / camera.zoom;
        camera.y -= dy / camera.zoom;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    // Track mouse move even when not dragging
    canvas.addEventListener('mousemove', e => {
        if (isDragging) return; // handled above
        currentMouseX = e.clientX;
        currentMouseY = e.clientY;
    });

    // Wheel Zoom
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;

        const oldZoom = camera.zoom;
        let newZoom = oldZoom + delta;
        newZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, newZoom));

        // Zoom towards mouse pointer logic
        // World coordinates of mouse before zoom
        // Screen = (World - Camera) * Zoom + Center
        // World = (Screen - Center) / Zoom + Camera

        const screenX = e.clientX;
        const screenY = e.clientY;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const worldMouseX = (screenX - centerX) / oldZoom + camera.x;
        const worldMouseY = (screenY - centerY) / oldZoom + camera.y;

        camera.zoom = newZoom;

        // Adjust camera so worldMouse is still under screenMouse
        // worldMouse = (screen - center) / newZoom + newCamera
        // newCamera = worldMouse - (screen - center) / newZoom

        camera.x = worldMouseX - (screenX - centerX) / newZoom;
        camera.y = worldMouseY - (screenY - centerY) / newZoom;

    }, { passive: false });

    // Touch
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            isDragging = true;
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
            initialZoom = camera.zoom;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault(); // Prevent scrolling
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - lastMouseX;
            const dy = e.touches[0].clientY - lastMouseY;

            camera.x -= dx / camera.zoom;
            camera.y -= dy / camera.zoom;

            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const currentDist = getDistance(e.touches[0], e.touches[1]);
            if (initialPinchDistance > 0) {
                const scale = currentDist / initialPinchDistance;
                let newZoom = initialZoom * scale;
                newZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, newZoom));
                camera.zoom = newZoom;

                // Note: Pinch zoom to center could be improved here similarly to mouse wheel
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', () => {
        isDragging = false;
        initialPinchDistance = null;
    });
}

function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// --- Core Math ---

// Screen to World for Mouse interactions
function screenToWorld(sx, sy) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    return {
        x: (sx - centerX) / camera.zoom + camera.x,
        y: (sy - centerY) / camera.zoom + camera.y
    };
}

// Convert Grid (iso) coords to World (screen-space-like 2D plane) coords
// Standard Isometric projection:
// x' = (x - y) * W/2
// y' = (x + y) * H/2
function gridToWorld(gridX, gridY) {
    return {
        x: (gridX - gridY) * (TILE_WIDTH / 2),
        y: (gridX + gridY) * (TILE_HEIGHT / 2)
    };
}

// Inverse: World to Grid
// Solving the system of equations above
function worldToGrid(worldX, worldY) {
    // worldX / (W/2) = x - y
    // worldY / (H/2) = x + y
    // let A = worldX / (W/2)
    // let B = worldY / (H/2)
    // 2x = A + B  => x = (A + B) / 2
    // 2y = B - A  => y = (B - A) / 2

    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    const A = worldX / halfW;
    const B = worldY / halfH;

    return {
        x: (A + B) / 2,
        y: (B - A) / 2
    };
}


// --- Rendering ---
function render() {
    // 0. Determine Palette
    const time = worldConfig.timeOfDay || 'day'; // 'day' or 'night'
    const colors = PALETTE[time] || PALETTE.day;
    const isNight = time === 'night';

    // 1. Clear background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Setup transform
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 3. Render Ground
    renderVisibleGrid();

    // 4. Render Houses (Calculate hover first)
    updateHoverState();
    renderHouses();

    // 4b. Render NPCs (Ideally integrated with houses for depth, but overlaid for now)
    if (npcManager) {
        npcManager.update();
        npcManager.render(ctx);
    }

    // 5. Draw Smoke / Particles (World Space)
    drawParticles();

    // 5b. Draw Clouds (Day Only)
    if (cloudSystem && worldConfig.timeOfDay !== 'night') {
        cloudSystem.update();
        cloudSystem.render(ctx);
    }

    // 6. Draw Weather (Overlay)
    drawWeather();

    ctx.restore();

    requestAnimationFrame(render);
}


// --- Particle System (Smoke) ---
let particles = [];
function drawParticles() {
    // Update and Draw in one loop
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.01;
        p.x += p.vx;
        p.y += p.vy;
        p.radius += 0.05; // Expand

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Helper to spawn smoke
function spawnSmoke(x, y) {
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 0.5 + 0.5, // Drift right (wind)
        vy: -0.5 - Math.random() * 0.5, // Float up
        life: 1.0,
        radius: 2 + Math.random() * 2
    });
}

// --- Weather Components ---
let rainDrops = [];
function drawWeather() {
    if (worldConfig.weather !== 'rain') return;

    // Reset overlay transform to draw HUD-style rain or World-style?
    // Rain looks best as a screen overlay (HUD style) so it covers everything including UI scale
    // But currently we are inside ctx.save()/restore() with camera transform applied.
    // If we want screen-space rain, we should restore first? 
    // Actually, render() restores at end. We can briefly restore or just invert transform?
    // EASIEST: Just draw large area covering camera view, but screen space is better for "lens effect".

    // Let's do Screen Space Rain.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to Identity (Screen Coordinates)

    const w = canvas.width;
    const h = canvas.height;

    // Init Rain if needed
    if (rainDrops.length < 500) {
        for (let i = 0; i < 50; i++) {
            rainDrops.push({
                x: Math.random() * w,
                y: Math.random() * h,
                l: Math.random() * 20 + 10,
                v: Math.random() * 10 + 15
            });
        }
    }

    ctx.strokeStyle = "rgba(174, 194, 224, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < rainDrops.length; i++) {
        const d = rainDrops[i];

        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.l); // Slight tilt

        // Update
        d.y += d.v;
        d.x -= 0.5; // Wind

        // Reset
        if (d.y > h) {
            d.y = -d.l;
            d.x = Math.random() * w;
        }
    }
    ctx.stroke();

    ctx.restore();
}

function renderVisibleGrid() {
    // Determine visible world bounds to minimize drawing
    // This is an approximation. A robust solution projects screen corners to world space.

    // Screen boundaries in world space
    // We need to inverse project the screen corners to 'World Plane' (not Grid index yet)
    // Top-Left Screen (0,0) -> World
    // Bottom-Right Screen (W,H) -> World

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Screen corners relative to center
    const tlX = -centerX;
    const tlY = -centerY;
    const brX = centerX;
    const brY = centerY;

    // Transform to camera space
    // (ScreenPos / zoom) + cameraPos = WorldPos
    const worldLeft = (tlX / camera.zoom) + camera.x;
    const worldTop = (tlY / camera.zoom) + camera.y;
    const worldRight = (brX / camera.zoom) + camera.x;
    const worldBottom = (brY / camera.zoom) + camera.y;

    // Now convert these bounding box corners to Grid coordinates to find min/max Grid X/Y
    // Since isometric grid is rotated 45deg, the bounding box in grid space is also rotated.
    // We need to test all 4 corners to find min/max.

    const corners = [
        worldToGrid(worldLeft, worldTop),
        worldToGrid(worldRight, worldTop),
        worldToGrid(worldRight, worldBottom),
        worldToGrid(worldLeft, worldBottom)
    ];

    let minGridX = Infinity, maxGridX = -Infinity;
    let minGridY = Infinity, maxGridY = -Infinity;

    corners.forEach(p => {
        minGridX = Math.min(minGridX, p.x);
        maxGridX = Math.max(maxGridX, p.x);
        minGridY = Math.min(minGridY, p.y);
        maxGridY = Math.max(maxGridY, p.y);
    });

    // Add some padding to prevent popping at edges
    const startX = Math.floor(minGridX) - 2;
    const endX = Math.ceil(maxGridX) + 2;
    const startY = Math.floor(minGridY) - 2;
    const endY = Math.ceil(maxGridY) + 2;

    // Draw tiles
    ctx.lineWidth = 1;

    for (let gy = startY; gy <= endY; gy++) {
        for (let gx = startX; gx <= endX; gx++) {
            const worldPos = gridToWorld(gx, gy);
            const tileKey = `${gx},${gy}`;

            if (roads.has(tileKey)) {
                drawRoadTile(gx, gy, worldPos);
            } else {
                // Natural Grass Pattern
                const colors = PALETTE[worldConfig.timeOfDay || 'day'] || PALETTE.day;

                // Use a pseudo-random hash to pick distinct grass shades
                // Simple deterministic noise
                const seed = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453; // common GLSL pseudo-random
                const noise = Math.abs(seed - Math.floor(seed));

                // 3 subtle variants
                if (noise < 0.6) ctx.fillStyle = colors.grassBase;      // Base
                else if (noise < 0.9) ctx.fillStyle = colors.grassDark; // Slightly Darker
                else ctx.fillStyle = colors.grassLight;                  // Slightly Lighter

                // Draw Diamond path
                ctx.beginPath();
                ctx.moveTo(worldPos.x, worldPos.y - TILE_HEIGHT / 2);
                ctx.lineTo(worldPos.x + TILE_WIDTH / 2, worldPos.y);
                ctx.lineTo(worldPos.x, worldPos.y + TILE_HEIGHT / 2);
                ctx.lineTo(worldPos.x - TILE_WIDTH / 2, worldPos.y);
                ctx.closePath();

                // Fill with slightly overlapped rect to prevent subpixel lines? 
                // Canvas path fill is usually okay.
                ctx.fill();

                // Organic Details (Procedural Placement + Wind)
                // Threshold: noise > 0.70 means 30% of tiles get something
                if (noise > 0.70) {
                    const decType = Math.floor((seed * 100) % 10);
                    // Generate a pseudo-random offset from center
                    const ox = ((seed * 57.1) % 40) - 20;
                    const oy = ((seed * 21.3) % 18) - 9;
                    const tx = worldPos.x + ox;
                    const ty = worldPos.y + oy;

                    // Wind Animation
                    const time = Date.now() * 0.002;
                    const sway = Math.sin(time + tx * 0.02 + ty * 0.03) * 2;

                    if (decType < 6) {
                        // Grass Tuft (Small strokes)
                        ctx.strokeStyle = "#76c47c"; // Slightly darker pastel green for contrast
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(tx, ty); ctx.lineTo(tx - 3 + sway, ty - 4);
                        ctx.moveTo(tx, ty); ctx.lineTo(tx + 2 + sway, ty - 5);
                        ctx.stroke();
                    } else if (decType < 9) {
                        // Flowers (Simple dots)
                        const colors = ["#ffb7b2", "#ffdac1", "#e2f0cb", "#b5ead7", "#c7ceea"]; // Pastel Rainbow
                        const cIdx = Math.floor((seed * 13) % colors.length);

                        const fx = tx + sway * 0.5;

                        ctx.fillStyle = colors[cIdx];
                        ctx.beginPath();
                        ctx.arc(fx, ty - 3, 2, 0, Math.PI * 2);
                        ctx.fill();

                        // Stem
                        ctx.strokeStyle = "#76c47c";
                        ctx.beginPath();
                        ctx.moveTo(tx, ty); ctx.lineTo(fx, ty - 3);
                        ctx.stroke();

                        // White center
                        ctx.fillStyle = "#fff";
                        ctx.beginPath();
                        ctx.arc(fx, ty - 3, 0.8, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Small Bush
                        ctx.fillStyle = "#8dd693"; // Bush Pastel Green
                        const bx = tx + sway * 0.3;
                        ctx.beginPath();
                        ctx.arc(bx, ty, 4, 0, Math.PI * 2);
                        ctx.arc(bx + 3, ty + 1, 3, 0, Math.PI * 2);
                        ctx.arc(bx - 2, ty + 2, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // No grid lines for natural look
            }
        }
    }
}



function drawRoadTile(gx, gy, pos) {
    // 1. Identify Neighbors
    const hasN = roads.has(`${gx},${gy - 1}`);
    const hasS = roads.has(`${gx},${gy + 1}`);
    const hasE = roads.has(`${gx + 1},${gy}`);
    const hasW = roads.has(`${gx - 1},${gy}`);

    // 2. Draw Sidewalk Base (Full Tile)
    ctx.fillStyle = "#bdc3c7"; // Concrete Color
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - halfH);
    ctx.lineTo(pos.x + halfW, pos.y);
    ctx.lineTo(pos.x, pos.y + halfH);
    ctx.lineTo(pos.x - halfW, pos.y);
    ctx.closePath();
    ctx.fill();

    // 3. Draw Asphalt (Adaptive)
    const rW = 0.6; // Road is 60% of tile width
    // Vertices of the "Center Patch"
    const cpTop = { x: pos.x, y: pos.y - halfH * rW };
    const cpRight = { x: pos.x + halfW * rW, y: pos.y };
    const cpBottom = { x: pos.x, y: pos.y + halfH * rW };
    const cpLeft = { x: pos.x - halfW * rW, y: pos.y };

    ctx.fillStyle = "#34495e"; // Wet Asphalt / Dark Blue-Grey

    // Draw Center Patch
    ctx.beginPath();
    ctx.moveTo(cpTop.x, cpTop.y);
    ctx.lineTo(cpRight.x, cpRight.y);
    ctx.lineTo(cpBottom.x, cpBottom.y);
    ctx.lineTo(cpLeft.x, cpLeft.y);
    ctx.fill();

    // Helper to get World coords from Grid Offset relative to Center
    const g2w = (gdx, gdy) => {
        return {
            x: pos.x + (gdx - gdy) * halfW,
            y: pos.y + (gdx + gdy) * halfH
        };
    };

    const w = rW / 2; // half-width in grid units (0 to 0.5)

    // Draw Arms (Asphalt Fills)
    if (hasN) {
        const p1 = g2w(-w, -w); const p2 = g2w(w, -w);
        const p3 = g2w(w, -0.5); const p4 = g2w(-w, -0.5);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
    }
    if (hasS) {
        const p1 = g2w(-w, w); const p2 = g2w(w, w);
        const p3 = g2w(w, 0.5); const p4 = g2w(-w, 0.5);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
    }
    if (hasE) {
        const p1 = g2w(w, -w); const p2 = g2w(w, w);
        const p3 = g2w(0.5, w); const p4 = g2w(0.5, -w);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
    }
    if (hasW) {
        const p1 = g2w(-w, -w); const p2 = g2w(-w, w);
        const p3 = g2w(-0.5, w); const p4 = g2w(-0.5, -w);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
    }

    // 4. Markings (Refined: Continuous lines)
    ctx.strokeStyle = "#ecf0f1";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]); // Cleaner dash size

    const neighborCount = [hasN, hasS, hasE, hasW].filter(Boolean).length;

    if (neighborCount === 2 && ((hasN && hasS) || (hasE && hasW))) {
        // STRAIGHT: Draw single line from edge to edge
        ctx.beginPath();
        if (hasN && hasS) {
            const start = g2w(0, -0.5);
            const end = g2w(0, 0.5);
            ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
        } else {
            const start = g2w(-0.5, 0); // West Edge
            const end = g2w(0.5, 0);    // East Edge
            ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
        }
        ctx.stroke();

    } else if (neighborCount === 2) {
        // TURN: Draw single continuous curve
        ctx.beginPath();
        // Control point is always center (0,0) for these 90deg turns on grid
        const cp = g2w(0, 0);
        let start, end;

        if (hasN && hasE) {
            start = g2w(0, -0.5); end = g2w(0.5, 0);
        } else if (hasN && hasW) {
            start = g2w(0, -0.5); end = g2w(-0.5, 0);
        } else if (hasS && hasE) {
            start = g2w(0, 0.5); end = g2w(0.5, 0);
        } else if (hasS && hasW) {
            start = g2w(0, 0.5); end = g2w(-0.5, 0);
        }

        if (start && end) {
            ctx.moveTo(start.x, start.y);
            ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
            ctx.stroke();
        }
    } else {
        // Intersections (3, 4) or Dead Ends (1) or Isolated (0)
        // Draw stubs from edge to patch-boundary only. Keep intersection clear.
        // Boundary is 'w' (e.g. 0.3)
        const drawStub = (gdxStart, gdyStart, gdxEnd, gdyEnd) => {
            ctx.beginPath();
            const s = g2w(gdxStart, gdyStart);
            const e = g2w(gdxEnd, gdyEnd);
            ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            ctx.stroke();
        };

        if (hasN) drawStub(0, -0.5, 0, -w);
        if (hasS) drawStub(0, 0.5, 0, w);
        if (hasE) drawStub(0.5, 0, w, 0);
        if (hasW) drawStub(-0.5, 0, -w, 0);
    }

    ctx.setLineDash([]);

    // 5. Outline / Edge (Bright and Visible)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8; // Slight transparency for blending
    // N
    if (hasN) {
        ctx.beginPath(); ctx.moveTo(g2w(-w, -0.5).x, g2w(-w, -0.5).y); ctx.lineTo(g2w(-w, -w).x, g2w(-w, -w).y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g2w(w, -0.5).x, g2w(w, -0.5).y); ctx.lineTo(g2w(w, -w).x, g2w(w, -w).y); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(g2w(-w, -w).x, g2w(-w, -w).y); ctx.lineTo(g2w(w, -w).x, g2w(w, -w).y); ctx.stroke(); }
    // S
    if (hasS) {
        ctx.beginPath(); ctx.moveTo(g2w(-w, 0.5).x, g2w(-w, 0.5).y); ctx.lineTo(g2w(-w, w).x, g2w(-w, w).y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g2w(w, 0.5).x, g2w(w, 0.5).y); ctx.lineTo(g2w(w, w).x, g2w(w, w).y); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(g2w(-w, w).x, g2w(-w, w).y); ctx.lineTo(g2w(w, w).x, g2w(w, w).y); ctx.stroke(); }
    // E
    if (hasE) {
        ctx.beginPath(); ctx.moveTo(g2w(0.5, -w).x, g2w(0.5, -w).y); ctx.lineTo(g2w(w, -w).x, g2w(w, -w).y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g2w(0.5, w).x, g2w(0.5, w).y); ctx.lineTo(g2w(w, w).x, g2w(w, w).y); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(g2w(w, -w).x, g2w(w, -w).y); ctx.lineTo(g2w(w, w).x, g2w(w, w).y); ctx.stroke(); }
    // W
    if (hasW) {
        ctx.beginPath(); ctx.moveTo(g2w(-0.5, -w).x, g2w(-0.5, -w).y); ctx.lineTo(g2w(-w, -w).x, g2w(-w, -w).y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(g2w(-0.5, w).x, g2w(-0.5, w).y); ctx.lineTo(g2w(-w, w).x, g2w(-w, w).y); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(g2w(-w, -w).x, g2w(-w, -w).y); ctx.lineTo(g2w(-w, w).x, g2w(-w, w).y); ctx.stroke(); }

    ctx.globalAlpha = 1.0; // Reset
}

function renderHouses() {
    // Sort houses for painter's algorithm
    // In isometric, depth value is typically (x + y). 
    // Higher x + y means closer to the viewer (lower on screen)
    // So we render lower (x+y) first, and higher (x+y) last.

    const sortedHouses = [...houses].sort((a, b) => {
        return (a.x + a.y) - (b.x + b.y);
    });

    // We ideally should cull houses that are offscreen here too, 
    // but unless we have thousands, iterating is cheap. Drawing is the cost.

    for (const house of sortedHouses) {
        if (house.obstacle === 'tree') {
            drawTree(house.x, house.y, ctx);
        } else {
            drawHouse(house.x, house.y, house.color, house.roofStyle, house.doorStyle, house.windowStyle, house.chimneyStyle, house.wallStyle, house.hoverAnim, house.username, house.abandoned, house.facing, house.has_terrace);
        }
    }
}



function updateHoverState() {
    // 1. Get Mouse in World
    const worldMouse = screenToWorld(currentMouseX, currentMouseY);

    // 2. Convert to Grid
    const gridP = worldToGrid(worldMouse.x, worldMouse.y);

    // 3. Round to find tile
    const gx = Math.round(gridP.x);
    const gy = Math.round(gridP.y);

    // 4. Update Animations
    for (const house of houses) {
        const isHovered = (house.x === gx && house.y === gy);
        const target = isHovered ? 1.0 : 0.0;
        // Smooth Lerp
        house.hoverAnim += (target - house.hoverAnim) * 0.3;
    }
}

function drawHouse(gx, gy, color, roofStyle, doorStyle, windowStyle, chimneyStyle, wallStyle, hoverAnim, username, abandoned, facing, has_terrace) {
    const isoCenter = gridToWorld(gx, gy);

    // --- "Sketchy" Style Hook (Abandoned Only) ---
    // Save original stroke
    const originalStroke = ctx.stroke;
    if (abandoned) {
        // Override stroke to draw multiple jittery lines
        ctx.stroke = function () {
            const lineWidth = ctx.lineWidth;
            const strokeStyle = ctx.strokeStyle;

            ctx.save();
            // Pass 1: Semi-transparent based on original
            // Just draw slightly jittered versions

            // Jitter 1
            ctx.translate((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5);
            originalStroke.call(ctx);

            // Jitter 2
            ctx.translate((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5);
            originalStroke.call(ctx);

            ctx.restore();

            // Draw main line? Or just the jitters? 
            // Users request "sketchy". Just jitters looks ghosty.
            // Let's render the main one too but maybe thinner?
            // Actually, overlaying 2 jitters usually looks good enough as "sketchy".
            // Let's add a central one for definition.
            originalStroke.call(ctx);
        };
    }

    // Apply Hover Lift
    const lift = (hoverAnim || 0) * 4; // Lift 4 pixels
    const scale = 1 + (hoverAnim || 0) * 0.02; // Slight scale up

    // Apply transformation to the center for this house
    // We can't transform the whole ctx easily inside this complex function without messing up clip paths potentially?
    // Actually, 'toScreen' logic handles offsets. Let's just adjust 'isoCenter.y' effectively.
    // But 'scale' needs center. 

    // Let's modify 'toScreen' to include lift

    function toScreen(lx, ly, lz) {
        // Simple projection reuse

        // ROTATION: Swap X and Y if facing "right"
        // Default (Original) = "left"
        if (facing === 'right') {
            const temp = lx; lx = ly; ly = temp;
        }

        // Apply "Wobble" if abandoned
        let dx = 0, dy = 0;
        if (abandoned) {
            // Deterministic noise based on local coords
            // Reduced wobble amplitude significantly to avoid "broken" look being "glitchy"
            const seed = (lx * 73 + ly * 37 + lz * 13 + gx * 100 + gy);
            dx = (Math.sin(seed) * 0.5); // wobble X (was 2.5)
            dy = (Math.cos(seed * 0.5) * 0.5); // wobble Y (was 2.5)

            // Sag the roof?
            if (lz > wallHeight) {
                dy += 2; // Drop visuals at height
            }
        }

        const sx = isoCenter.x + (lx - ly) + dx;
        const sy = isoCenter.y + (lx + ly) * 0.5 - lz - lift + dy;
        return { x: sx, y: sy };
    }

    // Shadow should NOT lift, so draw it first separately or adjust?
    // Shadow is at z=0. If house lifts, shadow stays or fades?
    // Usually shadow shrinks or stays. Let's keep shadow on ground.

    // Shadow Drawing (Local Override)
    // 1. Shadow (Circular base shadow)
    // We want the shadow to stay on the ground (no lift).
    const sCenter = gridToWorld(gx, gy); // Recalc original without lift

    // Scale shadow down slightly when lifted to give depth effect?
    const sScale = 1 - (hoverAnim || 0) * 0.1;

    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();

    // Shadow Dimensions depend on rotation
    let sw = 16, sd = 18;
    if (facing === 'right') { sw = 18; sd = 16; }

    ctx.ellipse(sCenter.x, sCenter.y, (sw * 1.5) * sScale, (sd * 0.8) * sScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Override toScreen for the rest of the house geometry to include LIFT
    // (Function defined above acts as the override for subsequent calls)

    // House Dimensions - "Less Wide"
    const hw = 16;  // Half-Width (Side to side relative to gable)
    const hd = 18;  // Half-Depth (Front to back)
    let wallHeight = 35;
    if (has_terrace) wallHeight = 60; // 2 Floors

    let roofHeight = 30; // Higher roof looks cozier
    if (abandoned) roofHeight = 22; // Collapsed look
    const overhang = 4;    // Roof overhang magnitude (Key for 'good' look)

    // Colors
    let wallColor = "#fdfbf7";
    let wallShadow = "#e0dad1";
    let glassColor1 = "#74b9ff"; // Standard Blue
    let glassColor2 = "#81ecec"; // Cyan/Turquoise

    if (abandoned) {
        wallColor = "#95a5a6"; // Concrete/Dirty Grey
        wallShadow = "#7f8c8d";
        color = "#535c68"; // Override roof to dark grey
        glassColor1 = "#2d3436"; // Broken/Dark
        glassColor2 = "#2d3436";
    } else {
        // Night Mode Window Light Logic
        const isNight = worldConfig.timeOfDay === 'night';
        // Randomly light up windows if night (mostly on)
        if (isNight) {
            // Hash for stable randomness per house
            const seed = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453);
            const isLit = seed > 0.2; // 80% of houses lit

            if (isLit) {
                glassColor1 = "#f1c40f"; // Warm Yellow Light
                glassColor2 = "#f39c12"; // Oranger Light
            } else {
                glassColor1 = "#2c3e50"; // Dark Blue (Unlit at night)
                glassColor2 = "#34495e";
            }

            // Darken Walls and Roof for Night
            // Slightly blue-tined grey for walls at night
            wallColor = "#90a4ae";
            wallShadow = "#607d8b";
            // Darken Roof Color (Simple overlay)
            // We'll use adjustColor helper to darken significantly
            color = adjustColor(color, -60);

        }
    }

    const roofColorMain = adjustColor(color, -20);
    const roofColorDark = adjustColor(color, -40);
    const roofEdgeColor = adjustColor(color, -50);

    // --- Geometry Points ---

    // 1. Wall Ground Corners
    // Note: With rotation logic, let's say "Front" is +Y face (Bottom Left on screen)
    // "Side" is +X face (Bottom Right on screen)
    const b1 = toScreen(hw, hd, 0);   // Front-Bottom Corner
    const b2 = toScreen(hw, -hd, 0);  // Right-Bottom Corner
    const b3 = toScreen(-hw, -hd, 0); // Back-Bottom
    const b4 = toScreen(-hw, hd, 0);  // Left-Bottom

    // 2. Wall Top Corners
    const t1 = toScreen(hw, hd, wallHeight);
    const t2 = toScreen(hw, -hd, wallHeight);
    const t3 = toScreen(-hw, -hd, wallHeight);
    const t4 = toScreen(-hw, hd, wallHeight);

    // 3. Roof Geometry (With Overhangs)
    const rhw = hw + overhang; // Roof width radius
    const rhd = hd + overhang; // Roof depth radius

    // Ridge (Peak) - Centered X, runs along Y
    const rFront = toScreen(0, rhd, wallHeight + roofHeight);
    const rBack = toScreen(0, -rhd, wallHeight + roofHeight);

    // Eaves (Bottom corners of roof slope)
    const eFrontRight = toScreen(rhw, rhd, wallHeight);
    const eBackRight = toScreen(rhw, -rhd, wallHeight);
    const eFrontLeft = toScreen(-rhw, rhd, wallHeight);
    // eBackLeft not visible

    // --- Draw Cycle ---

    // 1. Shadow (Circular base shadow) - MOVED UP TO HANDLED HOVER
    // ctx.fillStyle = "rgba(0,0,0,0.15)";
    // ctx.beginPath();
    // ctx.ellipse(isoCenter.x, isoCenter.y, hw * 1.5, hd * 0.8, 0, 0, Math.PI * 2);
    // ctx.fill();

    // 2. Right Wall (+X facing) - The "Side" of the house
    // Let's add corner posts (trim) for better structure
    const trimW = 2; // Width of corner trim

    ctx.fillStyle = wallShadow;
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.stroke();

    // Right Wall Corner Trim (Right Edge)
    ctx.fillStyle = adjustColor(wallColor, -10); // Slightly distinct trim
    ctx.beginPath();
    ctx.moveTo(b2.x, b2.y); // Bottom Right
    ctx.lineTo(toScreen(hw - trimW, -hd, 0).x, toScreen(hw - trimW, -hd, 0).y); // In slightly
    ctx.lineTo(toScreen(hw - trimW, -hd, wallHeight).x, toScreen(hw - trimW, -hd, wallHeight).y); // Up
    ctx.lineTo(t2.x, t2.y); // Top Right
    ctx.fill();

    // Window on Right Wall
    // 1. Setup Helper for Right Wall Rects (facing +X)
    function drawRightRect(cx, cy, cz, w, h, color) {
        // Center (cx, cy, cz). Width w (along Y), Height h (along Z)
        // Rect on plane X = cx
        const y1 = cy - w / 2;
        const y2 = cy + w / 2;
        const z1 = cz - h / 2;
        const z2 = cz + h / 2;

        const p1 = toScreen(cx, y2, z1); // BL
        const p2 = toScreen(cx, y1, z1); // BR 
        const p3 = toScreen(cx, y1, z2); // TR
        const p4 = toScreen(cx, y2, z2); // TL

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        // ctx.stroke(); // Optional stroke
    }

    // --- Wall Textures Helper ---
    function drawWallTexture(wallId, style) {
        // wallId: 0 = Right Wall (+X), 1 = Front Wall (+Y)
        // Style: 0=Clapboard, 1=Brick, 2=Stone, 3=Vertical

        const s = (style !== undefined) ? style : 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.1)"; // Subtle texture line

        if (s === 0) {
            // --- Style 0: Clapboard (Horizontal Lines) ---
            const spacing = 5;
            // For Right Wall (+X), running along Y. Z varies.
            // For Front Wall (+Y), running along X. Z varies.
            // Horizontal on a wall means constant Z lines.

            for (let z = 1; z < wallHeight; z += spacing) {
                // Skip Foundation area (0-4)
                if (z < 5) continue;

                ctx.beginPath();
                if (wallId === 0) {
                    // Right Wall: x=hw, y from -hd to hd (Wait, Right wall is y varies)
                    // b1(hw,hd) -> b2(hw,-hd)
                    const pStart = toScreen(hw, hd, z);
                    const pEnd = toScreen(hw, -hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                } else {
                    // Front Wall: y=hd, x from -hw to hw
                    // b4(-hw,hd) -> b1(hw,hd)
                    const pStart = toScreen(-hw, hd, z);
                    const pEnd = toScreen(hw, hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                }
                ctx.stroke();
            }

        } else if (s === 1) {
            // --- Style 1: Brick ---
            const bH = 4;
            const bW = 8;
            ctx.strokeStyle = "rgba(0,0,0,0.15)";

            for (let z = 4; z < wallHeight; z += bH) {
                const row = Math.floor(z / bH);
                const offset = (row % 2) * (bW / 2);

                // Horizontal Line
                ctx.beginPath();
                if (wallId === 0) {
                    const pStart = toScreen(hw, hd, z);
                    const pEnd = toScreen(hw, -hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                } else {
                    const pStart = toScreen(-hw, hd, z);
                    const pEnd = toScreen(hw, hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                }
                ctx.stroke();

                // Vertical Ticks
                if (wallId === 0) {
                    // Right Wall: Length is approx 2*hd = 36.
                    for (let y = -hd + offset; y < hd; y += bW) {
                        ctx.beginPath();
                        const pBot = toScreen(hw, y, z);
                        const pTop = toScreen(hw, y, z + bH);
                        ctx.moveTo(pBot.x, pBot.y);
                        ctx.lineTo(pTop.x, pTop.y);
                        ctx.stroke();
                    }
                } else {
                    // Front Wall: Length is 2*hw = 32
                    for (let x = -hw + offset; x < hw; x += bW) {
                        ctx.beginPath();
                        const pBot = toScreen(x, hd, z);
                        const pTop = toScreen(x, hd, z + bH);
                        ctx.moveTo(pBot.x, pBot.y);
                        ctx.lineTo(pTop.x, pTop.y);
                        ctx.stroke();
                    }
                }
            }
        } else if (s === 2) {
            // --- Style 2: Vertical Board & Batten ---
            const spacing = 8;
            ctx.strokeStyle = "rgba(0,0,0,0.15)";

            if (wallId === 0) {
                // Right Wall (Y varies)
                for (let y = -hd; y <= hd; y += spacing) {
                    ctx.beginPath();
                    const pBot = toScreen(hw, y, 4);
                    const pTop = toScreen(hw, y, wallHeight);
                    ctx.moveTo(pBot.x, pBot.y);
                    ctx.lineTo(pTop.x, pTop.y);
                    ctx.stroke();
                }
            } else {
                // Front Wall (X varies)
                for (let x = -hw; x <= hw; x += spacing) {
                    ctx.beginPath();
                    const pBot = toScreen(x, hd, 4);
                    // Calc top based on gable if needed, but wallHeight is fine for main box
                    // Front wall has a gable above wallHeight, handled separately?
                    // The standard wall rect goes to wallHeight.
                    const pTop = toScreen(x, hd, wallHeight);
                    ctx.moveTo(pBot.x, pBot.y);
                    ctx.lineTo(pTop.x, pTop.y);
                    ctx.stroke();
                }
            }

        } else if (s === 3) {
            // --- Style 3: Stone Blocks ---
            const rowH = 8;

            for (let z = 4; z < wallHeight; z += rowH) {
                const row = Math.floor(z / rowH);

                // Horizontal Line
                ctx.beginPath();
                if (wallId === 0) {
                    const pStart = toScreen(hw, hd, z);
                    const pEnd = toScreen(hw, -hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                } else {
                    const pStart = toScreen(-hw, hd, z);
                    const pEnd = toScreen(hw, hd, z);
                    ctx.moveTo(pStart.x, pStart.y);
                    ctx.lineTo(pEnd.x, pEnd.y);
                }
                ctx.stroke();

                // Verticals (Randomized or Offset)
                const stoneW = (row % 2 === 0) ? 12 : 8;
                const offset = (row * 7) % stoneW;

                if (wallId === 0) {
                    // Right Wall
                    for (let y = -hd + offset; y < hd; y += stoneW) {
                        ctx.beginPath();
                        const pBot = toScreen(hw, y, z);
                        const pTop = toScreen(hw, y, z + rowH);
                        ctx.moveTo(pBot.x, pBot.y);
                        ctx.lineTo(pTop.x, pTop.y);
                        ctx.stroke();
                    }
                } else {
                    // Front Wall
                    for (let x = -hw + offset; x < hw; x += stoneW) {
                        ctx.beginPath();
                        const pBot = toScreen(x, hd, z);
                        const pTop = toScreen(x, hd, z + rowH);
                        ctx.moveTo(pBot.x, pBot.y);
                        ctx.lineTo(pTop.x, pTop.y);
                        ctx.stroke();
                    }
                }

            }
        }
    }

    // Apply Texture to Right Wall
    // Clip to wall area to be safe? The drawing is precise, so just draw.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t1.x, t1.y);
    ctx.clip();
    drawWallTexture(0, wallStyle);
    ctx.restore();

    let wStyle = (windowStyle !== undefined) ? windowStyle : 0;
    if (abandoned) wStyle = -1; // Force boarded up
    const winY = 0; // Centered on wall Y
    const winZ = wallHeight / 2 + 2;
    const winX = hw + 0.2; // Surface

    if (wStyle === -1) {
        // --- Style -1: Boarded Up (Abandoned) ---
        const winW = 10;
        const winH = 14;

        // 1. Dark Hole (Missing Glass)
        drawRightRect(winX, winY, winZ, winW, winH, "#1e1e1e"); // Pitch black/void

        // 2. Boards (Haphazard)
        // Helper for a crooked plank
        function drawPlank(zPos, width, angle) {
            const angleRad = angle * (Math.PI / 180);
            const cx = winX + 0.5;
            const cy = winY;
            const cz = zPos;

            // Simple rotated Rect on Side Wall plane... 
            // Actually, simplest is just endpoints.
            // Plank is mostly along Y axis (width), tilted in Z.
            // Let's manually compute corners for a "Strip".

            const w2 = width / 2;
            const h2 = 1.5; // Plank height

            // Unrotated offsets
            // y from -w2 to w2
            // z from -h2 to h2

            // Rotate around X axis (tilt)? No, we want to rotate in the Y-Z plane of the wall.
            // y' = y*cos - z*sin
            // z' = y*sin + z*cos

            const c = Math.cos(angleRad);
            const s = Math.sin(angleRad);

            function rot(y, z) {
                return { y: y * c - z * s, z: y * s + z * c };
            }

            const p1 = rot(-w2, -h2);
            const p2 = rot(w2, -h2);
            const p3 = rot(w2, h2);
            const p4 = rot(-w2, h2);

            ctx.fillStyle = "#5d4037"; // Dark Wood
            ctx.beginPath();
            [p1, p2, p3, p4].forEach((p, i) => {
                const pt = toScreen(cx, cy + p.y, cz + p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.fill();
            // Nail
            ctx.fillStyle = "#95a5a6";
            const nail = toScreen(cx, cy + p1.y + (p2.y - p1.y) * 0.1, cz + p1.z + (p2.z - p1.z) * 0.1);
            ctx.beginPath(); ctx.arc(nail.x, nail.y, 0.5, 0, Math.PI * 2); ctx.fill();
            const nail2 = toScreen(cx, cy + p2.y - (p2.y - p1.y) * 0.1, cz + p2.z - (p2.z - p1.z) * 0.1);
            ctx.beginPath(); ctx.arc(nail2.x, nail2.y, 0.5, 0, Math.PI * 2); ctx.fill();
        }

        drawPlank(winZ, winW + 4, 15);
        drawPlank(winZ - 3, winW + 4, -10);
        drawPlank(winZ + 3, winW + 4, 5);

    } else if (wStyle === 0) {
        // --- Style 0: Classic Muntins (Cross) ---
        const winW = 10;
        const winH = 14;

        // Frame
        drawRightRect(winX, winY, winZ, winW + 3, winH + 3, "#dfe6e9");
        // Glass Background
        drawRightRect(winX + 0.5, winY, winZ, winW, winH, glassColor1);
        // Muntins (Cross)
        const bar = 1.2;
        drawRightRect(winX + 0.6, winY, winZ, bar, winH, "#dfe6e9"); // Vert
        drawRightRect(winX + 0.6, winY, winZ, winW, bar, "#dfe6e9"); // Horz
        // Sill
        drawRightRect(winX + 1, winY, winZ - winH / 2 - 1, winW + 5, 2, "#b2bec3");

    } else if (wStyle === 1) {
        // --- Style 1: Arched Window ---
        const winW = 10;
        const winH = 16;
        const archStartH = 10; // Height of the rectangular part

        // 1. Frame
        const fW = winW + 3;
        const fRad = fW / 2;
        const fCenterY = winY;
        const fBaseZ = (winZ - winH / 2) + archStartH; // Z where arch starts
        const bottomZ = winZ - winH / 2;

        ctx.fillStyle = "#dfe6e9";
        ctx.beginPath();

        // Start Bottom-Left (Front side bottom)
        const p_bl = toScreen(winX, fCenterY + fRad, bottomZ);
        // Bottom-Right (Back side bottom)
        const p_br = toScreen(winX, fCenterY - fRad, bottomZ);
        // Top-Right (Back side start of arch)
        const p_tr = toScreen(winX, fCenterY - fRad, fBaseZ);

        ctx.moveTo(p_bl.x, p_bl.y);
        ctx.lineTo(p_br.x, p_br.y);
        ctx.lineTo(p_tr.x, p_tr.y);

        // Arch: From Back (-Y) to Front (+Y)
        // theta 0 -> Back (-radius), theta PI -> Front (+radius)
        // y = -cos(t) * r
        // z = sin(t) * r
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI; // 0 to PI
            const ly = -Math.cos(t) * fRad;
            const lz = Math.sin(t) * fRad;
            const p = toScreen(winX, fCenterY + ly, fBaseZ + lz);
            ctx.lineTo(p.x, p.y);
        }

        // Close back to Bottom-Left
        ctx.lineTo(p_bl.x, p_bl.y);
        ctx.fill();

        // 2. Glass (Inset)
        const gW = winW;
        const gRad = gW / 2;
        const gBaseZ = fBaseZ; // Glass arch starts at same height relative to its rect
        // Actually, glass usually starts slightly higher? No, alignment is better.

        ctx.fillStyle = glassColor1;
        ctx.beginPath();

        const g_bl = toScreen(winX + 0.5, fCenterY + gRad, bottomZ + 1);
        const g_br = toScreen(winX + 0.5, fCenterY - gRad, bottomZ + 1);
        const g_tr = toScreen(winX + 0.5, fCenterY - gRad, gBaseZ);

        ctx.moveTo(g_bl.x, g_bl.y);
        ctx.lineTo(g_br.x, g_br.y);
        ctx.lineTo(g_tr.x, g_tr.y);

        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI;
            const ly = -Math.cos(t) * gRad;
            const lz = Math.sin(t) * gRad;
            const p = toScreen(winX + 0.5, fCenterY + ly, gBaseZ + lz);
            ctx.lineTo(p.x, p.y);
        }

        ctx.lineTo(g_bl.x, g_bl.y);
        ctx.fill();

        // 3. Details: Keystone or Muntins?
        // Simple muntin bar
        drawRightRect(winX + 0.6, winY, winZ, 1.5, winH - 2, "#dfe6e9"); // Vertical bar
        // Horizontal bar at arch base
        drawRightRect(winX + 0.6, winY, fBaseZ, gW, 1.5, "#dfe6e9");


    } else if (wStyle === 2) {
        // --- Style 2: Canvas Awning Window ---
        const winW = 10;
        const winH = 12;

        // 1. Basic Window
        drawRightRect(winX, winY, winZ, winW, winH, "#b2bec3"); // Grey Frame
        drawRightRect(winX + 0.2, winY, winZ, winW - 2, winH - 2, glassColor2); // Glass

        // 2. Awning
        // Slopes down from Wall (Top of window + small gap) to Front-Out
        const awnW = winW + 4;
        const awnD = 5; // Sticks out
        const awnH = 4; // Drop height

        const topZ = winZ + winH / 2 + 1; // Wall attachment
        const botZ = topZ - awnH;         // Front edge height

        const wallY1 = winY + awnW / 2;
        const wallY2 = winY - awnW / 2;

        const outX = winX + awnD;
        // Front edge matches width
        const outY1 = wallY1;
        const outY2 = wallY2;

        // Points for Side Triangles (to draw later/under)
        const p_tl = toScreen(winX, wallY1, topZ); // Wall Top-Left (Front-ish)
        const p_fl = toScreen(outX, outY1, botZ);  // Out Front-Left
        const p_wall_bl = toScreen(winX, wallY1, botZ); // Wall Bottom-Left

        const p_tr = toScreen(winX, wallY2, topZ); // Wall Top-Right
        const p_fr = toScreen(outX, outY2, botZ);  // Out Front-Right
        const p_wall_br = toScreen(winX, wallY2, botZ); // Wall Bottom-Right

        // Draw Stripes (5 bands)
        const steps = 5;
        for (let i = 0; i < steps; i++) {
            // Alternating Red and White
            ctx.fillStyle = (i % 2 === 0) ? "#e17055" : "#dfe6e9";

            // Interpolate Y slice
            const t1 = i / steps;
            const t2 = (i + 1) / steps;

            const y_a = wallY1 + (wallY2 - wallY1) * t1;
            const y_b = wallY1 + (wallY2 - wallY1) * t2;

            // 4 points for the stripe quad
            const pa_wall = toScreen(winX, y_a, topZ);
            const pb_wall = toScreen(winX, y_b, topZ);
            const pb_front = toScreen(outX, y_b, botZ);
            const pa_front = toScreen(outX, y_a, botZ);

            ctx.beginPath();
            ctx.moveTo(pa_wall.x, pa_wall.y);
            ctx.lineTo(pb_wall.x, pb_wall.y);
            ctx.lineTo(pb_front.x, pb_front.y);
            ctx.lineTo(pa_front.x, pa_front.y);
            ctx.fill();
        }

        // Side Triangles (Fabric sides)
        ctx.fillStyle = "#d63031"; // Darker red for sides

        // Left Side (+Y side) - Visible
        ctx.beginPath();
        ctx.moveTo(p_tl.x, p_tl.y);
        ctx.lineTo(p_fl.x, p_fl.y);
        ctx.lineTo(p_wall_bl.x, p_wall_bl.y);
        ctx.fill();

        // Right Side (-Y side)
        ctx.beginPath();
        ctx.moveTo(p_tr.x, p_tr.y);
        ctx.lineTo(p_fr.x, p_fr.y);
        ctx.lineTo(p_wall_br.x, p_wall_br.y);
        ctx.fill();

        // Optional: Scalloped edge at bottom?
        // Keep it simple for now.

    } else {
        // --- Style 3: Flower Box ---
        const winW = 12;
        const winH = 12;

        // Window (Diamond Pattern?)
        drawRightRect(winX, winY, winZ, winW + 2, winH + 2, "#636e72"); // Dark Frame
        drawRightRect(winX + 0.5, winY, winZ, winW, winH, glassColor2); // Light Glass

        // Diamond Lead
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        const center = toScreen(winX + 0.6, winY, winZ);
        const top = toScreen(winX + 0.6, winY, winZ + winH / 2);
        const bot = toScreen(winX + 0.6, winY, winZ - winH / 2);
        const left = toScreen(winX + 0.6, winY + winW / 2, winZ);
        const right = toScreen(winX + 0.6, winY - winW / 2, winZ);
        ctx.moveTo(top.x, top.y); ctx.lineTo(left.x, left.y);
        ctx.lineTo(bot.x, bot.y); ctx.lineTo(right.x, right.y); ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Flower Box
        const boxH = 5;
        const boxD = 4; // Sticks out in X
        const boxZ = winZ - winH / 2 - boxH / 2 + 1;

        // We need to draw a generic box attached to the wall
        // Front face of box (at X = winX + boxD)
        drawRightRect(winX + boxD, winY, boxZ, winW + 4, boxH, "#8d6e63"); // Wood

        // Top "Soil"
        // Connect wall to front face top
        ctx.fillStyle = "#3e2723"; // Soil
        ctx.beginPath();
        const t1 = toScreen(winX, winY + (winW + 4) / 2, boxZ + boxH / 2);
        const t2 = toScreen(winX + boxD, winY + (winW + 4) / 2, boxZ + boxH / 2);
        const t3 = toScreen(winX + boxD, winY - (winW + 4) / 2, boxZ + boxH / 2);
        const t4 = toScreen(winX, winY - (winW + 4) / 2, boxZ + boxH / 2);
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
        ctx.fill();

        // Flowers/Greenery
        ctx.fillStyle = "#2ecc71"; // Green
        for (let i = 0; i < 3; i++) {
            const fx = winX + 2;
            const fy = winY - winW / 3 + i * (winW / 3);
            const fz = boxZ + boxH / 2 + 2;
            const p = toScreen(fx, fy, fz);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // Red Flower
            if (i % 2 === 0) {
                ctx.fillStyle = "#e74c3c";
                ctx.beginPath();
                ctx.arc(p.x, p.y - 1, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#2ecc71"; // Reset
            }
        }
    }


    // 3. Front Wall (+Y Face)
    ctx.fillStyle = wallColor;
    ctx.beginPath();
    ctx.moveTo(b4.x, b4.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t4.x, t4.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Apply Texture to Front Wall
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(b4.x, b4.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t4.x, t4.y);
    ctx.clip();
    drawWallTexture(1, wallStyle);
    ctx.restore();

    // --- Cracks (Abandoned Only) ---
    if (abandoned) {
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;

        // Simple jagged line helper
        const drawCrack = (surface, seed) => {
            // Surface 0: Right, 1: Front
            ctx.beginPath();
            // Start point
            let cx, cy, cz;
            if (surface === 0) { cx = hw; cy = 0; cz = 10; }
            else { cx = 0; cy = hd; cz = wallHeight - 10; }

            // Walk
            let px = cx, py = cy, pz = cz;
            const pt = toScreen(px, py, pz);
            ctx.moveTo(pt.x, pt.y);

            for (let i = 0; i < 5; i++) {
                // Random walk based on seed + i
                const r = ((seed + i) * 9301 + 49297) % 233280;
                const dr = r / 233280;

                if (surface === 0) { py += (dr - 0.5) * 10; pz += (dr) * 10; } // Up and sideways
                else { px += (dr - 0.5) * 10; pz -= (dr) * 10; } // Down and sideways

                const p = toScreen(px, py, pz);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        };

        drawCrack(0, gx * gy);
        drawCrack(1, gx + gy);
    }

    // Front Wall Trim (Corners)
    ctx.fillStyle = adjustColor(wallColor, -5);
    // Left Corner Trim
    ctx.beginPath();
    ctx.moveTo(b4.x, b4.y);
    ctx.lineTo(toScreen(-hw, hd - trimW, 0).x, toScreen(-hw, hd - trimW, 0).y);
    ctx.lineTo(toScreen(-hw, hd - trimW, wallHeight).x, toScreen(-hw, hd - trimW, wallHeight).y);
    ctx.lineTo(t4.x, t4.y);
    ctx.fill();

    // Foundation / Base Plinth
    // A dark band at the bottom of both visible walls
    const plinthH = 4;
    ctx.fillStyle = "#636e72"; // Grey Stone

    // Right Base
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(toScreen(hw, -hd, plinthH).x, toScreen(hw, -hd, plinthH).y);
    ctx.lineTo(toScreen(hw, hd, plinthH).x, toScreen(hw, hd, plinthH).y);
    ctx.fill();

    // Front Base
    ctx.beginPath();
    ctx.moveTo(b4.x, b4.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(toScreen(hw, hd, plinthH).x, toScreen(hw, hd, plinthH).y);
    ctx.lineTo(toScreen(-hw, hd, plinthH).x, toScreen(-hw, hd, plinthH).y);
    ctx.fill();

    // Door on Front Wall
    let dStyle = (doorStyle !== undefined) ? doorStyle : 0;
    if (abandoned) dStyle = -1; // Force boarded
    const dW = 6;
    const dH = 22;
    const dFrame = 1.5;
    const doory = hd + 0.5; // Surface of wall + epsilon

    // Helper to draw door rect
    function drawDoorRect(x, z, w, h, color, doStroke) {
        // x center, z bottom
        const p_bl = toScreen(x - w / 2, doory, z);
        const p_br = toScreen(x + w / 2, doory, z);
        const p_tr = toScreen(x + w / 2, doory, z + h);
        const p_tl = toScreen(x - w / 2, doory, z + h);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p_bl.x, p_bl.y);
        ctx.lineTo(p_br.x, p_br.y);
        ctx.lineTo(p_tr.x, p_tr.y);
        ctx.lineTo(p_tl.x, p_tl.y);
        ctx.fill();
        if (doStroke) {
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    if (dStyle === -1) {
        // --- Style -1: Boarded Door ---
        // Dark Void
        drawDoorRect(0, 0, dW * 2, dH, "#000");

        // Big 'X' planks
        // Using toScreen directly for custom lines
        const d_bl = toScreen(-dW - 2, doory + 1, 2);
        const d_tr = toScreen(dW + 2, doory + 1, dH - 2);
        const d_br = toScreen(dW + 2, doory + 1, 2);
        const d_tl = toScreen(-dW - 2, doory + 1, dH - 2);

        ctx.strokeStyle = "#5d4037"; // Wood
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(d_bl.x, d_bl.y); ctx.lineTo(d_tr.x, d_tr.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(d_tl.x, d_tl.y); ctx.lineTo(d_br.x, d_br.y);
        ctx.stroke();

        // One horizontal
        const d_ml = toScreen(-dW - 2, doory + 1, dH / 2);
        const d_mr = toScreen(dW + 2, doory + 1, dH / 2);
        ctx.beginPath();
        ctx.moveTo(d_ml.x, d_ml.y); ctx.lineTo(d_mr.x, d_mr.y);
        ctx.stroke();

    } else if (dStyle === 0) {
        // --- Style 0: Classic Panelled ---
        // 1. Door Frame
        const df_bl = toScreen(-dW - dFrame, doory, 0);
        const df_br = toScreen(dW + dFrame, doory, 0);
        const df_tr = toScreen(dW + dFrame, doory, dH + dFrame);
        const df_tl = toScreen(-dW - dFrame, doory, dH + dFrame);

        ctx.fillStyle = "#dfe6e9"; // White/Grey Frame
        ctx.beginPath();
        ctx.moveTo(df_bl.x, df_bl.y);
        ctx.lineTo(df_br.x, df_br.y);
        ctx.lineTo(df_tr.x, df_tr.y);
        ctx.lineTo(df_tl.x, df_tl.y);
        ctx.fill();
        ctx.stroke();

        // 2. Door Leaf (Inset)
        drawDoorRect(0, 0, dW * 2, dH, "#5d4037"); // Dark Wood

        // 3. Panels
        const panW = 2.5;
        const panH = 7;
        const panColor = "rgba(0,0,0,0.3)";

        drawDoorRect(-dW / 2, 3, panW, panH, panColor);
        drawDoorRect(dW / 2, 3, panW, panH, panColor);
        drawDoorRect(-dW / 2, 12, panW, panH, panColor);
        drawDoorRect(dW / 2, 12, panW, panH, panColor);

        // Doorknob
        const kn = toScreen(dW - 2, doory, dH / 2);
        ctx.fillStyle = "#ffb142"; // Gold
        ctx.beginPath();
        ctx.arc(kn.x, kn.y, 1.5, 0, Math.PI * 2);
        ctx.fill();

    } else if (dStyle === 1) {
        // --- Style 1: Arched / Round Top ---
        const archH = 16; // Height where arch starts
        const totalH = dH;

        // Frame Background
        const fw = dW + dFrame;
        const fh = dH + dFrame;

        ctx.fillStyle = "#b2bec3"; // Stone/Grey Frame
        ctx.beginPath();

        // Frame points
        const f_bl = toScreen(-fw, doory, 0);
        const f_br = toScreen(fw, doory, 0);
        const f_tr_start = toScreen(fw, doory, archH);

        ctx.moveTo(f_bl.x, f_bl.y);
        ctx.lineTo(f_br.x, f_br.y);
        ctx.lineTo(f_tr_start.x, f_tr_start.y);

        // Accurate Isometric Arch Trace
        const steps = 16;
        for (let i = 1; i <= steps; i++) {
            const t = (i / steps) * Math.PI; // 0 to PI
            const lx = Math.cos(t) * fw;
            const lz = Math.sin(t) * (totalH + 2 - archH);
            const p = toScreen(lx, doory, archH + lz);
            ctx.lineTo(p.x, p.y);
        }

        ctx.lineTo(f_bl.x, f_bl.y);
        ctx.fill();
        ctx.stroke();

        // Door Leaf
        ctx.fillStyle = "#6d4c41"; // Medium Wood Brown
        ctx.beginPath();
        const d_bl = toScreen(-dW, doory, 0);
        const d_br = toScreen(dW, doory, 0);
        const d_tr_start = toScreen(dW, doory, archH);

        ctx.moveTo(d_bl.x, d_bl.y);
        ctx.lineTo(d_br.x, d_br.y);
        ctx.lineTo(d_tr_start.x, d_tr_start.y);

        // Arch Trace for Door
        for (let i = 1; i <= steps; i++) {
            const t = (i / steps) * Math.PI;
            const lx = Math.cos(t) * dW;
            const lz = Math.sin(t) * (totalH - archH);
            const p = toScreen(lx, doory, archH + lz);
            ctx.lineTo(p.x, p.y);
        }

        ctx.lineTo(d_bl.x, d_bl.y);
        ctx.fill();

        // Vertical Planks
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        for (let i = -1; i <= 1; i += 1) {
            if (i === 0) continue;
            const lx = i * (dW / 2);
            const p_bot = toScreen(lx, doory, 0);
            const p_top = toScreen(lx, doory, totalH - 1);
            ctx.moveTo(p_bot.x, p_bot.y);
            ctx.lineTo(p_top.x, p_top.y);
        }
        ctx.stroke();

        // Ring Handle
        const kn = toScreen(dW / 2, doory, dH / 2);
        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.arc(kn.x, kn.y, 2, 0, Math.PI * 2);
        ctx.fill();

    } else if (dStyle === 2) {
        // --- Style 2: Modern Glass ---
        // Dark minimal frame
        drawDoorRect(0, 0, dW * 2 + 2, dH + 1, "#2d3436");

        // Grey Door Leaf
        drawDoorRect(0, 0, dW * 2, dH, "#636e72");

        // Vertical Glass Insert
        drawDoorRect(0, 2, 4, dH - 4, glassColor2);

        // Long Bar Handle
        const hVal = 12;
        const hBot = dH / 2 - 5;
        const hTop = dH / 2 + 5;
        const hX = dW - 2;

        const h_b = toScreen(hX, doory + 0.2, hBot);
        const h_t = toScreen(hX, doory + 0.2, hTop);

        ctx.strokeStyle = "#dfe6e9";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(h_b.x, h_b.y);
        ctx.lineTo(h_t.x, h_t.y);
        ctx.stroke();

    } else {
        // --- Style 3: Double French Glass Doors ---
        // Wide Frame (White/Grey)
        drawDoorRect(0, 0, dW * 2 + 2, dH + 1, "#b2bec3", true);

        // Split leaves (Left and Right)
        const leafW = dW - 0.2;
        // Left Leaf (White)
        drawDoorRect(-dW / 2, 0, leafW * 2, dH, "#ecf0f1", true);
        // Right Leaf (White)
        drawDoorRect(dW / 2, 0, leafW * 2, dH, "#ecf0f1", true);

        // Central seam
        ctx.strokeStyle = "#b2bec3";
        ctx.lineWidth = 1;
        const seamB = toScreen(0, doory + 0.1, 0);
        const seamT = toScreen(0, doory + 0.1, dH);
        ctx.beginPath();
        ctx.moveTo(seamB.x, seamB.y);
        ctx.lineTo(seamT.x, seamT.y);
        ctx.stroke();

        // Glass Panes (Grid on each door)
        // 2 cols x 3 rows per door
        const paneW = 2;
        const paneH = 4;
        const glassColor = glassColor2;

        // Helper for panes
        function drawPanes(centerX) {
            for (let r = 0; r < 3; r++) {
                // Top half of door
                const pz = dH - 3 - (r * (paneH + 1));
                // Left col
                drawDoorRect(centerX - 1.5, pz, paneW, paneH, glassColor);
                // Right col
                drawDoorRect(centerX + 1.5, pz, paneW, paneH, glassColor);
            }
        }

        drawPanes(-dW / 2);
        drawPanes(dW / 2);

        // Handles (Two small knobs in center)
        const kh = dH / 2 - 2;
        const k1 = toScreen(-1, doory + 0.3, kh);
        const k2 = toScreen(1, doory + 0.3, kh);

        ctx.fillStyle = "#2d3436";
        ctx.beginPath();
        ctx.arc(k1.x, k1.y, 1, 0, Math.PI * 2);
        ctx.arc(k2.x, k2.y, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Terrace / 2nd Floor (No divider band, just taller wall) ---
    if (has_terrace) {
        // Divider Band REMOVED per user request

        // Just the Upper Window logic follows...
        const floorH = 35; // Needed for calculation

        // Add a secondary window on the 2nd floor front?
        // Let's add simple one
        const uWinY = hd + 0.2;
        const uWinZ = floorH + (wallHeight - floorH) / 2 + 2;

        // Use manual rect for Front Wall Face (+Y face)
        // topRightRect was for +X face.

        function drawFrontRect(cx, cy, cz, w, h, color) {
            const x1 = cx - w / 2;
            const x2 = cx + w / 2;
            const z1 = cz - h / 2;
            const z2 = cz + h / 2;

            const p_bl = toScreen(x1, cy, z1);
            const p_br = toScreen(x2, cy, z1);
            const p_tr = toScreen(x2, cy, z2);
            const p_tl = toScreen(x1, cy, z2);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(p_bl.x, p_bl.y);
            ctx.lineTo(p_br.x, p_br.y);
            ctx.lineTo(p_tr.x, p_tr.y);
            ctx.lineTo(p_tl.x, p_tl.y);
            ctx.fill();
        }

        drawFrontRect(0, uWinY, uWinZ, 10, 10, "#dfe6e9"); // Frame
        drawFrontRect(0, uWinY + 0.1, uWinZ, 8, 8, abandoned ? "#2d3436" : "#74b9ff"); // Glass
    }

    // 4. Gable Triangle (Wall material, flush with walls)
    // Runs from t4 to t1 to Peak(0, hd, wallHeight + roofHeight)
    // Wait, the peak of the wall is aligned with the wall plane y=hd.
    // The roof peak rFront is at y=rhd (overhanging). 
    // We need a Wall Peak at y=hd.
    const wallPeak = toScreen(0, hd, wallHeight + roofHeight);

    ctx.fillStyle = wallColor;
    ctx.beginPath();
    ctx.moveTo(t4.x, t4.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(wallPeak.x, wallPeak.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Attic Window (Round)
    const awC = toScreen(0, hd + 0.5, wallHeight + roofHeight * 0.4);
    ctx.fillStyle = abandoned ? "#2d3436" : "#55efc4";
    ctx.beginPath();
    ctx.arc(awC.x, awC.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    // 5. Roof - Underside of Overhangs (Darker)
    // Visible on the front-right overhang area?
    // Front Overhang: rFront -> eFrontRight -> t1 -> wallPeak
    // Skipped for now.

    // 6. Main Roof Slope (Right Side)
    // Vertices: rFront -> rBack -> eBackRight -> eFrontRight

    // Helper to get midpoint dip
    function getCurveCP(p1, p2) {
        // Midpoint
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        // Dip amount 
        return { x: mx, y: my + 5 };
    }

    const cpBack = getCurveCP(rBack, eBackRight);

    // Note: Direction matters for consistency. Let's define curve from Ridge to Eave for both sides.
    // Front Edge: rFront -> eFrontRight.
    const cpFront = getCurveCP(rFront, eFrontRight);

    // Draw Base Fill First
    ctx.fillStyle = roofColorMain;
    ctx.beginPath();
    ctx.moveTo(rFront.x, rFront.y);
    ctx.lineTo(rBack.x, rBack.y);
    // Back Curve
    ctx.quadraticCurveTo(cpBack.x, cpBack.y, eBackRight.x, eBackRight.y);
    // Eave Line
    ctx.lineTo(eFrontRight.x, eFrontRight.y);
    // Front Curve (Reverse direction for shape closing: Eave -> Ridge)
    // cpFront is symmetric so it works, just traverse backwards
    ctx.quadraticCurveTo(cpFront.x, cpFront.y, rFront.x, rFront.y);

    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = roofEdgeColor;
    ctx.stroke();

    // --- Texture: Shingles / Patterns ---
    // Select variation based on parameter or position fallback
    const styleIndex = (roofStyle !== undefined) ? roofStyle : (Math.abs(gx + gy) % 4);

    // Interpolate curves helper
    function getQuadPoint(p0, cp, p1, t) {
        const invT = 1 - t;
        return {
            x: invT * invT * p0.x + 2 * invT * t * cp.x + t * t * p1.x,
            y: invT * invT * p0.y + 2 * invT * t * cp.y + t * t * p1.y
        };
    }

    ctx.beginPath();
    ctx.strokeStyle = adjustColor(roofColorMain, -15);
    ctx.lineWidth = 1;

    if (styleIndex === 0) {
        // --- Style 0: Scalloped (Fish Scale) ---
        const rows = 8;
        const cols = 6;
        for (let r = 0; r < rows; r++) {
            const tVal = r / rows;
            const tNext = (r + 1) / rows;
            const pStart = getQuadPoint(rBack, cpBack, eBackRight, tVal);
            const pEnd = getQuadPoint(rFront, cpFront, eFrontRight, tVal);
            const rowWidthX = pEnd.x - pStart.x;
            const rowWidthY = pEnd.y - pStart.y;
            const offset = (r % 2 === 0) ? 0 : 0.5;

            for (let c = 0; c < cols; c++) {
                let ct = (c + offset) / cols;
                let ctNext = (c + offset + 1) / cols;
                if (ct < 0) ct = 0;
                if (ctNext > 1) ctNext = 1;
                if (ctNext <= ct) continue;

                const sx = pStart.x + rowWidthX * ct;
                const sy = pStart.y + rowWidthY * ct;
                const ex = pStart.x + rowWidthX * ctNext;
                const ey = pStart.y + rowWidthY * ctNext;
                const midX = (sx + ex) / 2;
                const midY = (sy + ey) / 2;
                const tileH = 6;

                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(midX, midY + tileH, ex, ey);
            }
        }
    } else if (styleIndex === 1) {
        // --- Style 1: Rectangular Slate / Bricks ---
        const rows = 8;
        const cols = 5;
        for (let r = 0; r < rows; r++) {
            const tVal = r / rows;
            const tNext = (r + 1) / rows; // Needed for slope direction

            const pStart = getQuadPoint(rBack, cpBack, eBackRight, tVal);
            const pEnd = getQuadPoint(rFront, cpFront, eFrontRight, tVal);

            // Calculate slope direction vector for seams
            const pStartNext = getQuadPoint(rBack, cpBack, eBackRight, tNext);
            let slopeDX = pStartNext.x - pStart.x;
            let slopeDY = pStartNext.y - pStart.y;
            const slopeLen = Math.sqrt(slopeDX * slopeDX + slopeDY * slopeDY);
            // Normalize and scale
            const tickLen = 5;
            const tickX = (slopeDX / slopeLen) * tickLen;
            const tickY = (slopeDY / slopeLen) * tickLen;

            const rowWidthX = pEnd.x - pStart.x;
            const rowWidthY = pEnd.y - pStart.y;
            const offset = (r % 2 === 0) ? 0 : 0.5;

            // Horizontal lines for rows
            ctx.moveTo(pStart.x, pStart.y);
            ctx.lineTo(pEnd.x, pEnd.y);

            // Vertical seams aligned with slope (not 90 degrees screen)
            for (let c = 0; c < cols; c++) {
                let ct = (c + offset) / cols;
                if (ct < 0 || ct > 1) continue;
                const sx = pStart.x + rowWidthX * ct;
                const sy = pStart.y + rowWidthY * ct;
                // Line down along slope
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + tickX, sy + tickY);
            }
        }
    } else if (styleIndex === 2) {
        // --- Style 2: Vertical Standing Seam (Metal) ---
        const cols = 7;
        for (let c = 0; c <= cols; c++) {
            const t = c / cols;
            // Line from Ridge to Eave interpolating the roof surface
            // We need to trace the surface curve at column t
            // Surface is defined by 2 curves: BackCurve and FrontCurve
            // We interpolate tween them.

            // Just drawing straight lines from Ridge to Eave is visibly wrong on a curved roof.
            // We need 3 points: Ridge, Mid, Eave for the seam.

            // Point on Ridge
            const ridgeP = {
                x: rBack.x + (rFront.x - rBack.x) * t,
                y: rBack.y + (rFront.y - rBack.y) * t
            };

            // Point on Eave
            const eaveP = {
                x: eBackRight.x + (eFrontRight.x - eBackRight.x) * t,
                y: eBackRight.y + (eFrontRight.y - eBackRight.y) * t
            };

            // Point on Control Curve (Connects cpBack to cpFront)
            const midCP = {
                x: cpBack.x + (cpFront.x - cpBack.x) * t,
                y: cpBack.y + (cpFront.y - cpBack.y) * t
            };

            ctx.moveTo(ridgeP.x, ridgeP.y);
            ctx.quadraticCurveTo(midCP.x, midCP.y, eaveP.x, eaveP.y);
        }
    } else {
        // --- Style 3: Sawtooth / Zig-Zag Slate ---
        const rows = 10; // Denser
        const cols = 8;
        for (let r = 0; r < rows; r++) {
            const tVal = r / rows;
            const pStart = getQuadPoint(rBack, cpBack, eBackRight, tVal);
            const pEnd = getQuadPoint(rFront, cpFront, eFrontRight, tVal);
            const rowWidthX = pEnd.x - pStart.x;
            const rowWidthY = pEnd.y - pStart.y;
            // Stagger rows
            const offset = (r % 2 === 0) ? 0 : 0.5;

            for (let c = 0; c < cols; c++) {
                let ct = (c + offset) / cols;
                let ctNext = (c + offset + 1) / cols;

                // Clip
                if (ct < 0) ct = 0;
                if (ctNext > 1) ctNext = 1;
                if (ctNext <= ct) continue;

                const sx = pStart.x + rowWidthX * ct;
                const sy = pStart.y + rowWidthY * ct;
                const ex = pStart.x + rowWidthX * ctNext;
                const ey = pStart.y + rowWidthY * ctNext;

                const midX = (sx + ex) / 2;
                const midY = (sy + ey) / 2;
                const tileH = 5;

                // Draw pointy triangle (V shape)
                ctx.moveTo(sx, sy);
                ctx.lineTo(midX, midY + tileH);
                ctx.lineTo(ex, ey);
            }
        }
    }

    ctx.stroke();

    if (abandoned) {
        // --- Roof Holes ---
        ctx.fillStyle = "#2d3436"; // Dark void color
        // Random patches
        const numHoles = 3;
        for (let i = 0; i < numHoles; i++) {
            // Pick a t value (along slope) and 'u' value (along width)
            const t = 0.3 + (i * 0.2);
            // Point on main slope
            const pStart = getQuadPoint(rBack, cpBack, eBackRight, t);
            const pEnd = getQuadPoint(rFront, cpFront, eFrontRight, t);

            // Interpolate 'u'
            const u = 0.2 + ((i * 1.3) % 0.6);
            const holeX = pStart.x + (pEnd.x - pStart.x) * u;
            const holeY = pStart.y + (pEnd.y - pStart.y) * u;

            ctx.beginPath();
            // Jagged hole shape
            const rad = 4;
            ctx.moveTo(holeX - rad, holeY);
            ctx.lineTo(holeX, holeY - rad + 1);
            ctx.lineTo(holeX + rad, holeY + 2);
            ctx.lineTo(holeX, holeY + rad);
            ctx.fill();
        }
    }

    // 7. Roof Thickness / Fascia (Right edge)
    ctx.fillStyle = roofColorDark;
    ctx.beginPath();
    ctx.moveTo(eFrontRight.x, eFrontRight.y);
    ctx.lineTo(eBackRight.x, eBackRight.y);
    // Drop down slighty for thickness
    const thick = 3;
    const eBackRightDown = { x: eBackRight.x, y: eBackRight.y + thick };
    const eFrontRightDown = { x: eFrontRight.x, y: eFrontRight.y + thick };
    ctx.lineTo(eBackRightDown.x, eBackRightDown.y);
    ctx.lineTo(eFrontRightDown.x, eFrontRightDown.y);
    ctx.closePath();
    ctx.fill();

    // 8. Front Eave / Gable Edge (Fascia Board)

    // We need to draw the "Face" of the board.
    // Top Edge is the Roof Line (Curved).
    // Bottom Edge is parallel to Top Edge, shifted down by 'fasciaHeight'.
    const fasciaHeight = 4;

    ctx.fillStyle = adjustColor(roofColorMain, -10);
    ctx.strokeStyle = roofEdgeColor;

    ctx.beginPath();

    // 1. Trace Top Edge (Left to Right)
    ctx.moveTo(eFrontLeft.x, eFrontLeft.y);
    const cpLeft = getCurveCP(eFrontLeft, rFront);
    ctx.quadraticCurveTo(cpLeft.x, cpLeft.y, rFront.x, rFront.y);

    const cpRight = getCurveCP(rFront, eFrontRight);
    ctx.quadraticCurveTo(cpRight.x, cpRight.y, eFrontRight.x, eFrontRight.y);

    // 2. Trace Right Side down
    ctx.lineTo(eFrontRight.x, eFrontRight.y + fasciaHeight);

    // 3. Trace Bottom Edge (Right to Left) - Reverse curves with Y shift
    const cpRightBottom = { x: cpRight.x, y: cpRight.y + fasciaHeight };
    const rFrontBottom = { x: rFront.x, y: rFront.y + fasciaHeight };
    const cpLeftBottom = { x: cpLeft.x, y: cpLeft.y + fasciaHeight };
    const eFrontLeftBottom = { x: eFrontLeft.x, y: eFrontLeft.y + fasciaHeight };

    ctx.quadraticCurveTo(cpRightBottom.x, cpRightBottom.y, rFrontBottom.x, rFrontBottom.y);
    ctx.quadraticCurveTo(cpLeftBottom.x, cpLeftBottom.y, eFrontLeftBottom.x, eFrontLeftBottom.y);

    // 4. Close Left Side
    ctx.lineTo(eFrontLeft.x, eFrontLeft.y);

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 9. Chimney
    const cStyle = (chimneyStyle !== undefined) ? chimneyStyle : 0;

    if (cStyle !== 0) {
        let cw, ch, cPos, cColorMain, cColorSide, cColorTop;
        // Texturing flags
        let doBricks = false;
        let doStones = false;
        let doCap = false;

        if (cStyle === 1) {
            // --- Style 1: Classic Stone with Flue ---
            cw = 4; // reduced from 5
            ch = 12; // reduced from 14
            cPos = { lx: 10, ly: -5 };
            cColorMain = "#7f8c8d"; // Concrete
            cColorSide = "#556068";
            cColorTop = "#95a5a6";
            doCap = true;

        } else if (cStyle === 2) {
            // --- Style 2: Industrial Brick with Stone Cap ---
            cw = 4; // reduced from 5
            ch = 18; // reduced from 20
            cPos = { lx: 8, ly: -6 };
            cColorMain = "#a04000"; // Darker Burnt Orange/Brown
            cColorSide = "#6e2c00"; // Dark contrast side
            cColorTop = "#d35400";
            doBricks = true;
            doCap = true; // Add cap for stone finish
        } else if (cStyle === 3) {
            // --- Style 3: Creative Cottage (Double Pot) ---
            cw = 6; // reduced from 7
            ch = 7; // reduced from 8
            cPos = { lx: 10, ly: -4 };
            cColorMain = "#95a5a6"; // Stone Grey
            cColorSide = "#7f8c8d";
            cColorTop = "#bdc3c7"; // Light stone top
            doStones = true; // Keep stone texture on base
        }

        // --- Slanted Base Logic ---
        function getRoofH(lx) {
            const ratio = 1 - (Math.abs(lx) / rhw);
            return wallHeight + roofHeight * ratio - 2;
        }

        const xInner = cPos.lx - cw;
        const xOuter = cPos.lx + cw;
        const yFront = cPos.ly + cw;
        const yBack = cPos.ly - cw;

        const zInner = getRoofH(xInner);
        const zOuter = getRoofH(xOuter);
        const zCenterBase = getRoofH(cPos.lx);

        let zTop = zCenterBase + ch;
        if (doCap) zTop -= 2; // Reserve space for cap

        // Vertices for Main Shaft
        // Front Face (+Y)
        const p_tf_tl = toScreen(xInner, yFront, zTop);
        const p_tf_tr = toScreen(xOuter, yFront, zTop);
        const p_tf_br = toScreen(xOuter, yFront, zOuter);
        const p_tf_bl = toScreen(xInner, yFront, zInner);

        // Side Face (+X)
        const p_sf_tr = toScreen(xOuter, yBack, zTop);
        const p_sf_br = toScreen(xOuter, yBack, zOuter);

        // Top Points (for Top Face or Cap Base)
        const p_top_bl = toScreen(xInner, yBack, zTop);


        // 1. Draw Side Face (+X)
        ctx.fillStyle = cColorSide;
        ctx.beginPath();
        ctx.moveTo(p_tf_tr.x, p_tf_tr.y);
        ctx.lineTo(p_sf_tr.x, p_sf_tr.y);
        ctx.lineTo(p_sf_br.x, p_sf_br.y);
        ctx.lineTo(p_tf_br.x, p_tf_br.y);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        ctx.stroke();

        // 2. Draw Front Face (+Y)
        ctx.fillStyle = cColorMain;
        ctx.beginPath();
        ctx.moveTo(p_tf_tl.x, p_tf_tl.y);
        ctx.lineTo(p_tf_tr.x, p_tf_tr.y);
        ctx.lineTo(p_tf_br.x, p_tf_br.y);
        ctx.lineTo(p_tf_bl.x, p_tf_bl.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- Textures ---
        if (doBricks) {
            ctx.strokeStyle = "rgba(255,255,255,0.3)"; // Lighter Mortar
            ctx.lineWidth = 1;
            const brickH = 4;

            // Calc constants for inverse roof height (Slope)
            const h_peak = wallHeight + roofHeight - 2;
            const slope = roofHeight / rhw; // drop per unit x

            // Draw lines on Front Face (+Y, vary X) and Side Face (+X, vary Y)
            // Start from zTop go down
            for (let z = zTop - brickH; z > zOuter + 0.5; z -= brickH) {
                // Front Face Line (Along X)
                // CLIPPING: The bottom edge is diagonal from (xInner, zInner) to (xOuter, zOuter).
                // If z < zInner, the wall starts at x > xInner.

                let bxStart = xInner;
                if (z < zInner) {
                    // z = h_peak - slope * x  =>  x = (h_peak - z) / slope
                    bxStart = (h_peak - z) / slope;
                    // Safety clamp
                    if (bxStart < xInner) bxStart = xInner;
                }

                // If our start point is beyond the outer edge, don't draw (shouldn't happen with z > zOuter)
                if (bxStart < xOuter) {
                    ctx.beginPath();
                    const b_start = toScreen(bxStart, yFront, z);
                    const b_end = toScreen(xOuter, yFront, z);
                    ctx.moveTo(b_start.x, b_start.y);
                    ctx.lineTo(b_end.x, b_end.y);
                    ctx.stroke();
                }

                // Side Face Line (Along Y)
                // Side face bottom is flat at zOuter, so just check z > zOuter
                if (z > zOuter) {
                    ctx.beginPath();
                    const s_start = toScreen(xOuter, yFront, z);
                    const s_end = toScreen(xOuter, yBack, z);
                    ctx.moveTo(s_start.x, s_start.y);
                    ctx.lineTo(s_end.x, s_end.y);
                    ctx.stroke();
                }
            }
        }



        // --- Cap / Top Logic ---
        if (doCap) {
            // Draw a wider, short box on top
            const capOut = 1.5;
            const capH = 2;
            const czBot = zTop;
            const czTop = zTop + capH;

            // Cap Coords
            const cx1 = xInner - capOut;
            const cx2 = xOuter + capOut;
            const cy1 = yFront + capOut;
            const cy2 = yBack - capOut;

            // Helper to draw Cap Prism
            const c_fl_bot = toScreen(cx1, cy1, czBot);
            const c_fr_bot = toScreen(cx2, cy1, czBot);
            const c_fr_top = toScreen(cx2, cy1, czTop);
            const c_fl_top = toScreen(cx1, cy1, czTop);
            const c_br_top = toScreen(cx2, cy2, czTop);
            const c_bl_top = toScreen(cx1, cy2, czTop);
            const c_br_bot = toScreen(cx2, cy2, czBot);

            // Cap Front
            ctx.fillStyle = adjustColor(cColorMain, 10);
            ctx.beginPath();
            ctx.moveTo(c_fl_bot.x, c_fl_bot.y); ctx.lineTo(c_fr_bot.x, c_fr_bot.y);
            ctx.lineTo(c_fr_top.x, c_fr_top.y); ctx.lineTo(c_fl_top.x, c_fl_top.y);
            ctx.fill(); ctx.stroke();

            // Cap Side
            ctx.fillStyle = adjustColor(cColorSide, 10);
            ctx.beginPath();
            ctx.moveTo(c_fr_bot.x, c_fr_bot.y); ctx.lineTo(c_br_bot.x, c_br_bot.y);
            ctx.lineTo(c_br_top.x, c_br_top.y); ctx.lineTo(c_fr_top.x, c_fr_top.y);
            ctx.fill(); ctx.stroke();

            // Cap Top
            ctx.fillStyle = cColorTop;
            ctx.beginPath();
            ctx.moveTo(c_fl_top.x, c_fl_top.y); ctx.lineTo(c_fr_top.x, c_fr_top.y);
            ctx.lineTo(c_br_top.x, c_br_top.y); ctx.lineTo(c_bl_top.x, c_bl_top.y);
            ctx.closePath();
            ctx.fill();

        } else {
            // Standard Top Face
            ctx.fillStyle = cColorTop;
            ctx.beginPath();
            ctx.moveTo(p_tf_tl.x, p_tf_tl.y);
            ctx.lineTo(p_tf_tr.x, p_tf_tr.y);
            ctx.lineTo(p_sf_tr.x, p_sf_tr.y);
            ctx.lineTo(p_top_bl.x, p_top_bl.y);
            ctx.closePath();
            ctx.fill();
        }

        // Decoration: Style 1 Flue Box
        if (cStyle === 1) {
            // Rectangular Flue Liner sticking out
            const fH = 2.5;
            const fW = 2; // Reduced from 2.5
            const fBase = zTop + 2;

            const fColor = "#e17055"; // Clay

            // Box
            const fx1 = cPos.lx - fW;
            const fx2 = cPos.lx + fW;
            const fy1 = cPos.ly + fW;
            const fy2 = cPos.ly - fW;

            const fl_fl_bot = toScreen(fx1, fy1, fBase);
            const fl_fr_bot = toScreen(fx2, fy1, fBase);
            const fl_fl_top = toScreen(fx1, fy1, fBase + fH);
            const fl_fr_top = toScreen(fx2, fy1, fBase + fH);

            const fl_br_bot = toScreen(fx2, fy2, fBase);
            const fl_br_top = toScreen(fx2, fy2, fBase + fH);
            const fl_bl_top = toScreen(fx1, fy2, fBase + fH);

            // Front
            ctx.fillStyle = fColor;
            ctx.beginPath();
            ctx.moveTo(fl_fl_bot.x, fl_fl_bot.y); ctx.lineTo(fl_fr_bot.x, fl_fr_bot.y);
            ctx.lineTo(fl_fr_top.x, fl_fr_top.y); ctx.lineTo(fl_fl_top.x, fl_fl_top.y);
            ctx.fill();

            // Side
            ctx.fillStyle = adjustColor(fColor, -15);
            ctx.beginPath();
            ctx.moveTo(fl_fr_bot.x, fl_fr_bot.y); ctx.lineTo(fl_br_bot.x, fl_br_bot.y);
            ctx.lineTo(fl_br_top.x, fl_br_top.y); ctx.lineTo(fl_fr_top.x, fl_fr_top.y);
            ctx.fill();

            // Top rim/hole
            ctx.fillStyle = "#2d3436";
            ctx.beginPath();
            ctx.moveTo(fl_fl_top.x, fl_fl_top.y); ctx.lineTo(fl_fr_top.x, fl_fr_top.y);
            ctx.lineTo(fl_br_top.x, fl_br_top.y); ctx.lineTo(fl_bl_top.x, fl_bl_top.y);
            ctx.fill();

            // Rim highlight
            ctx.strokeStyle = adjustColor(fColor, 20);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(fl_fl_top.x, fl_fl_top.y); ctx.lineTo(fl_fr_top.x, fl_fr_top.y);
            ctx.lineTo(fl_br_top.x, fl_br_top.y); ctx.lineTo(fl_bl_top.x, fl_bl_top.y);
            ctx.closePath();
            ctx.stroke();
        }

        // Decoration: Pot for Style 2
        if (cStyle === 2) {
            const potBaseZ = doCap ? (zTop + 2) : zTop;
            const potC = toScreen(cPos.lx, cPos.ly, potBaseZ);
            ctx.fillStyle = "#e67e22";
            ctx.beginPath();
            ctx.ellipse(potC.x, potC.y, 3, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Pot Rim/Hole
            ctx.fillStyle = "#d35400";
            ctx.beginPath();
            ctx.ellipse(potC.x, potC.y, 1.5, 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Decoration: Double Pots for Style 3 (Creative Cottage)
        if (cStyle === 3) {
            // 1. Two Chimney Pots
            const potH = 8; // Reduced height
            const potRad = 2; // Reduced radius
            const potColor = "#e67e22";

            // Positions on the flat top
            const pot1Pos = { x: cPos.lx - 2, y: cPos.ly };
            const pot2Pos = { x: cPos.lx + 2, y: cPos.ly };

            [pot1Pos, pot2Pos].forEach(pos => {
                const b = toScreen(pos.x, pos.y, zTop);
                // Draw Cylinder
                const t = toScreen(pos.x, pos.y, zTop + potH);

                // Body (Simple Rect for iso cylinder)
                // const w = potRad * 2; 
                ctx.fillStyle = potColor;
                ctx.beginPath();
                // Bottom is ellipse-ish... just draw box for now essentially
                const b_l = toScreen(pos.x, pos.y + potRad, zTop);
                const b_r = toScreen(pos.x, pos.y - potRad, zTop);
                const t_r = toScreen(pos.x, pos.y - potRad, zTop + potH);
                const t_l = toScreen(pos.x, pos.y + potRad, zTop + potH);

                ctx.moveTo(b_l.x, b_l.y); ctx.lineTo(b_r.x, b_r.y);
                ctx.lineTo(t_r.x, t_r.y); ctx.lineTo(t_l.x, t_l.y);
                ctx.fill();

                // Rim
                ctx.fillStyle = "#d35400"; // Darker rim
                ctx.beginPath();
                ctx.ellipse(t.x, t.y, 3, 1.5, 0, 0, Math.PI * 2);
                ctx.fill();
                // Hole
                ctx.fillStyle = "#2d3436";
                ctx.beginPath();
                ctx.ellipse(t.x, t.y, 1.5, 0.8, 0, 0, Math.PI * 2);
            });
        }

        // --- Smoke Emitter ---
        // Chance to spawn smoke
        if (Math.random() < 0.05) {
            const tip = toScreen(cPos.lx, cPos.ly, zTop + 3);
            spawnSmoke(tip.x, tip.y);
        }
    }

    // --- Username Tooltip ---
    // Render this last on top of house
    if (username && hoverAnim > 0.05) {
        ctx.save();

        // Position: Above the Roof Peak
        const tipX = rFront.x;
        const tipY = rFront.y - 12; // Base position (closer, will scale up)

        // Animation: Pop/Scale effect centered on the tip anchor
        // Ease out back? Simple ease is fine.
        // Scale from 0.5 to 1.0 based on hoverAnim?
        // Let's do full scale 0 -> 1 for pop.
        const scale = hoverAnim;

        ctx.translate(tipX, tipY);
        ctx.scale(scale, scale);
        // Translate back up so 0,0 is the anchor point at bottom

        ctx.font = "bold 13px 'Segoe UI', sans-serif";
        const textMetrics = ctx.measureText(username);
        const textW = textMetrics.width;
        const padX = 10;
        // const padY = 6; // Unused
        const boxH = 26;

        // Dead Status Dot
        const dotSize = 6;
        const dotGap = 6;
        let contentW = textW;
        if (abandoned) contentW += dotSize + dotGap;

        const boxW = contentW + padX * 2;

        const bx = -boxW / 2;
        const by = -boxH - 8; // Move up by height + arrow length
        const rad = 6;

        // Shadow
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;

        // Draw Box Bubble
        ctx.beginPath();
        ctx.moveTo(bx + rad, by);
        ctx.lineTo(bx + boxW - rad, by);
        ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + rad);
        ctx.lineTo(bx + boxW, by + boxH - rad);
        ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - rad, by + boxH);

        // Arrow pointing down to (0,0) - relative to translate
        const arrowW = 6;
        const arrowH = 6; // Unused var but good for ref
        const arrowBaseY = by + boxH;

        ctx.lineTo(arrowW, arrowBaseY); // Right side of arrow base
        ctx.lineTo(0, 0); // Tip
        ctx.lineTo(-arrowW, arrowBaseY);

        ctx.lineTo(bx + rad, arrowBaseY); // Back to left corner
        ctx.quadraticCurveTo(bx, arrowBaseY, bx, arrowBaseY - rad);
        ctx.lineTo(bx, by + rad);
        ctx.quadraticCurveTo(bx, by, bx + rad, by);

        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // Border matching house
        ctx.shadowColor = "transparent"; // No shadow on stroke or it looks muddy
        ctx.lineWidth = 2;
        ctx.strokeStyle = color; // Used the house color passed in
        ctx.stroke();

        // Content
        ctx.textBaseline = "middle";

        // Calculate Layout
        // Center the entire content group (Text + Dot) within the box
        // Box is centered on 0. Box Left is bx.
        // Content Start X relative to 0 is -contentW / 2.

        const contentStartX = -contentW / 2;
        const textY = by + boxH / 2;

        // Text
        ctx.fillStyle = "#2d3436"; // Dark Text
        ctx.textAlign = "left";
        ctx.fillText(username, contentStartX, textY);

        // Red Dead Dot
        if (abandoned) {
            const dotX = contentStartX + textW + dotGap + dotSize / 2;
            const dotY = textY; // Middle align with text

            ctx.fillStyle = "#e74c3c"; // Red
            ctx.beginPath();
            ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // --- Visuals: Vines & Overgrowth (Abandoned Only) ---
    // Rendered last on top of everything
    if (abandoned) {
        ctx.save();
        ctx.fillStyle = "#5d7052"; // Mossy Green
        ctx.strokeStyle = "#4b6140";
        ctx.lineWidth = 2;

        // Procedural Vines Helper
        function drawVine(seedX, seedY, length, isWall) {
            const startPt = toScreen(seedX, seedY, 0); // Start at root
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);

            let cx = seedX, cy = seedY, cz = 0;
            for (let i = 0; i < length; i++) {
                // climb up
                const n = (i * 13 + seedX + seedY) % 10;
                cz += 2 + (n / 5);
                cx += Math.sin(i) * 2;
                cy += Math.cos(i) * 2;

                // Clamp to house volumeish
                if (cz > wallHeight + roofHeight) break;

                const p = toScreen(cx, cy, cz);
                ctx.lineTo(p.x, p.y);

                // Leaves
                if (i % 3 === 0) {
                    // ctx.beginPath(); // Optimization: draw leaves separate or simply little strokes?
                    // Simple stroke leaves are fast
                    const leafL = 3;
                    const lx = p.x + ((i % 2 === 0) ? leafL : -leafL);
                    const ly = p.y - 1;
                    // ctx.moveTo(p.x, p.y); ctx.lineTo(lx, ly);
                }
            }
            ctx.stroke();

            // Patches of moss
            if (isWall) {
                const mossC = toScreen(seedX, seedY, wallHeight / 2 + (seedX % 5));
                ctx.beginPath();
                ctx.arc(mossC.x, mossC.y, 4 + (seedY % 4), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw some vines
        drawVine(hw, 0, 15, true);  // Side wall vine
        drawVine(-hw, hd, 20, true); // Front corner vine
        drawVine(0, hd, 10, true);   // Door vine
        drawVine(hw, -hd, 12, true); // Back corner

        // Rubble piles at base
        for (let i = 0; i < 5; i++) {
            // Deterministic pseudo-random based on grid + index
            const h = (gx * 3737 + gy * 2929 + i * 191) % 100; // 0-99
            const n = h / 100;

            let rx = (n - 0.5) * hw * 2.0;
            let ry = ((h % 20) / 20 - 0.5) * hd * 2.0;

            // Keep near center
            const p = toScreen(rx, ry, 0);
            ctx.fillStyle = (i % 2 === 0) ? "#3d3d3d" : "#5d4037"; // Dark grey or wood
            ctx.beginPath();
            ctx.arc(p.x, p.y + i, 2 + (n * 5) % 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    // Restore Context Hook
    if (abandoned) {
        ctx.stroke = originalStroke;
    }
}

// Utility to darken/lighten hex color
function adjustColor(color, amount) {
    // Basic hex parsing
    let usePound = false;
    if (color[0] == "#") {
        color = color.slice(1);
        usePound = true;
    }
    let num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    if (r > 255) r = 255; else if (r < 0) r = 0;

    let b = ((num >> 8) & 0x00FF) + amount;
    if (b > 255) b = 255; else if (b < 0) b = 0;

    let g = (num & 0x0000FF) + amount;
    if (g > 255) g = 255; else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// Start
init();
