/* Deterministic 2D model. Metres, seconds, radians; altitude is positive up. */
(function (root) {
    'use strict';
    const G = 9.81;
    const MAX_THRUST = G * 2.8;
    const ALTITUDE_LIMIT = 150;
    const dragX = v => .10 * v + .003 * v * Math.abs(v);
    const dragZ = v => .09 * v;
    const MODES = ['loiter', 'angle', 'manual'];
    // Match the drawn skid ends and rotor tips (drawing units / 7 = metres).
    const SKID_X = 13 / 7, SKID_Z = -9 / 7, INERTIA = 7;
    const clamp = (v, low, high) => Math.min(high, Math.max(low, v));
    const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
    const WALL_X = -12;
    const ZONES = Object.freeze([
        { start: 80, end: 140, height: 65, type: 'mountain', label: 'Mountain' },
        { start: 185, end: 210, height: 45, type: 'apartments', label: 'Low-rise apartments' },
        { start: 210, end: 240, height: 145, type: 'apartments', label: 'High-rise apartments' },
        { start: 280, end: 325, height: 35, type: 'buildings', label: 'Buildings' },
        { start: 360, end: 425, height: 22, mountainHeight: 190, type: 'tunnel', label: 'Tunnel' }
    ]);
    function buildingHeight(zone, localX) {
        return zone.height - (Math.floor(Math.max(0, localX) / (65 / 9)) % 3) * 5;
    }
    function environment(x, altitude) {
        const offset = Math.floor(Math.max(0, x) / 480) * 480;
        const zone = ZONES.find(z => x >= z.start + offset && x <= z.end + offset);
        const roof = zone && (zone.type === 'apartments' || zone.type === 'buildings')
            ? buildingHeight(zone, x - offset - zone.start) : zone && zone.height;
        const blocked = zone && altitude < roof;
        const tunnel = !!(blocked && zone.type === 'tunnel');
        return { zone: zone ? zone.type : 'open', label: zone ? zone.label : 'Open sky',
            gps: tunnel ? 0 : blocked ? .28 : 1, tunnel, high: altitude >= 150 };
    }

    function createState(mode = 'loiter') {
        return {
            mode: MODES.includes(mode) ? mode : 'loiter',
            x: 0, altitude: 9, vx: 0, vz: 0, roll: 0, rollRate: 0,
            holdX: 0, holdAltitude: 9, wasRolling: false, wasClimbing: false,
            motor: 1 / 2.8, elapsed: 0, distance: 0, status: 'flying', grounded: false,
            loiterGroundHold: false, inTunnel: false
        };
    }
    function setMode(state, mode) {
        if (!MODES.includes(mode)) return;
        if (mode === 'loiter' && environment(state.x, state.altitude).tunnel) mode = 'angle';
        state.mode = mode;
        state.loiterGroundHold = mode === 'loiter' && state.grounded;
        state.holdX = state.x + state.vx * .35;
        state.holdAltitude = Math.max(-SKID_Z, state.altitude + state.vz * .25);
        state.wasRolling = state.wasClimbing = false;
    }
    function step(s, input, dt) {
        if (s.status !== 'flying' || dt <= 0) return;
        const previous = { x: s.x, altitude: s.altitude };
        const env = environment(s.x, s.altitude);
        if (env.tunnel && (!s.inTunnel || s.mode === 'loiter')) setMode(s, 'angle');
        s.inTunnel = env.tunnel;
        const rollInput = clamp(input.x || 0, -1, 1);
        const throttleInput = clamp(-(input.y || 0), -1, 1);
        const rolling = Math.abs(rollInput) > .025;
        const climbing = Math.abs(throttleInput) > .025;
        // A rocking skid can briefly lose contact. Keep landing control latched
        // through those bounces, and exit only after a commanded, clear liftoff.
        const skidClearance = s.altitude + SKID_Z * Math.cos(s.roll)
            - Math.abs(SKID_X * Math.sin(s.roll));
        if (s.loiterGroundHold && throttleInput > .025 && !s.grounded
            && skidClearance > .12 && s.vz > 0) {
            s.loiterGroundHold = false;
            s.holdX = s.x;
            s.wasRolling = false;
        }
        const groundHold = s.grounded || s.loiterGroundHold;
        const landing = s.altitude < 6 && s.vz <= .5;
        s.elapsed += dt;
        // Light crosswind exposes the lack of position hold in Angle / Manual.
        const wind = .14 + .07 * Math.sin(s.elapsed * .6);
        const verticalGust = .025 * Math.sin(s.elapsed * .9);
        let targetRoll = 0;
        let verticalAcceleration = 0;
        if (s.mode === 'loiter') {
            let horizontalAcceleration;
            if (rolling) {
                horizontalAcceleration = (rollInput * 22 - s.vx) * 4.5;
            } else {
                if (s.wasRolling) s.holdX = s.x + s.vx * .35;
                horizontalAcceleration = (s.holdX - s.x) * 2 - s.vx * 2.8;
            }
            if (climbing) {
                verticalAcceleration = (throttleInput * (landing ? 3 : 6) - s.vz) * (landing ? 3.2 : 4.5);
            } else {
                if (s.wasClimbing) s.holdAltitude = Math.max(-SKID_Z, s.altitude + s.vz * .25);
                verticalAcceleration = (s.holdAltitude - s.altitude) * 4 - s.vz * 3;
            }
            if (groundHold) {
                s.holdX = s.x;
                s.holdAltitude = s.altitude;
                // Ground friction replaces lateral position control. Do not bank into
                // an unreachable airborne target, a held roll command, or the wind.
                // Level first during takeoff; resume lateral control after liftoff.
                horizontalAcceleration = 0;
                // Remain on the skids until the pilot deliberately commands a climb.
                if (throttleInput <= .025) verticalAcceleration = -G * .8;
            }
            // Simulated GPS position errors: only the position-hold controller
            // responds to these; Angle / Manual do not depend on GPS.
            if (!groundHold && env.gps < 1) {
                horizontalAcceleration += (1 - env.gps) * (5 * Math.sin(s.elapsed * 2.7) + 2 * Math.sin(s.elapsed * 5.3));
                verticalAcceleration += (1 - env.gps) * 1.5 * Math.sin(s.elapsed * 2.1);
            }
            verticalAcceleration = clamp(verticalAcceleration, -G * (landing ? .7 : .8), G * 1.2);
            targetRoll = groundHold ? 0 : clamp(Math.atan2(horizontalAcceleration + dragX(s.vx) - wind,
                G + verticalAcceleration), landing ? -.61 : -.85, landing ? .61 : .85);
        } else if (s.mode === 'angle') {
            targetRoll = rollInput * .85;
        }
        const controlAuthority = groundHold ? .25 : 1;
        if (s.mode === 'manual') {
            // Acro-style rate command: held input keeps rotating, with no angle limit.
            s.rollRate += (rollInput * 4.2 - s.rollRate) * (1 - Math.exp(-22 * controlAuthority * dt));
        } else {
            const commandedRate = clamp(wrap(targetRoll - s.roll) * (landing ? 8 : 12), landing ? -3.5 : -6, landing ? 3.5 : 6);
            s.rollRate += (commandedRate - s.rollRate) * (1 - Math.exp(-(landing ? 18 : 26) * controlAuthority * dt));
        }
        s.roll += s.rollRate * dt;
        let thrust;
        if (s.mode === 'loiter') {
            thrust = (G + verticalAcceleration + dragZ(s.vz) - verticalGust)
                / Math.max(.35, Math.cos(s.roll));
        } else {
            // Spring-centred throttle is near hover, not altitude hold.
            // Neither mode compensates for bank angle or vertical motion.
            thrust = clamp(G * .98 + throttleInput * G * 1.7, 0, MAX_THRUST);
        }
        thrust = clamp(thrust, 0, MAX_THRUST);
        s.motor = thrust / MAX_THRUST;
        s.vx += (Math.sin(s.roll) * thrust + wind - dragX(s.vx)) * dt;
        s.vz += (Math.cos(s.roll) * thrust - G + verticalGust - dragZ(s.vz)) * dt;
        s.x += s.vx * dt;
        s.altitude += s.vz * dt;
        s.distance += Math.abs(s.vx) * dt;
        s.wasRolling = rolling;
        s.wasClimbing = climbing;
        groundContact(s, dt);
        if (s.altitude >= ALTITUDE_LIMIT) {
            s.altitude = ALTITUDE_LIMIT; s.vz = Math.min(0, s.vz);
            s.holdAltitude = Math.min(s.holdAltitude, ALTITUDE_LIMIT);
        }
        tunnelContact(s, previous);
        // Unbounded vertical wall. Rotor clearance prevents crossing at any altitude.
        if (s.x < WALL_X + 5) {
            s.x = WALL_X + 5; s.vx = Math.max(0, s.vx);
            s.holdX = Math.max(s.holdX, s.x);
        }
        const inTunnel = environment(s.x, s.altitude).tunnel;
        if (inTunnel && (!s.inTunnel || s.mode === 'loiter')) setMode(s, 'angle');
        s.inTunnel = inTunnel;
    }

    function tunnelContact(s, previous) {
        if (s.status !== 'flying') return;
        // Swept rotor/hull bounds prevent tunnelling through the ceiling or cliff
        // even at high speed. The solid mountain spans above the flight ceiling.
        const sin = Math.abs(Math.sin(s.roll)), cos = Math.abs(Math.cos(s.roll));
        const rx = (31 * cos + 9 * sin) / 7, rz = (31 * sin + 9 * cos) / 7;
        const dx = s.x - previous.x, dz = s.altitude - previous.altitude;
        const tunnel = ZONES.find(z => z.type === 'tunnel');
        for (let cycle = Math.max(0, Math.floor((Math.min(previous.x, s.x) - rx) / 480));
            cycle <= Math.floor((Math.max(previous.x, s.x) + rx) / 480); cycle++) {
            const bounds = [[tunnel.start + cycle * 480 - rx, tunnel.end + cycle * 480 + rx],
                [tunnel.height - rz, tunnel.mountainHeight + rz]];
            let enter = 0, leave = 1, hit = true;
            [[previous.x, dx], [previous.altitude, dz]].forEach(([p, d], i) => {
                const [low, high] = bounds[i];
                if (Math.abs(d) < 1e-9) { if (p < low || p > high) hit = false; }
                else { const a = (low - p) / d, b = (high - p) / d;
                    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
            });
            if (!hit || enter > leave || enter > 1 || leave < 0) continue;
            const t = Math.max(0, enter - .0001);
            s.x = previous.x + dx * t; s.altitude = previous.altitude + dz * t;
            s.status = 'crashed'; s.collisionReason = 'Tunnel ceiling / mountain impact';
            s.vx = s.vz = s.rollRate = s.motor = 0;
            return;
        }
    }
    function groundContact(s, dt) {
        const sin = Math.sin(s.roll), cos = Math.cos(s.roll);
        const point = (x, z) => ({ x: x * cos + z * sin, z: -x * sin + z * cos });
        const feet = [point(-SKID_X, SKID_Z), point(SKID_X, SKID_Z)];
        const lowestSkid = Math.min(...feet.map(p => p.z));
        // Hull / propeller contact is a crash. Skid impact severity alone never ends flight.
        const hull = [point(-9 / 7, -5 / 7), point(9 / 7, -5 / 7),
            point(-9 / 7, 5 / 7), point(9 / 7, 5 / 7),
            point(-31 / 7, 7 / 7), point(31 / 7, 7 / 7)];
        const lowestHull = Math.min(...hull.map(p => p.z));
        if (lowestHull < lowestSkid && s.altitude + lowestHull <= 0) {
            s.altitude = -lowestHull;
            s.status = 'crashed';
            s.vx = s.vz = s.rollRate = s.motor = 0;
            s.grounded = true;
            return;
        }
        const contacts = feet.filter(p => s.altitude + p.z <= .025).map(p => {
            const incoming = s.vz - s.rollRate * p.x;
            return { ...p, normal: 0, tangent: 0,
                bounce: incoming < -2 ? Math.min(1.8, -incoming * .12) : 0 };
        });
        s.grounded = contacts.length > 0;
        if (!s.grounded) return;
        // Sequential rigid-body impulses let one skid absorb the impact first and rock
        // onto the other. Friction slows sliding without locking the drone to the ground.
        for (let i = 0; i < 8; i++) {
            for (const p of contacts) {
                const normalSpeed = s.vz - s.rollRate * p.x;
                const change = (p.bounce - normalSpeed) / (1 + p.x * p.x / INERTIA);
                const normal = Math.max(0, p.normal + change);
                const impulse = normal - p.normal;
                p.normal = normal;
                s.vz += impulse;
                s.rollRate -= p.x * impulse / INERTIA;
                const slide = s.vx + s.rollRate * p.z;
                const tangent = clamp(p.tangent - slide / (1 + p.z * p.z / INERTIA),
                    -.65 * p.normal, .65 * p.normal);
                const friction = tangent - p.tangent;
                p.tangent = tangent;
                s.vx += friction;
                s.rollRate += p.z * friction / INERTIA;
            }
        }
        // Compliant landing gear limits a harsh rotational kick without erasing rocking.
        s.rollRate = clamp(s.rollRate, -3.2, 3.2) * Math.exp(-.8 * dt);
        s.altitude = Math.max(s.altitude, -lowestSkid);
        if (s.mode === 'loiter') {
            s.loiterGroundHold = true;
            s.holdAltitude = s.altitude;
            s.holdX = s.x;
            s.wasRolling = s.wasClimbing = false;
        }
    }
    function followCamera(camera, state, width, height, pixelsPerMetre) {
        // Fly within a central dead zone before the landscape starts scrolling.
        const dx = width * .23 / pixelsPerMetre;
        const dz = height * .22 / pixelsPerMetre;
        camera.x = clamp(camera.x, state.x - dx, state.x + dx);
        camera.altitude = clamp(camera.altitude, state.altitude - dz, state.altitude + dz);
        // At low altitude, keep the ground near the bottom 12% of the viewport.
        camera.altitude = Math.max(camera.altitude, height * .38 / pixelsPerMetre);
    }
    const api = Object.freeze({ createState, setMode, step, followCamera, environment, ZONES, WALL_X, ALTITUDE_LIMIT, buildingHeight, dragX });
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DroneFlight = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
