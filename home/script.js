const canvas = document.getElementById('wall');
const ctx = canvas.getContext('2d');

let notes = [];
let previousDataStr = "";

// Camera
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let hasDragged = false;

// Configuration
const BASE_WIDTH = 220;
const BASE_HEIGHT = 180;
const EXPANDED_WIDTH = 300; // Wider when expanded
const PADDING = 60; // More gap as requested

const COLORS = [
    '#fef68a', // Yellow
    '#bbf7d0', // Green
    '#bfdbfe', // Blue
    '#fecaca', // Red
    '#fed7aa', // Orange
    '#ddd6fe'  // Purple
];

// --- Initialization ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// --- Input Handling ---
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    hasDragged = false;
    lastMouse = { x: e.clientX, y: e.clientY };
    dragStart = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', e => {
    isDragging = false;
    canvas.style.cursor = 'grab';
    
    // Check for Click (if moved very little)
    const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dist < 5) {
        handleNoteClick(e.clientX, e.clientY);
    }
});

window.addEventListener('mousemove', e => {
    lastMouse = { x: e.clientX, y: e.clientY };

    if (isDragging) {
        hasDragged = true;
        camera.x += e.movementX;
        camera.y += e.movementY;
    }
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    // Zoom towards mouse pointer logic
    const oldZoom = camera.zoom;
    let newZoom = oldZoom + delta;
    newZoom = Math.max(0.5, Math.min(1, newZoom)); // Clamp zoom tighter (0.5x to 3x)

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // World before zoom
    const wx = (mouseX - camera.x) / oldZoom;
    const wy = (mouseY - camera.y) / oldZoom;

    camera.zoom = newZoom;

    // Adjust camera to keep world point under mouse
    camera.x = mouseX - wx * newZoom;
    camera.y = mouseY - wy * newZoom;
}, { passive: false });

function handleNoteClick(screenX, screenY) {
    // Convert to World Pos
    const wx = (screenX - camera.x) / camera.zoom;
    const wy = (screenY - camera.y) / camera.zoom;
    
    // Reverse Check (Top notes first)
    // Actually our array is chronological, so later notes are drawn on top usually?
    // Let's check all.
    for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        // Simple AABB
        if (wx > n.x && wx < n.x + n.w &&
            wy > n.y && wy < n.y + n.h) {
            
            // Toggle Expand
            n.expanded = !n.expanded;
            
            // Recalculate dimensions based on state
            if (n.expanded) {
                n.w = EXPANDED_WIDTH;
                // Height depends on text
                ctx.font = "24px 'Kalam', cursive";
                const lines = wrapText(n.text, n.w - 40);
                const textH = lines.length * 30;
                n.h = Math.max(BASE_HEIGHT, textH + 80); // +Buffer for dates/pads
            } else {
                n.w = BASE_WIDTH;
                n.h = BASE_HEIGHT;
            }
            return; // Click handled
        }
    }
}

// --- Data Fetching ---
async function fetchData() {
    try {
        const res = await fetch('user_inputs.json?t=' + Date.now());
        if (!res.ok) return;
        const rawData = await res.json();
        const jsonStr = JSON.stringify(rawData);

        if (jsonStr !== previousDataStr) {
            processNotes(rawData);
            previousDataStr = jsonStr;
        }
    } catch (e) { console.error(e); }
}

function processNotes(data) {
    // Sort by timestamp
    const sorted = [...data].sort((a, b) => {
        const t1 = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const t2 = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return t1 - t2;
    });

    // Reuse existing notes to preserve state (expanded, rotation) if ID matches?
    // We don't have IDs. We'll map by index or content hash. 
    // For simplicity, we rebuild but try to match properties if index matches.
    
    notes = sorted.map((item, index) => {
        const existing = notes[index];
        const colorIdx = index % COLORS.length;
        
        let text = "";
        let dateTime = "";
        
        if (typeof item === 'string') {
            text = item;
        } else {
            text = item.answer || item.question || JSON.stringify(item);
            if (item.timestamp) {
                const d = new Date(item.timestamp);
                // Full Date Time
                dateTime = d.toLocaleString([], {
                    month: 'short', day: 'numeric', 
                    hour: '2-digit', minute:'2-digit'
                });
            }
        }
        
        // Layout Logic: Flow with gaps
        const cols = 4; // Fewer columns for more gaps
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        const x = 80 + col * (BASE_WIDTH + PADDING); // More left margin
        const y = 80 + row * (BASE_HEIGHT + PADDING);

        const n = {
            x, y,
            w: existing ? existing.w : BASE_WIDTH,
            h: existing ? existing.h : BASE_HEIGHT,
            color: COLORS[colorIdx],
            text: text,
            dateTime: dateTime,
            rotation: existing ? existing.rotation : (Math.random() - 0.5) * 8,
            expanded: existing ? existing.expanded : false,
            anim: existing ? existing.anim : { scale: 1.0, lift: 0, blur: 15, offset: 8 }
        };
        return n;
    });
}

