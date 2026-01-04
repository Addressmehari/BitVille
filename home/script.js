const canvas = document.getElementById('wall');
const ctx = canvas.getContext('2d');

let notes = [];
let previousDataStr = "";

// Camera
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

// Configuration
const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 180;
const PADDING = 20;

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
    lastMouse = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

window.addEventListener('mousemove', e => {
    // Always track mouse for hover
    lastMouse = { x: e.clientX, y: e.clientY };

    if (isDragging) {
        // Calculate delta (need previous frame mouse, or just use movementX/Y but that can be flaky)
        // Let's use stored 'lastDragPos' or just offset from previous 'lastMouse'
        // Wait, if we update lastMouse always, we need a 'dragStart' or 'prevMouse'
        
        // Actually simplest is:
        camera.x += e.movementX;
        camera.y += e.movementY;
    }
    draw();
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    // Zoom towards mouse pointer logic
    const oldZoom = camera.zoom;
    let newZoom = oldZoom + delta;
    newZoom = Math.max(0.1, Math.min(5.0, newZoom)); // Clamp zoom

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // World before zoom
    const wx = (mouseX - camera.x) / oldZoom;
    const wy = (mouseY - camera.y) / oldZoom;

    camera.zoom = newZoom;

    // Adjust camera to keep world point under mouse
    camera.x = mouseX - wx * newZoom;
    camera.y = mouseY - wy * newZoom;
    
    draw();
}, { passive: false });

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
            draw();
        }
    } catch (e) { console.error(e); }
}

function processNotes(data) {
    // Sort by timestamp if possible
    const sorted = [...data].sort((a, b) => {
        const t1 = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const t2 = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return t1 - t2; // Ascending order
    });

    notes = sorted.map((item, index) => {
        // Deterministic Color
        const colorIdx = index % COLORS.length;
        
        let text = "";
        let time = "";
        
        if (typeof item === 'string') {
            text = item;
        } else {
            text = item.answer || item.question || JSON.stringify(item);
            if (item.timestamp) {
                const d = new Date(item.timestamp);
                time = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
        }
        
        // Layout Logic: Grid
        // Columns based on arbitrary width? 
        // Let's do a dynamic flow.
        const cols = 5; // Fixed grid for now?
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        const x = 50 + col * (NOTE_WIDTH + PADDING);
        const y = 50 + row * (NOTE_HEIGHT + PADDING);

        return {
            x, y,
            w: NOTE_WIDTH,
            h: NOTE_HEIGHT,
            color: COLORS[colorIdx],
            text: text,
            time: time,
            rotation: (Math.random() - 0.5) * 6 // Random tilt +/- 3 deg
        };
    });
}

// --- Rendering ---
function draw() {
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1a1a2e"; // Darker BG
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Striped Wall Background
    ctx.strokeStyle = "#16213e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const spacing = 40 * camera.zoom;
    // Offset stripes by camera pan (modulo) to make it infinite
    const offsetX = camera.x % spacing;
    
    for (let x = offsetX; x < canvas.width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    // Camera Transform
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);

    // Draw Notes
    ctx.font = "20px 'Kalam', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shadow settings
    ctx.shadowColor = "rgba(0,0,0,0.5)"; // Darker shadow for dark mode
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 8;

    notes.forEach(note => {
        // Calculate Hover Logic
        const wx = (lastMouse.x - camera.x) / camera.zoom;
        const wy = (lastMouse.y - camera.y) / camera.zoom;
        
        let targetScale = 1.0;
        let targetLift = 0;
        let targetBlur = 15;
        let targetOffset = 8;
        
        if (wx > note.x && wx < note.x + note.w &&
            wy > note.y && wy < note.y + note.h) {
            targetScale = 1.15; // Scale up more
            targetLift = 15;
            targetBlur = 35;
            targetOffset = 20;
        }

        // Initialize animation state if missing
        if (!note.anim) {
             note.anim = { scale: 1.0, lift: 0, blur: 15, offset: 8 };
        }

        // Smooth Lerp (Linear Interpolation)
        // val = val + (target - val) * factor
        const factor = 0.2; // Speed of transition
        note.anim.scale += (targetScale - note.anim.scale) * factor;
        note.anim.blur += (targetBlur - note.anim.blur) * factor;
        note.anim.offset += (targetOffset - note.anim.offset) * factor;

        // Apply Shadow based on anim state
        ctx.shadowBlur = note.anim.blur;
        ctx.shadowOffsetX = note.anim.offset;
        ctx.shadowOffsetY = note.anim.offset;

        ctx.save();
        
        const cx = note.x + note.w / 2;
        const cy = note.y + note.h / 2;
        
        ctx.translate(cx, cy);
        ctx.rotate(note.rotation * Math.PI / 180);
        ctx.scale(note.anim.scale, note.anim.scale);
        
        // Sticky Note Body
        ctx.fillStyle = note.color;
        
        // Draw Note
        ctx.fillRect(-note.w/2, -note.h/2, note.w, note.h);
        
        // Pin/Tape?
        ctx.shadowColor = "transparent"; // Reset shadow for internal details
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(-20, -note.h/2 - 10, 40, 20); // Tape at top

        // Text
        ctx.fillStyle = "#1e293b";
        
        // Timestamp (Top Right)
        if (note.time) {
            ctx.font = "14px 'Kalam', cursive";
            ctx.textAlign = "right";
            ctx.fillText(note.time, note.w/2 - 10, -note.h/2 + 25);
        }

        // Main Text (Wrap)
        ctx.font = "24px 'Kalam', cursive";
        ctx.textAlign = "center";
        
        const maxWidth = note.w - 30;
        const words = note.text.split(' ');
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

        // Draw Lines centered vertically based on count
        const lineHeight = 30;
        const totalHeight = lines.length * lineHeight;
        const startY = -totalHeight / 2 + 10; // offset slightly down

        lines.forEach((line, i) => {
            ctx.fillText(line, 0, startY + i * lineHeight);
        });

        ctx.restore();
    });
}

// --- Animation Loop ---
function animate() {
    draw();
    requestAnimationFrame(animate);
}

// Start Poll
fetchData();
setInterval(fetchData, 2000);
animate();
