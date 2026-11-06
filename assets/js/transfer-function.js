(function () {
    'use strict';
    const demo = document.getElementById('tf-demo');
    if (!demo || !window.DroneFlight) return;
    const flight = window.DroneFlight;
    const canvas = demo.querySelector('.tf-canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stick = demo.querySelector('.tf-stick');
    const knob = demo.querySelector('.tf-stick-knob');
    const readout = demo.querySelector('.tf-input');
    const status = demo.querySelector('.tf-flight-status');
    const environmentStatus = demo.querySelector('.tf-environment-status');
    const scenery = window.createDroneScenery(ctx, flight);
    const modeButtons = demo.querySelectorAll('[data-tf-mode]');
    const telemetry = Object.fromEntries(['altitude', 'roll', 'thrust', 'speed', 'distance'].map(name => [name, demo.querySelector('.tf-' + name)]));
    const keys = new Set();
    const axis = { x: 0, y: 0 };
    const inputTarget = { x: 0, y: 0 };
    const dragOrigin = { x: 0, y: 0 };
    const camera = { x: 0, altitude: 9 };
    let state = flight.createState();
    let pointerId = null;
    let width = 0, height = 0, lastTime = 0, frame = 0, accumulator = 0, lastReadout = 0;
    let visible = false;
    const PPM = 9;
    const POINTER_GAIN = .55;
    const INPUT_RESPONSE = .065;
    const STEP = 1 / 120;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const descriptions = {
        loiter: 'Loiter · Release to brake, level out, and hold position & altitude.',
        angle: 'Angle · Self-levels, but drifts with momentum & wind. Adjust throttle to hold altitude.',
        manual: 'Manual · Hold roll to keep rotating. No self-leveling or altitude hold; center throttle is near hover.'
    };
    const travel = () => stick.clientWidth / 2 - 22;

    function paintInput() {
        knob.style.transform = 'translate(' + axis.x * travel() + 'px, ' + axis.y * travel() + 'px)';
        const signed = value => (value >= 0 ? '+' : '') + Math.round(value * 100) + '%';
        readout.textContent = 'THR ' + signed(-axis.y) + ' · ROLL ' + signed(axis.x);
    }
    function setInput(x, y) {
        // Square gate: both channels can reach 100% at the same time.
        inputTarget.x = Math.max(-1, Math.min(1, x));
        inputTarget.y = Math.max(-1, Math.min(1, y));
    }
    function smoothInput(dt) {
        const response = 1 - Math.exp(-dt / INPUT_RESPONSE);
        ['x', 'y'].forEach(key => {
            axis[key] += (inputTarget[key] - axis[key]) * response;
            if (Math.abs(axis[key] - inputTarget[key]) < .001) axis[key] = inputTarget[key];
        });
        paintInput();
    }
    function releaseInput() {
        const captured = pointerId;
        pointerId = null;
        keys.clear();
        stick.classList.remove('is-held');
        setInput(0, 0);
        axis.x = axis.y = 0;
        paintInput();
        if (captured !== null && stick.hasPointerCapture(captured)) stick.releasePointerCapture(captured);
    }
    function point(event) {
        setInput((event.clientX - dragOrigin.x) * POINTER_GAIN / travel(),
            (event.clientY - dragOrigin.y) * POINTER_GAIN / travel());
    }
    stick.addEventListener('pointerdown', event => {
        if (pointerId !== null || !event.isPrimary || event.button !== 0 || state.status !== 'flying') return;
        event.preventDefault();
        keys.clear();
        stick.focus({ preventScroll: true });
        pointerId = event.pointerId;
        stick.setPointerCapture(pointerId);
        stick.classList.add('is-held');
        // Pick up the stick without a jump, even when clicking away from its centre.
        dragOrigin.x = event.clientX;
        dragOrigin.y = event.clientY;
        point(event);
    });
    stick.addEventListener('pointermove', event => {
        if (event.pointerId !== pointerId) return;
        if ((event.buttons & 1) === 0) { releaseInput(); return; }
        point(event);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
        stick.addEventListener(type, event => {
            if (event.pointerId === pointerId) releaseInput();
        });
    });
    function keyboardInput() {
        stick.classList.toggle('is-held', keys.size > 0);
        setInput(Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
            Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')));
    }
    stick.addEventListener('keydown', event => {
        if (event.key === 'Escape') { releaseInput(); return; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        if (pointerId !== null || state.status !== 'flying') return;
        keys.add(event.key);
        keyboardInput();
    });
    stick.addEventListener('keyup', event => {
        if (!keys.has(event.key)) return;
        event.preventDefault(); keys.delete(event.key); keyboardInput();
    });
    stick.addEventListener('blur', releaseInput);
    window.addEventListener('blur', releaseInput);

    function updateReadout() {
        const env = flight.environment(state.x, state.altitude);
        const notices = [];
        if (env.high) notices.push('ALTITUDE LIMIT · 150 m · Climb blocked');
        if (env.tunnel) notices.push('GPS LOST · Loiter unavailable' + (state.mode === 'angle' ? ' · Angle fallback' : ''));
        else if (env.gps < 1) notices.push('WEAK GPS · ' + env.label + (state.mode === 'loiter' ? ' · Unstable position hold' : ''));
        const notice = notices.join(' / ');
        environmentStatus.hidden = !notice;
        if (environmentStatus.textContent !== notice) environmentStatus.textContent = notice;
        modeButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.tfMode === state.mode));
            button.disabled = env.tunnel && button.dataset.tfMode === 'loiter';
        });
        const description = descriptions[state.mode];
        if (demo.querySelector('.tf-description').textContent !== description)
            demo.querySelector('.tf-description').textContent = description;
        telemetry.altitude.value = state.altitude.toFixed(1) + ' m';
        const degrees = Math.atan2(Math.sin(state.roll), Math.cos(state.roll)) * 180 / Math.PI;
        telemetry.roll.value = Math.round(degrees) + '°';
        telemetry.thrust.value = Math.round(state.motor * 100) + '%';
        telemetry.speed.value = Math.hypot(state.vx, state.vz).toFixed(1) + ' m/s';
        telemetry.distance.value = Math.round(state.distance) + ' m';
        const ended = state.status !== 'flying';
        status.hidden = !ended;
        if (ended) {
            const message = (state.collisionReason || 'Body / rotor impact') + '. Press Reset to try again.';
            if (status.textContent !== message) status.textContent = message;
        } else status.textContent = '';
    }
    function reset() {
        releaseInput();
        state = flight.createState(state.mode);
        camera.x = 0; camera.altitude = 9;
        accumulator = lastTime = lastReadout = 0;
        updateReadout(); draw();
    }
    demo.querySelector('.tf-reset').addEventListener('click', reset);
    modeButtons.forEach(button => button.addEventListener('click', () => {
        releaseInput();
        flight.setMode(state, button.dataset.tfMode);
        updateReadout(); draw();
    }));

    function resize() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        width = rect.width; height = rect.height;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        releaseInput();
        flight.followCamera(camera, state, width, height, PPM);
        draw();
    }
    const screenX = x => width / 2 + (x - camera.x) * PPM;
    const screenY = altitude => height / 2 - (altitude - camera.altitude) * PPM;

    function landscape() {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#102039'); sky.addColorStop(1, '#284760');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
        scenery.photosBehind(camera, width, height);
        // World-anchored grid and markers show horizontal and vertical travel.
        const left = camera.x - width / (2 * PPM), right = camera.x + width / (2 * PPM);
        const bottom = camera.altitude - height / (2 * PPM), top = camera.altitude + height / (2 * PPM);
        ctx.lineWidth = 1; ctx.strokeStyle = '#a1c7df13'; ctx.beginPath();
        for (let x = Math.floor(left / 10) * 10; x <= right; x += 10) {
            ctx.moveTo(screenX(x), 0); ctx.lineTo(screenX(x), height);
        }
        for (let z = Math.ceil(bottom / 10) * 10; z <= top; z += 10) {
            if (z < 0) continue;
            ctx.moveTo(0, screenY(z)); ctx.lineTo(width, screenY(z));
        }
        ctx.stroke();
        ctx.fillStyle = '#a9c3d5'; ctx.font = '9px ui-monospace, monospace';
        for (let z = Math.max(10, Math.ceil(bottom / 10) * 10); z <= top; z += 10) {
            const y = screenY(z);
            if (y > 28 && y < height - 10) ctx.fillText(z + ' m', 7, y - 4);
        }
        // Distant silhouettes remain behind the GPS-shadow landmarks.
        for (let layer = 0; layer < 2; layer++) {
            const factor = layer ? .5 : .22;
            const base = screenY(0) - 2;
            ctx.fillStyle = layer ? '#2b4c60' : '#254154'; ctx.beginPath();
            ctx.moveTo(0, height);
            for (let px = -20; px <= width + 20; px += 10) {
                const world = px + camera.x * PPM * factor;
                const ridge = 8 + (Math.sin(world * .013 + layer) + 1) * 10 + (Math.sin(world * .031) + 1) * 6;
                ctx.lineTo(px, base - ridge);
            }
            ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
        }
        const ground = screenY(0);
        ctx.fillStyle = '#162f35'; ctx.fillRect(0, ground, width, Math.max(0, height - ground));
        ctx.strokeStyle = '#79aa97'; ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(width, ground); ctx.stroke();
        for (let x = Math.floor(left / 20) * 20; x <= right; x += 20) {
            const px = screenX(x);
            ctx.strokeStyle = '#8bb3a6'; ctx.beginPath(); ctx.moveTo(px, ground); ctx.lineTo(px, ground - 14); ctx.stroke();
            ctx.fillStyle = '#8be4c0'; ctx.fillRect(px, ground - 14, 7, 4);
            ctx.fillStyle = '#b4c8c2';
            if (x !== 0) ctx.fillText(x + ' m', px + 4, ground + 12);
        }
        const home = screenX(0);
        ctx.strokeStyle = '#9ae5c7'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(home - 20, ground - 1); ctx.lineTo(home + 20, ground - 1); ctx.stroke();
        ctx.fillStyle = '#b8ead8'; ctx.fillText('HOME', home - 11, ground + 12);
    }

    function drawDrone() {
        const x = screenX(state.x), y = screenY(state.altitude);
        const ground = screenY(0);
        if (ground >= 0 && ground <= height) {
            ctx.fillStyle = '#071d2866'; ctx.beginPath();
            ctx.ellipse(x, ground + 2, 18 / (1 + state.altitude * .025), 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.save(); ctx.translate(x, y); ctx.rotate(state.roll); ctx.scale(PPM / 7, PPM / 7);
        if (state.motor > 0) {
            ctx.strokeStyle = '#8be4c044'; ctx.lineWidth = 1;
            [-19, 19].forEach(px => {
                ctx.beginPath(); ctx.moveTo(px - 4, 4); ctx.lineTo(px - 7, 10 + state.motor * 6);
                ctx.moveTo(px + 4, 4); ctx.lineTo(px + 7, 10 + state.motor * 6); ctx.stroke();
            });
        }
        ctx.strokeStyle = '#93b1cb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-9, 9); ctx.lineTo(-13, 9);
        ctx.moveTo(6, 3); ctx.lineTo(9, 9); ctx.lineTo(13, 9); ctx.stroke();
        ctx.strokeStyle = '#dcebf3'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(22, -2); ctx.stroke();
        [-20, 20].forEach((px, i) => {
            ctx.fillStyle = '#5e809c'; ctx.fillRect(px - 3, -6, 6, 6);
            ctx.strokeStyle = i ? '#85efba' : '#f7c478'; ctx.lineWidth = 1.5;
            const rotor = reducedMotion || state.motor === 0 ? 11 : 7 + 5 * Math.abs(Math.sin(state.elapsed * 50));
            ctx.beginPath(); ctx.ellipse(px, -7, rotor, 2, 0, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.fillStyle = state.status === 'crashed' ? '#f4b37c' : '#e2edf5';
        ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(9, -5); ctx.lineTo(7, 5); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#203e5c'; ctx.fillRect(-4, -3, 8, 4);
        ctx.fillStyle = state.status === 'crashed' ? '#ff8f70' : '#80f0bc'; ctx.beginPath(); ctx.arc(0, 4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    function drawGps() {
        const env = flight.environment(state.x, state.altitude);
        const active = state.mode === 'loiter' && env.gps > 0;
        const x = width / 2, y = 28;
        // Screen-anchored satellite; only the communication paths track the drone.
        if (active) {
            const startY = y + 32;
            const endX = screenX(state.x), endY = screenY(state.altitude) - 18;
            const dx = endX - x, dy = endY - startY;
            const length = Math.hypot(dx, dy);
            if (length > 24) {
                const nx = -dy / length, ny = dx / length;
                ctx.save();
                ctx.globalAlpha = env.gps < 1 ? .25 + .45 * Math.abs(Math.sin(state.elapsed * 4)) : 1;
                ctx.lineWidth = .9;
                ctx.lineJoin = 'round';
                // Two fine zigzags carry packets in opposite directions.
                [-1, 1].forEach(direction => {
                    ctx.beginPath();
                    const steps = Math.max(6, Math.min(18, Math.round(length / 16)));
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const bend = (i === 0 || i === steps ? 0 : (i % 2 ? 3 : -3)) + direction * 3;
                        const px = x + dx * t + nx * bend, py = startY + dy * t + ny * bend;
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.setLineDash([]);
                    ctx.strokeStyle = '#8be4c029'; ctx.stroke();
                    ctx.setLineDash([9, 17]);
                    ctx.lineDashOffset = reducedMotion ? 0 : direction * state.elapsed * 32;
                    ctx.strokeStyle = direction > 0 ? '#8be4c0aa' : '#a9d9ffaa';
                    ctx.stroke();
                });
                ctx.restore();
            }
        }
        ctx.save(); ctx.translate(x, y);
        ctx.rotate(-Math.PI / 7);
        ctx.lineWidth = 1;
        ctx.strokeStyle = active ? '#a8e8ff' : '#7b8794';
        ctx.fillStyle = active ? '#315c83' : '#46515f';
        [-1, 1].forEach(side => {
            const px = side < 0 ? -32 : 12;
            ctx.fillRect(px, -9, 20, 18); ctx.strokeRect(px, -9, 20, 18);
            ctx.beginPath();
            ctx.moveTo(px + 10, -9); ctx.lineTo(px + 10, 9);
            ctx.moveTo(px, 0); ctx.lineTo(px + 20, 0);
            ctx.moveTo(side * 12, 0); ctx.lineTo(side * 7, 0); ctx.stroke();
        });
        ctx.fillStyle = active ? '#e2edf5' : '#8a949f';
        ctx.fillRect(-7, -11, 14, 22);
        ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(0, 17); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 17, 4, 0, Math.PI); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = env.gps === 0 ? '#ff9c8c' : env.gps < 1 ? '#ffd18c' : active ? '#8be4c0' : '#8a949f';
        ctx.textAlign = 'center'; ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(env.gps === 0 ? 'GPS LOST' : env.gps < 1 ? 'GPS WEAK' : 'GPS', x, y + 29);
        ctx.restore();
    }
    function draw() {
        if (!width || !height) return;
        landscape(); scenery.structures(camera, width, height, PPM); drawGps(); drawDrone();
    }
    function tick(now) {
        frame = 0;
        if (!visible || document.hidden) return;
        accumulator += Math.min((now - (lastTime || now)) / 1000, .05);
        lastTime = now;
        const before = state.status;
        while (accumulator >= STEP) {
            smoothInput(STEP);
            flight.step(state, axis, STEP);
            accumulator -= STEP;
        }
        if (state.status !== before) { releaseInput(); updateReadout(); }
        flight.followCamera(camera, state, width, height, PPM);
        draw();
        if (now - lastReadout > 100) { updateReadout(); lastReadout = now; }
        frame = requestAnimationFrame(tick);
    }
    function updateLoop() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0; lastTime = 0; accumulator = 0;
        if (visible && !document.hidden) frame = requestAnimationFrame(tick);
        else releaseInput();
    }
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        updateLoop();
    }).observe(demo);
    document.addEventListener('visibilitychange', updateLoop);
    new MutationObserver(() => {
        if (demo.closest('[hidden]')) { visible = false; updateLoop(); }
    }).observe(document.getElementById('overview-view'), { attributes: true, attributeFilter: ['hidden'] });
    updateReadout(); resize();
}());