function wrapText(text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let curLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const width = ctx.measureText(curLine + " " + words[i]).width;
        if (width < maxWidth) {
            curLine += " " + words[i];
        } else {
            lines.push(curLine);
            curLine = words[i];
        }
    }
    lines.push(curLine);
    return lines;
}

// --- Rendering ---
function draw() {
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1e1e24"; // Charcoal Dark
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic BG: Dot Grid
    ctx.fillStyle = "#2b2b36";
    const spacing = 40 * camera.zoom;
    const ox = camera.x % spacing;
    const oy = camera.y % spacing;
    
    for (let x = ox; x < canvas.width; x += spacing) {
        for (let y = oy; y < canvas.height; y += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, 2 * camera.zoom, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

    // --- Connections (Threads) ---
    if (notes.length > 1) {
        ctx.strokeStyle = "rgba(220, 220, 220, 0.4)"; // White thread
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed connection? Or solid for "Real"?
        // User asked for "Real lines". Solid string looks better.
        ctx.setLineDash([]);
        ctx.beginPath();
        
        for (let i = 0; i < notes.length - 1; i++) {
            const curr = notes[i];
            const next = notes[i+1];
            
            // Pin Point (Top Center)
            const p1 = { x: curr.x + curr.w/2, y: curr.y + 10 };
            const p2 = { x: next.x + next.w/2, y: next.y + 10 };
            
            // Draw curve (slack string)
            ctx.moveTo(p1.x, p1.y);
            // Control point hangs down
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2 + 50; // Droop
            ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
        }
        ctx.stroke();
    }

    // --- Notes ---
    ctx.font = "20px 'Kalam', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    notes.forEach(note => {
        // Hover Anim Logic
        const wx = (lastMouse.x - camera.x) / camera.zoom;
        const wy = (lastMouse.y - camera.y) / camera.zoom;
        
        let targetScale = 1.0;
        let targetBlur = 10;
        let targetOffset = 5;
        let zIndex = 0; // Fake z-index via array order, but scale helps visually

        if (wx > note.x && wx < note.x + note.w &&
            wy > note.y && wy < note.y + note.h) {
            targetScale = 1.05;
            targetBlur = 25;
            targetOffset = 15;
            zIndex = 1;
        }
        
        // Lerp
        const f = 0.2;
        note.anim.scale += (targetScale - note.anim.scale) * f;
        note.anim.blur += (targetBlur - note.anim.blur) * f;
        note.anim.offset += (targetOffset - note.anim.offset) * f;

        ctx.save();
        
        // Transform
        const cx = note.x + note.w / 2;
        const cy = note.y + note.h / 2;
        
        ctx.translate(cx, cy);
        ctx.rotate(note.rotation * Math.PI / 180);
        ctx.scale(note.anim.scale, note.anim.scale);

        // Shadow
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = note.anim.blur;
        ctx.shadowOffsetX = note.anim.offset;
        ctx.shadowOffsetY = note.anim.offset;

        // Note Body
        ctx.fillStyle = note.color;
        ctx.fillRect(-note.w/2, -note.h/2, note.w, note.h);
        
        // Reset Shadow for content
        ctx.shadowColor = "transparent";

        // Tape/Pin (Top Center)
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(-15, -note.h/2 - 5, 30, 20); // Tape
        // Pin Head
        ctx.fillStyle = "#e74c3c";
        ctx.beginPath(); ctx.arc(0, -note.h/2 + 5, 4, 0, Math.PI*2); ctx.fill();

        // Content
        ctx.fillStyle = "#1e293b";
        
        // Date/Time (Bottom Right now? Or Top?)
        // User said "leave some gaps add a date and time"
        // Let's put date at bottom right distinctively.
        if (note.dateTime) {
            ctx.font = "14px 'Kalam', cursive";
            ctx.textAlign = "right";
            ctx.fillStyle = "#4b5563";
            ctx.fillText(note.dateTime, note.w/2 - 10, note.h/2 - 15);
        }

        // Main Text (Wrap)
        ctx.font = "24px 'Kalam', cursive";
        ctx.textAlign = "center";
        ctx.fillStyle = "#1e293b";
        
        let displayLines = wrapText(note.text, note.w - 40);
        
        // Truncate if not expanded
        if (!note.expanded && displayLines.length > 4) {
             displayLines = displayLines.slice(0, 3);
             displayLines.push("... (Click to read)");
        }
        
        // Calc startY to center
        const lh = 30;
        const totalH = displayLines.length * lh;
        let startY = -totalH / 2;
        
        // Offset up slightly to make room for date
        startY -= 10;

        displayLines.forEach((line, i) => {
            ctx.fillText(line, 0, startY + i * lh);
        });

        ctx.restore();
    });
}

function animate() {
    draw();
    requestAnimationFrame(animate);
}

// Start
fetchData();
setInterval(fetchData, 2000);
animate();
