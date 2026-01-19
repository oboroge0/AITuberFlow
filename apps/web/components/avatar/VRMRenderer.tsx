'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface VRMRendererProps {
  modelUrl: string;
  expression?: string;
  mouthOpen?: number;
  lookAt?: { x: number; y: number };
  className?: string;
  backgroundColor?: string;
  enableControls?: boolean;
  autoRotate?: boolean;
  idleAnimation?: boolean;
}

// Map custom expression names to VRM preset names
const expressionMap: Record<string, VRMExpressionPresetName> = {
  happy: 'happy',
  angry: 'angry',
  sad: 'sad',
  relaxed: 'relaxed',
  surprised: 'surprised',
  neutral: 'neutral',
};

// Viseme mappings for lip sync
const visemeMap: Record<string, VRMExpressionPresetName> = {
  aa: 'aa',
  ih: 'ih',
  ou: 'ou',
  ee: 'ee',
  oh: 'oh',
};

export default function VRMRenderer({
  modelUrl,
  expression = 'neutral',
  mouthOpen = 0,
  lookAt,
  className = '',
  backgroundColor = 'transparent',
  enableControls = false,
  autoRotate = false,
  idleAnimation = true,
}: VRMRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const animationFrameRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    if (backgroundColor === 'transparent') {
      scene.background = null;
    } else {
      scene.background = new THREE.Color(backgroundColor);
    }
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    camera.position.set(0, 1.3, 2.5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: backgroundColor === 'transparent',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-1, 1, -1);
    scene.add(backLight);

    // Controls (optional)
    if (enableControls) {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(0, 1, 0);
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 1;
      controls.update();
      controlsRef.current = controls;
    }

    return { scene, camera, renderer };
  }, [backgroundColor, enableControls, autoRotate]);

  // Load VRM model
  const loadVRM = useCallback(async (url: string, scene: THREE.Scene) => {
    setLoading(true);
    setError(null);

    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM;

      if (!vrm) {
        throw new Error('Failed to load VRM from file');
      }

      // Rotate model to face camera
      vrm.scene.rotation.y = Math.PI;
      scene.add(vrm.scene);
      vrmRef.current = vrm;

      // Initial expression
      if (vrm.expressionManager) {
        vrm.expressionManager.setValue('neutral', 1);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading VRM:', err);
      setError(err instanceof Error ? err.message : 'Failed to load VRM');
      setLoading(false);
    }
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    animationFrameRef.current = requestAnimationFrame(animate);

    const delta = clockRef.current.getDelta();
    const elapsed = clockRef.current.getElapsedTime();

    if (vrmRef.current) {
      // Update VRM
      vrmRef.current.update(delta);

      // Idle animation (subtle breathing/movement)
      if (idleAnimation) {
        const breathe = Math.sin(elapsed * 1.5) * 0.005;
        vrmRef.current.scene.position.y = breathe;
      }
    }

    if (controlsRef.current) {
      controlsRef.current.update();
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [idleAnimation]);

  // Handle expression changes
  useEffect(() => {
    if (!vrmRef.current?.expressionManager) return;

    const manager = vrmRef.current.expressionManager;

    // Reset all expressions
    Object.values(expressionMap).forEach((preset) => {
      manager.setValue(preset, 0);
    });

    // Set new expression
    const mappedExpression = expressionMap[expression] || 'neutral';
    manager.setValue(mappedExpression, 1);
  }, [expression]);

  // Handle mouth/lip sync changes
  useEffect(() => {
    if (!vrmRef.current?.expressionManager) return;

    const manager = vrmRef.current.expressionManager;

    // Use 'aa' for simple mouth open/close
    manager.setValue('aa', Math.min(1, Math.max(0, mouthOpen)));
  }, [mouthOpen]);

  // Handle look at target
  useEffect(() => {
    if (!vrmRef.current?.lookAt || !lookAt || !sceneRef.current) return;

    // Create a target object for the VRM to look at
    let targetObject = sceneRef.current.getObjectByName('lookAtTarget');
    if (!targetObject) {
      targetObject = new THREE.Object3D();
      targetObject.name = 'lookAtTarget';
      sceneRef.current.add(targetObject);
    }

    // Set the target position
    targetObject.position.set(lookAt.x, 1.3 + lookAt.y * 0.3, 2);
    vrmRef.current.lookAt.target = targetObject;
  }, [lookAt]);

  // Initialize scene and load model
  useEffect(() => {
    const result = initScene();
    if (!result) return;

    const { scene } = result;
    loadVRM(modelUrl, scene);

    // Start animation loop
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);

      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }

      if (vrmRef.current) {
        vrmRef.current.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }

      controlsRef.current?.dispose();
    };
  }, [modelUrl, initScene, loadVRM, animate]);

  return (
    <div
      ref={containerRef}
      className={`vrm-renderer relative ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white text-sm">Loading VRM...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
          <div className="text-white text-sm text-center p-4">
            <div className="text-red-300 mb-2">Error loading model</div>
            <div className="text-xs text-white/70">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}
