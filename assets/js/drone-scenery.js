/* Gallery photos are reused locally, loaded on demand, and cached in a small window. */
(function () {
    'use strict';
    window.createDroneScenery = function (ctx, flight) {
        const photos = [...new Set([...document.querySelectorAll('img[src]')]
            .map(img => img.getAttribute('src')).filter(src => src.includes('images/portfolio/Tour_')))];
        const cache = new Map();
        function texture(index) {
            if (!photos.length) return null;
            const key = ((index % photos.length) + photos.length) % photos.length;
            if (cache.has(key)) return cache.get(key);
            const entry = { canvas: null };
            cache.set(key, entry);
            if (cache.size > 6) cache.delete(cache.keys().next().value);
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                const c = document.createElement('canvas'); c.width = 640; c.height = 420;
                const g = c.getContext('2d');
                // One projection at every blur level: no sharp inset rectangle.
                const source = document.createElement('canvas'); source.width = 640; source.height = 420;
                const sg = source.getContext('2d');
                const scale = Math.min((c.width - 32) / img.width, (c.height - 32) / img.height);
                const x = (640 - img.width * scale) / 2, y = (420 - img.height * scale) / 2;
                const w = img.width * scale, h = img.height * scale;
                sg.drawImage(img, x, y, w, h);
                // Extend edge pixels outside the fitted photo before softening them.
                sg.drawImage(img, 0, 0, 1, img.height, 0, y, x, h);
                sg.drawImage(img, img.width - 1, 0, 1, img.height, x + w, y, x, h);
                sg.drawImage(source, 0, y, 640, 1, 0, 0, 640, y);
                sg.drawImage(source, 0, y + h - 1, 640, 1, 0, y + h, 640, y);
                [18, 10, 5, 1.5].forEach((blur, level) => {
                    const layer = document.createElement('canvas'); layer.width = 640; layer.height = 420;
                    const lg = layer.getContext('2d');
                    lg.filter = 'blur(' + blur + 'px)'; lg.drawImage(source, 0, 0); lg.filter = 'none';
                    if (level > 0) {
                        lg.globalCompositeOperation = 'destination-in';
                        lg.save(); lg.translate(320, 210); lg.scale(w / 2, h / 2);
                        const mask = lg.createRadialGradient(0, 0, 0, 0, 0, 1.55 - level * .25);
                        mask.addColorStop(0, '#000'); mask.addColorStop(.3, '#000'); mask.addColorStop(1, 'transparent');
                        lg.fillStyle = mask; lg.fillRect(-640 / w, -420 / h, 1280 / w, 840 / h); lg.restore();
                    }
                    g.drawImage(layer, 0, 0);
                });
                g.globalCompositeOperation = 'destination-in';
                const horizontal = g.createLinearGradient(0, 0, 640, 0);
                horizontal.addColorStop(0, 'transparent'); horizontal.addColorStop(.4, '#000');
                horizontal.addColorStop(.6, '#000'); horizontal.addColorStop(1, 'transparent');
                g.fillStyle = horizontal; g.fillRect(0, 0, 640, 420);
                const vertical = g.createLinearGradient(0, 0, 0, 420);
                vertical.addColorStop(0, 'transparent'); vertical.addColorStop(.1, '#000');
                vertical.addColorStop(.9, '#000'); vertical.addColorStop(1, 'transparent');
                g.fillStyle = vertical; g.fillRect(0, 0, 640, 420);
                entry.canvas = c;
            };
            img.src = photos[key];
            return entry;
        }
        function photosBehind(camera, width, height) {
            const photoHeight = height * .78, photoWidth = photoHeight * 640 / 420;
            const span = photoWidth * .52, progress = Math.max(0, camera.x) / 55;
            const current = Math.floor(progress);
            for (let i = current - 2; i <= current + 3; i++) {
                if (i < 0) continue;
                const entry = texture(i);
                if (!entry || !entry.canvas) continue;
                ctx.save(); ctx.globalAlpha = .65;
                ctx.drawImage(entry.canvas, width / 2 - span * .5 + (i - progress) * span,
                    height * .08, photoWidth, photoHeight);
                ctx.restore();
            }
        }
        function structures(camera, width, height, ppm) {
            const sx = x => width / 2 + (x - camera.x) * ppm;
            const sy = z => height / 2 - (z - camera.altitude) * ppm;
            const left = camera.x - width / (2 * ppm), right = camera.x + width / (2 * ppm);
            const wall = sx(flight.WALL_X);
            if (wall > 0) {
                ctx.fillStyle = '#637785'; ctx.fillRect(0, 0, Math.min(width, wall), height);
                ctx.strokeStyle = '#e0b96a'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(wall, 0); ctx.lineTo(wall, height); ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
                if (wall > 55) ctx.fillText('FLY RIGHT →', 8, height / 2);
            }
            for (let cycle = Math.max(0, Math.floor(left / 480)); cycle <= Math.floor(right / 480); cycle++) {
                for (const zone of flight.ZONES) {
                    const start = zone.start + cycle * 480, end = zone.end + cycle * 480;
                    if (end < left || start > right) continue;
                    const x = sx(start), w = (end - start) * ppm, ground = sy(0), top = sy(zone.height);
                    ctx.save();
                    ctx.fillStyle = '#446478bb'; ctx.strokeStyle = '#81a5b7'; ctx.lineWidth = 1;
                    if (zone.type === 'mountain') {
                        ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x + w * .35, top + 30);
                        ctx.lineTo(x + w * .6, top); ctx.lineTo(x + w, ground); ctx.closePath(); ctx.fill();
                    } else if (zone.type === 'tunnel') {
                        ctx.fillStyle = '#3e505b';
                        ctx.beginPath(); ctx.moveTo(x, top);
                        ctx.lineTo(x, sy(zone.mountainHeight - 25));
                        ctx.lineTo(x + w * .48, sy(zone.mountainHeight));
                        ctx.lineTo(x + w, sy(zone.mountainHeight - 25));
                        ctx.lineTo(x + w, top); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = '#75858b'; ctx.stroke();
                        ctx.fillStyle = '#101a2bcc'; ctx.fillRect(x, top, w, ground - top);
                        ctx.fillStyle = '#7d8d99'; ctx.fillRect(x, top - 12, w, 12);
                        ctx.strokeRect(x, top, w, ground - top);
                        ctx.fillStyle = '#ffd18c'; ctx.font = '12px sans-serif';
                        ctx.fillText('TUNNEL · NO GPS', Math.max(6, x + 10), Math.max(80, top + 22));
                    } else {
                        for (let bx = x; bx < x + w; bx += 65) {
                            const bh = flight.buildingHeight(zone, (bx - x + .001) / ppm) * ppm;
                            const bw = Math.min(52, x + w - bx);
                            ctx.fillStyle = '#41556dcc'; ctx.fillRect(bx, ground - bh, bw, bh);
                            ctx.strokeRect(bx, ground - bh, bw, bh);
                            ctx.fillStyle = '#bad4c077';
                            for (let wy = Math.max(0, ground - bh + 12); wy < Math.min(height, ground); wy += 22)
                                for (let wx = 8; wx < bw - 7; wx += 14) ctx.fillRect(bx + wx, wy, 6, 8);
                        }
                    }
                    ctx.fillStyle = '#f5d49d'; ctx.font = '11px sans-serif';
                    if (zone.type !== 'tunnel') ctx.fillText(zone.label + ' · GPS shadow', Math.max(6, x + 8), Math.max(85, top - 8));
                    ctx.restore();
                }
            }
        }
        return { photosBehind, structures };
    };
}());
