/**
 * Three.js based gimbal pointing view.
 * Azimuth rotates on the ground plane; elevation raises the antenna arm.
 */
class Gimbal3DView {
    constructor(tracker) {
        this.tracker = tracker;
        this.container = document.getElementById('gimbal3DView');
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.animationFrame = null;
        this.targetAzimuth = 0;
        this.targetElevation = 0;
        this.displayAzimuth = 0;
        this.displayElevation = 0;
        this.cameraAzimuth = 42;
        this.cameraElevation = 28;
        this.cameraDistance = 4.4;
        this.dragState = null;
        this.resizeObserver = null;

        this.initialize();
    }

    initialize() {
        if (!this.container || typeof THREE === 'undefined') {
            return;
        }

        try {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true,
                powerPreference: 'high-performance'
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.domElement.className = 'gimbal-3d-canvas';

            this.container.classList.add('is-3d');
            this.container.querySelectorAll('canvas').forEach(canvas => canvas.remove());
            this.container.appendChild(this.renderer.domElement);

            this.createSceneObjects();
            this.bindInteraction();
            this.resize();

            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.container);
            window.addEventListener('resize', () => this.resize());

            this.animate();
        } catch (error) {
            console.error('初始化3D云台视图失败:', error);
            this.container.classList.remove('is-3d');
        }
    }

    createSceneObjects() {
        const ambient = new THREE.HemisphereLight(0xcfefff, 0x14202a, 1.7);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
        keyLight.position.set(3, 4, 2);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x4facfe, 0.65);
        fillLight.position.set(-3, 2, -4);
        this.scene.add(fillLight);

        const groundMaterial = new THREE.MeshBasicMaterial({
            color: 0x1f5963,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide
        });
        const ground = new THREE.Mesh(new THREE.CircleGeometry(1.95, 96), groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);

        const ringMaterial = new THREE.LineBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.72 });
        [0.65, 1.3, 1.95].forEach(radius => {
            const ring = new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(this.circlePoints(radius, 128)),
                ringMaterial
            );
            ring.rotation.x = -Math.PI / 2;
            this.scene.add(ring);
        });

        const radialMaterial = new THREE.LineBasicMaterial({ color: 0x4facfe, transparent: true, opacity: 0.38 });
        for (let i = 0; i < 16; i += 1) {
            const angle = i * Math.PI / 8;
            const end = new THREE.Vector3(Math.sin(angle) * 1.95, 0.01, -Math.cos(angle) * 1.95);
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, 0), end]),
                radialMaterial
            );
            this.scene.add(line);
        }

        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x4ecdc4,
            metalness: 0.28,
            roughness: 0.36
        });
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x16222c,
            metalness: 0.2,
            roughness: 0.5
        });
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x4facfe,
            emissive: 0x0b2d4f,
            emissiveIntensity: 0.38,
            metalness: 0.18,
            roughness: 0.28
        });
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd166,
            emissive: 0x3b2600,
            emissiveIntensity: 0.22,
            metalness: 0.12,
            roughness: 0.32
        });

        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.18, 48), baseMaterial);
        base.position.y = 0.09;
        this.scene.add(base);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.55, 32), darkMaterial);
        mast.position.y = 0.36;
        this.scene.add(mast);

        this.pivot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), baseMaterial);
        this.pivot.position.y = 0.66;
        this.scene.add(this.pivot);

        this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1, 24), armMaterial);
        this.scene.add(this.arm);

        this.antennaHead = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 32), headMaterial);
        this.scene.add(this.antennaHead);

        this.targetDot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 12), headMaterial);
        this.scene.add(this.targetDot);

        this.groundProjection = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.78 })
        );
        this.scene.add(this.groundProjection);

        this.updateCamera();
        this.updateArm(0, 0);
    }

    circlePoints(radius, segments) {
        const points = [];
        for (let i = 0; i < segments; i += 1) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
        }
        return points;
    }

    bindInteraction() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('pointerdown', event => {
            canvas.setPointerCapture(event.pointerId);
            this.dragState = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                azimuth: this.cameraAzimuth,
                elevation: this.cameraElevation
            };
        });

        canvas.addEventListener('pointermove', event => {
            if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;

            const dx = event.clientX - this.dragState.x;
            const dy = event.clientY - this.dragState.y;
            this.cameraAzimuth = this.dragState.azimuth - dx * 0.35;
            this.cameraElevation = Math.max(12, Math.min(70, this.dragState.elevation + dy * 0.25));
            this.updateCamera();
        });

        canvas.addEventListener('pointerup', event => {
            if (this.dragState && this.dragState.pointerId === event.pointerId) {
                this.dragState = null;
            }
        });

        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this.cameraDistance = Math.max(3.1, Math.min(6.2, this.cameraDistance + event.deltaY * 0.0025));
            this.updateCamera();
        }, { passive: false });
    }

    resize() {
        if (!this.renderer || !this.camera || !this.container) return;

        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    setAngles(azimuth, elevation) {
        this.targetAzimuth = Number.isFinite(azimuth) ? azimuth : 0;
        this.targetElevation = Number.isFinite(elevation) ? Math.max(-30, Math.min(90, elevation)) : 0;
    }

    updateCamera() {
        if (!this.camera) return;

        const az = THREE.MathUtils.degToRad(this.cameraAzimuth);
        const el = THREE.MathUtils.degToRad(this.cameraElevation);
        const radius = this.cameraDistance * Math.cos(el);

        this.camera.position.set(
            Math.sin(az) * radius,
            0.55 + Math.sin(el) * this.cameraDistance,
            Math.cos(az) * radius
        );
        this.camera.lookAt(0, 0.45, 0);
    }

    animate() {
        if (!this.renderer || !this.scene || !this.camera) return;

        this.displayAzimuth = this.interpolateAngle(this.displayAzimuth, this.targetAzimuth, 0.16);
        this.displayElevation += (this.targetElevation - this.displayElevation) * 0.16;
        this.updateArm(this.displayAzimuth, this.displayElevation);

        this.renderer.render(this.scene, this.camera);
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    interpolateAngle(current, target, factor) {
        const delta = ((target - current + 540) % 360) - 180;
        return current + delta * factor;
    }

    updateArm(azimuth, elevation) {
        if (!this.arm || !this.antennaHead || !this.targetDot || !this.groundProjection) return;

        const pivot = new THREE.Vector3(0, 0.66, 0);
        const length = 1.55;
        const az = THREE.MathUtils.degToRad(azimuth);
        const el = THREE.MathUtils.degToRad(Math.max(-30, Math.min(90, elevation)));
        const horizontal = Math.cos(el) * length;
        const end = new THREE.Vector3(
            Math.sin(az) * horizontal,
            pivot.y + Math.sin(el) * length,
            -Math.cos(az) * horizontal
        );
        const direction = new THREE.Vector3().subVectors(end, pivot);
        const unitDirection = direction.clone().normalize();

        this.placeCylinder(this.arm, pivot, end);
        this.antennaHead.position.copy(end).add(unitDirection.clone().multiplyScalar(0.16));
        this.antennaHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDirection);
        this.targetDot.position.copy(end);

        const groundEnd = new THREE.Vector3(end.x, 0.035, end.z);
        this.groundProjection.geometry.dispose();
        this.groundProjection.geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0.035, 0),
            groundEnd
        ]);
    }

    placeCylinder(mesh, start, end) {
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();

        mesh.scale.set(1, length, 1);
        mesh.position.copy(midpoint);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    }
}
