const canvas = document.getElementById('worldCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
const TILE_SIZE = 40;
const GRID_COLOR = 'rgba(255, 255, 255, 0.05)';
const BG_COLOR = '#1e1e1e'; // Dark nice background
const AXIS_COLOR = 'rgba(255, 255, 255, 0.2)';

// Viewport State (for panning/zooming later if needed)
let viewport = {
    x: 0,
    y: 0,
    zoom: 1
};

// --- Resize Handling ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener('resize', resize);

// --- Drawing Logic ---
function drawGrid() {
    // 1. Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Grid Lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID_COLOR;

    // Calculate grid offsets loop
    // We start from viewport.x % TILE_SIZE to create the illusion of an infinite scrolling grid
    const offsetX = viewport.x % TILE_SIZE;
    const offsetY = viewport.y % TILE_SIZE;

    ctx.beginPath();
    
    // Vertical Lines
    for (let x = offsetX; x < canvas.width; x += TILE_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }

    // Horizontal Lines
    for (let y = offsetY; y < canvas.height; y += TILE_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    
    ctx.stroke();

    // 3. Center Origin Marker (Optional, helps visual orientation)
    // Draw a "center" cross relative to viewport
    const centerX = canvas.width / 2 + viewport.x;
    const centerY = canvas.height / 2 + viewport.y;
    
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY);
    ctx.lineTo(centerX + 20, centerY);
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX, centerY + 20);
    ctx.stroke();
}

function draw() {
    drawGrid();
    
    // Placeholder for future entities
    // drawEntities(); 
}

// --- Interaction Loop ---
// (Optional: Add panning logic here later)

// --- Data Polling ---
async function pollData() {
    if (window.pywebview) {
        try {
            const data = await window.pywebview.api.get_data();
            updateStats(data);
        } catch(e) {
            console.warn("Failed to fetch data", e);
        }
    }
}

function updateStats(data) {
    const el = document.getElementById('debug-info');
    if (data && !data.error) {
        el.innerHTML = `
            Keys: ${data.total_keys}<br>
            Clicks: ${data.total_clicks}<br>
            Active: ${Math.round(data.total_active_seconds)}s<br>
            Idle: ${Math.round(data.total_idle_seconds)}s
        `;
    } else {
        el.innerText = "Data unavailable";
    }
}

// --- Init ---
resize();
draw();
setInterval(pollData, 1000); // Check for Python updates every second

// Basic Panning Test (Mouse Drag)
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    
    viewport.x += dx;
    viewport.y += dy;
    
    lastMouse = { x: e.clientX, y: e.clientY };
    draw();
});
