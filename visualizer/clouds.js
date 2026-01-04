class CloudSystem {
    constructor() {
        this.clouds = [];
        this.cloudCount = 25; // More clouds since they are smaller
        this.worldSize = 3000;

        for (let i = 0; i < this.cloudCount; i++) {
            this.spawnCloud(true);
        }
    }

    spawnCloud(randomX = false) {
        const x = randomX
            ? (Math.random() - 0.5) * this.worldSize
            : -this.worldSize / 2 - 400;

        this.clouds.push({
            x: x,
            y: (Math.random() - 0.5) * this.worldSize,
            z: 200 + Math.random() * 150, // High up
            scale: 0.8 + Math.random() * 0.8, // Smaller clouds
            speed: 0.15 + Math.random() * 0.3, // Slow drift
            opacity: 0.9,
            shapes: this.generateComplexShapes()
        });
    }

    generateComplexShapes() {
        let shapes = [];
        // Generate a random cluster of "puffs"
        const numBlobs = 20 + Math.random() * 20;

        for (let i = 0; i < numBlobs; i++) {
            // Concentrate puffs in the center, spread out looser at edges
            const angle = Math.random() * Math.PI * 2;
            // Distance biased towards center for density
            const dist = Math.pow(Math.random(), 2) * 60;

            shapes.push({
                dx: Math.cos(angle) * dist * 1.5, // Stretch slightly horz
                dy: Math.sin(angle) * dist,
                r: 15 + Math.random() * 25,
                shade: Math.random() // For subtle coloring
            });
        }
        // sort by size? or randomness is fine for fluff
        return shapes;
    }

    update() {
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            let c = this.clouds[i];
            c.x += c.speed;
            if (c.x > this.worldSize / 2 + 500) {
                this.clouds.splice(i, 1);
                this.spawnCloud(false);
            }
        }
    }

    render(ctx) {
        ctx.save();

        for (let c of this.clouds) {
            const sx = c.x;
            const sy = c.y - c.z;

            // 1. Cast Shadow on Ground (Key for depth perception)
            // Isometric shadow: straight down at y
            // We draw a large blurred blob on the ground
            ctx.fillStyle = "rgba(0, 50, 0, 0.1)"; // Dark green shadow

            // Draw the aggregate shape of the cloud as a shadow
            // Optimization: Just draw a few large circles for shadow to save perf
            ctx.beginPath();
            for (let i = 0; i < c.shapes.length; i += 3) { // Skip some for perf
                let s = c.shapes[i];
                let ox = s.dx * c.scale * 0.6; // Smaller shadow
                let oy = s.dy * c.scale * 0.6;
                let r = s.r * c.scale * 0.6;
                ctx.moveTo(c.x + ox, c.y + oy);
                ctx.arc(c.x + ox, c.y + oy, r, 0, Math.PI * 2);
            }
            ctx.fill();

            // 2. Render Cloud Puffs
            // We want a "Volumetric" look using Radial Gradients
            // Iterate puffs
            for (let s of c.shapes) {
                const ox = s.dx * c.scale;
                const oy = s.dy * c.scale;
                const r = s.r * c.scale;

                const px = sx + ox;
                const py = sy + oy;

                // Offset gradient center to top-left to simulate light source
                const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.4, r * 0.1, px, py, r);

                // Core: Bright White
                g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
                // Mid: Fluffy White/Grey transition
                g.addColorStop(0.5, "rgba(245, 250, 255, 0.8)");
                // Edge: Transparent fade
                g.addColorStop(1, "rgba(255, 255, 255, 0)");

                ctx.fillStyle = g;

                // Fill rect bounding box for gradient performance? Arc is fine.
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}
