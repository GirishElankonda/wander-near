import { Renderer, Camera, Transform, Geometry, Program, Mesh } from 'ogl';

class GalaxyBackground {
    constructor() {
        this.canvas = null;
        this.renderer = null;
        this.gl = null;
        this.camera = null;
        this.scene = null;
        this.particles = null;
        this.time = 0;

        this.init();
    }

    init() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'galaxy-background';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';
        document.body.insertBefore(this.canvas, document.body.firstChild);

        // Setup WebGL
        this.renderer = new Renderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });
        this.gl = this.renderer.gl;
        this.gl.clearColor(0.02, 0.02, 0.08, 1);

        this.camera = new Camera(this.gl, { fov: 45 });
        this.camera.position.set(0, 0, 5);

        this.scene = new Transform();

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.createParticles();
        this.update();
    }

    createParticles() {
        const numParticles = 2000;
        const positions = new Float32Array(numParticles * 3);
        const colors = new Float32Array(numParticles * 3);
        const sizes = new Float32Array(numParticles);
        const velocities = new Float32Array(numParticles * 3);

        for (let i = 0; i < numParticles; i++) {
            const i3 = i * 3;

            // Spiral galaxy distribution
            const radius = Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            const height = (Math.random() - 0.5) * 2;

            positions[i3 + 0] = Math.cos(angle) * radius;
            positions[i3 + 1] = height;
            positions[i3 + 2] = Math.sin(angle) * radius;

            // Color gradient from blue to purple to pink
            const t = Math.random();
            if (t < 0.33) {
                colors[i3 + 0] = 0.2 + Math.random() * 0.3; // R
                colors[i3 + 1] = 0.4 + Math.random() * 0.3; // G
                colors[i3 + 2] = 0.8 + Math.random() * 0.2; // B - Blue
            } else if (t < 0.66) {
                colors[i3 + 0] = 0.5 + Math.random() * 0.3; // Purple
                colors[i3 + 1] = 0.2 + Math.random() * 0.3;
                colors[i3 + 2] = 0.8 + Math.random() * 0.2;
            } else {
                colors[i3 + 0] = 0.8 + Math.random() * 0.2; // Pink
                colors[i3 + 1] = 0.3 + Math.random() * 0.2;
                colors[i3 + 2] = 0.5 + Math.random() * 0.3;
            }

            sizes[i] = Math.random() * 4 + 2;

            // Random velocities for floating effect
            velocities[i3 + 0] = (Math.random() - 0.5) * 0.02;
            velocities[i3 + 1] = (Math.random() - 0.5) * 0.02;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
        }

        const geometry = new Geometry(this.gl, {
            position: { size: 3, data: positions },
            color: { size: 3, data: colors },
            size: { size: 1, data: sizes },
            velocity: { size: 3, data: velocities }
        });

        const program = new Program(this.gl, {
            vertex: `
                attribute vec3 position;
                attribute vec3 color;
                attribute float size;
                attribute vec3 velocity;
                
                uniform mat4 modelViewMatrix;
                uniform mat4 projectionMatrix;
                uniform float uTime;
                
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    vColor = color;
                    
                    // Animate particles
                    vec3 pos = position;
                    pos.x += sin(uTime * 0.5 + position.y * 2.0) * 0.3;
                    pos.y += cos(uTime * 0.3 + position.x * 2.0) * 0.2;
                    pos.z += sin(uTime * 0.4 + position.x + position.y) * 0.2;
                    
                    // Add velocity
                    pos += velocity * uTime * 0.5;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Size attenuation
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    
                    // Fade based on distance
                    vAlpha = 1.0 - (length(mvPosition.xyz) / 10.0);
                    vAlpha = clamp(vAlpha, 0.3, 1.0);
                }
            `,
            fragment: `
                precision highp float;
                
                varying vec3 vColor;
                varying float vAlpha;
                
                void main() {
                    // Circular particle shape
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    if (dist > 0.5) {
                        discard;
                    }
                    
                    // Soft glow
                    float alpha = (1.0 - dist * 2.0) * vAlpha;
                    alpha = pow(alpha, 2.0);
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            uniforms: {
                uTime: { value: 0 }
            },
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.particles = new Mesh(this.gl, {
            geometry,
            program,
            mode: this.gl.POINTS
        });
        this.particles.setParent(this.scene);
    }

    resize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.camera.perspective({
            aspect: window.innerWidth / window.innerHeight
        });
    }

    update(t) {
        requestAnimationFrame((t) => this.update(t));

        this.time = t * 0.001; // Convert to seconds

        // Rotate scene slowly
        this.scene.rotation.y = this.time * 0.05;
        this.scene.rotation.x = Math.sin(this.time * 0.02) * 0.2;

        // Update particle shader time
        if (this.particles) {
            this.particles.program.uniforms.uTime.value = this.time;
        }

        this.renderer.render({
            scene: this.scene,
            camera: this.camera
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new GalaxyBackground();
    });
} else {
    new GalaxyBackground();
}
