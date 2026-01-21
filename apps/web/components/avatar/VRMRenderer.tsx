'use client';

import React, { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadMixamoAnimation } from './loadMixamoAnimation';

export interface VRMRendererProps {
  modelUrl: string;
  animationUrl?: string; // URL to Mixamo FBX animation file (idle/loop)
  motionUrl?: string; // URL to one-shot motion FBX file (plays once, returns to idle)
  expression?: string;
  mouthOpen?: number;
  lookAt?: { x: number; y: number };
  className?: string;
  backgroundColor?: string;
  enableControls?: boolean;
  autoRotate?: boolean;
  idleAnimation?: boolean;
  showGrid?: boolean;
  onMotionComplete?: () => void; // Called when one-shot motion finishes
}

export interface VRMRendererRef {
  resetCamera: () => void;
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

// Expressions that significantly open the mouth (need special handling for lip sync)
const mouthOpeningExpressions = new Set(['happy', 'surprised']);

const applyRelaxedPose = (vrm: VRM) => {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;

  const rotate = (boneName: VRMHumanBoneName, x: number, y: number, z: number) => {
    const bone =
      humanoid.getNormalizedBoneNode(boneName) ?? humanoid.getRawBoneNode(boneName);
    if (!bone) return;
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
  };

  // Subtle body posture - slight forward lean for natural stance
  rotate('spine', 0.02, 0, 0);
  rotate('upperChest', 0.03, 0, 0);
  rotate('neck', 0.05, 0, 0.02); // Slight head tilt for natural look

  // Relaxed shoulders - slightly lowered and forward
  rotate('leftShoulder', 0.05, 0, -0.05);
  rotate('rightShoulder', 0.05, 0, 0.05);

  // Arms hanging naturally at sides with slight asymmetry
  // Z rotation needs to be large (~1.0 rad) to bring arms down from T-pose
  rotate('leftUpperArm', 0.2, 0.1, -1.0);
  rotate('rightUpperArm', 0.15, -0.08, 1.05);

  // Slight elbow bend - arms not stiff
  rotate('leftLowerArm', 0.1, 0, -0.2);
  rotate('rightLowerArm', 0.08, 0, 0.15);

  // Relaxed wrists
  rotate('leftHand', 0.1, 0.05, -0.08);
  rotate('rightHand', 0.08, -0.03, 0.1);

  // Fingers slightly curled (if available)
  const fingerBones: VRMHumanBoneName[] = [
    'leftThumbProximal', 'leftThumbIntermediate', 'leftThumbDistal',
    'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
    'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
    'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
    'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
    'rightThumbProximal', 'rightThumbIntermediate', 'rightThumbDistal',
    'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
    'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
    'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
    'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
  ];

  fingerBones.forEach((boneName) => {
    if (boneName.includes('Thumb')) {
      rotate(boneName, 0.15, 0, 0);
    } else if (boneName.includes('Proximal')) {
      rotate(boneName, 0.25, 0, 0);
    } else if (boneName.includes('Intermediate')) {
      rotate(boneName, 0.2, 0, 0);
    } else if (boneName.includes('Distal')) {
      rotate(boneName, 0.15, 0, 0);
    }
  });
};

const VRMRenderer = forwardRef<VRMRendererRef, VRMRendererProps>(function VRMRenderer({
  modelUrl,
  animationUrl,
  motionUrl,
  expression = 'neutral',
  mouthOpen = 0,
  lookAt,
  className = '',
  backgroundColor = 'transparent',
  enableControls = false,
  autoRotate = false,
  idleAnimation = true,
  showGrid = false,
  onMotionComplete,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const animationFrameRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationLoadedRef = useRef<boolean>(false);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const motionActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationCacheRef = useRef<Map<string, THREE.AnimationClip>>(new Map());
  const currentMotionUrlRef = useRef<string | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track current prop values via refs for use in effects
  const enableControlsRef = useRef(enableControls);
  const autoRotateRef = useRef(autoRotate);

  // Keep refs in sync with props
  useEffect(() => {
    enableControlsRef.current = enableControls;
    autoRotateRef.current = autoRotate;

    // Update existing controls if they exist
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [enableControls, autoRotate]);

  // Expose resetCamera to parent via ref
  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, 1.4, 2.0);
        controlsRef.current.target.set(0, 1.3, 0);
        controlsRef.current.update();
      }
    },
  }));

  // Initialize Three.js scene (only depends on backgroundColor)
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Remove any existing canvas elements first
    const existingCanvases = container.querySelectorAll('canvas');
    existingCanvases.forEach((canvas) => canvas.remove());

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

    // Camera - positioned to see upper body/face
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 2.0);
    camera.lookAt(0, 1.3, 0); // Look at character's upper body
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: backgroundColor === 'transparent',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Ensure canvas receives pointer events
    renderer.domElement.style.pointerEvents = 'auto';
    renderer.domElement.style.touchAction = 'none';
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

    return { scene, camera, renderer };
  }, [backgroundColor]);

  // Load VRM model
  const loadVRM = useCallback(async (url: string, scene: THREE.Scene, animUrl?: string) => {
    setLoading(true);
    setError(null);
    animationLoadedRef.current = false;

    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM;

      if (!vrm) {
        throw new Error('Failed to load VRM from file');
      }

      // VRM models face -Z by default, camera is at +Z, so no rotation needed
      scene.add(vrm.scene);
      vrmRef.current = vrm;

      // Create animation mixer
      const mixer = new THREE.AnimationMixer(vrm.scene);
      mixerRef.current = mixer;

      // Load Mixamo animation if URL is provided
      if (animUrl) {
        try {
          const clip = await loadMixamoAnimation(animUrl, vrm);
          animationCacheRef.current.set(animUrl, clip);
          const action = mixer.clipAction(clip);
          action.play();
          idleActionRef.current = action;
          animationLoadedRef.current = true;
        } catch (animErr) {
          console.warn('Failed to load animation, falling back to static pose:', animErr);
          // Fall back to static pose if animation fails
          applyRelaxedPose(vrm);
        }
      } else {
        // Apply static relaxed pose if no animation
        applyRelaxedPose(vrm);
      }

      // Reset all expressions to ensure clean state
      if (vrm.expressionManager) {
        Object.values(expressionMap).forEach((preset) => {
          vrm.expressionManager!.setValue(preset, 0);
        });
        Object.values(visemeMap).forEach((viseme) => {
          vrm.expressionManager!.setValue(viseme, 0);
        });
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

    // Update animation mixer if present
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    if (vrmRef.current) {
      // Update VRM
      vrmRef.current.update(delta);

      // Idle animation (subtle breathing/movement) - only if no Mixamo animation
      if (idleAnimation && !animationLoadedRef.current) {
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

  // Handle expression and mouth changes together
  useEffect(() => {
    if (!vrmRef.current?.expressionManager) return;

    const manager = vrmRef.current.expressionManager;
    const mouthValue = Math.min(1, Math.max(0, mouthOpen ?? 0));

    // Step 1: Reset ALL expressions (both preset expressions and visemes)
    Object.values(expressionMap).forEach((preset) => {
      manager.setValue(preset, 0);
    });
    Object.values(visemeMap).forEach((viseme) => {
      manager.setValue(viseme, 0);
    });

    // Step 2: Set expression (keep steady so eyes don't pulse with lip sync)
    const mappedExpression = expressionMap[expression] || 'neutral';
    if (mappedExpression !== 'neutral') {
      const isMouthOpening = mouthOpeningExpressions.has(mappedExpression);
      const intensity = isMouthOpening ? 0.2 : 1.0;
      manager.setValue(mappedExpression, intensity);
    }

    // Step 3: Apply lip sync value
    manager.setValue('aa', mouthValue);
  }, [expression, mouthOpen]);

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

  // Handle one-shot motion playback
  useEffect(() => {
    // Skip if no motion URL or same as current
    if (!motionUrl || motionUrl === currentMotionUrlRef.current) return;
    if (!vrmRef.current || !mixerRef.current) return;

    currentMotionUrlRef.current = motionUrl;
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;

    const playMotion = async () => {
      try {
        // Check cache first
        let clip = animationCacheRef.current.get(motionUrl);
        if (!clip) {
          clip = await loadMixamoAnimation(motionUrl, vrm);
          animationCacheRef.current.set(motionUrl, clip);
        }

        // Stop current motion if playing
        if (motionActionRef.current) {
          motionActionRef.current.stop();
          motionActionRef.current = null;
        }

        // Fade out idle animation if present
        if (idleActionRef.current) {
          idleActionRef.current.fadeOut(0.2);
        }

        // Create and play the one-shot motion
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset();
        action.fadeIn(0.2);
        action.play();
        motionActionRef.current = action;

        // Listen for motion completion
        const onFinished = (e: { action: THREE.AnimationAction }) => {
          if (e.action === action) {
            mixer.removeEventListener('finished', onFinished);
            motionActionRef.current = null;
            currentMotionUrlRef.current = undefined;

            // Fade back to idle animation
            if (idleActionRef.current) {
              idleActionRef.current.reset();
              idleActionRef.current.fadeIn(0.3);
              idleActionRef.current.play();
            } else if (!animationLoadedRef.current) {
              // Reapply relaxed pose if no idle animation
              applyRelaxedPose(vrm);
            }

            // Notify parent
            onMotionComplete?.();
          }
        };
        mixer.addEventListener('finished', onFinished);
      } catch (err) {
        console.error('Failed to load motion:', err);
        currentMotionUrlRef.current = undefined;
        onMotionComplete?.();
      }
    };

    playMotion();
  }, [motionUrl, onMotionComplete]);

  // Handle grid toggle - runs when showGrid changes, checks if scene exists
  useEffect(() => {
    if (!sceneRef.current) return;

    if (showGrid) {
      if (!gridRef.current) {
        const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
        sceneRef.current.add(gridHelper);
        gridRef.current = gridHelper;
      }
    } else if (gridRef.current) {
      sceneRef.current.remove(gridRef.current);
      gridRef.current.dispose();
      gridRef.current = null;
    }
  }, [showGrid]);

  // Initialize scene and load model
  useEffect(() => {
    const result = initScene();
    if (!result) return;

    const { scene, camera, renderer } = result;
    loadVRM(modelUrl, scene, animationUrl);

    // Start animation loop
    animate();

    // Create controls directly if enabled (using ref to avoid dependency)
    if (enableControlsRef.current && camera && renderer) {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.3, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 1;
      controls.maxDistance = 10;
      controls.maxPolarAngle = Math.PI * 0.9;
      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.0;
      controls.update();
      controlsRef.current = controls;
    }

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

      // Dispose controls first (before renderer)
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      // Stop and dispose animation mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }

      // Clear animation refs
      idleActionRef.current = null;
      motionActionRef.current = null;
      currentMotionUrlRef.current = undefined;
      animationLoadedRef.current = false;

      // Remove renderer from DOM and dispose
      if (rendererRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (e) {
          // DOM element might already be removed
        }
        rendererRef.current.dispose();
        rendererRef.current = null;
      }

      // Dispose VRM resources
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
        vrmRef.current = null;
      }

      // Clear remaining refs
      sceneRef.current = null;
      cameraRef.current = null;
      if (gridRef.current) {
        gridRef.current.dispose();
        gridRef.current = null;
      }
    };
  }, [modelUrl, animationUrl, initScene, loadVRM, animate]);

  // Stop propagation to prevent parent components (like ReactFlow) from capturing events
  const stopEvent = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`vrm-renderer relative ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '300px', pointerEvents: 'auto' }}
      onMouseDown={stopEvent}
      onMouseMove={stopEvent}
      onMouseUp={stopEvent}
      onPointerDown={stopEvent}
      onPointerMove={stopEvent}
      onPointerUp={stopEvent}
      onWheel={stopEvent}
      onTouchStart={stopEvent}
      onTouchMove={stopEvent}
      onTouchEnd={stopEvent}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="text-white text-sm">Loading VRM...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 pointer-events-none">
          <div className="text-white text-sm text-center p-4">
            <div className="text-red-300 mb-2">Error loading model</div>
            <div className="text-xs text-white/70">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default VRMRenderer;
