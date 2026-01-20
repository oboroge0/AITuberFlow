/**
 * Load and retarget Mixamo FBX animation to VRM
 * Based on pixiv/three-vrm examples
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Mapping from Mixamo bone names to VRM humanoid bone names
 */
const mixamoVRMRigMap: Record<string, VRMHumanBoneName> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

/**
 * Load Mixamo FBX animation and convert it for VRM
 * @param url URL to the FBX animation file
 * @param vrm The VRM model to retarget the animation to
 * @returns Promise resolving to an AnimationClip
 */
export async function loadMixamoAnimation(
  url: string,
  vrm: VRM
): Promise<THREE.AnimationClip> {
  const loader = new FBXLoader();
  const asset = await loader.loadAsync(url);

  // Find the animation clip (Mixamo names it 'mixamo.com')
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
  if (!clip) {
    throw new Error('Animation clip not found in FBX file');
  }

  const tracks: THREE.KeyframeTrack[] = [];

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();
  const _vec3 = new THREE.Vector3();

  // Get hip height for scaling
  const mixamoHips = asset.getObjectByName('mixamorigHips');
  if (!mixamoHips) {
    throw new Error('Mixamo hips bone not found');
  }
  const motionHipsHeight = mixamoHips.position.y;

  const vrmHipsNode = vrm.humanoid.getNormalizedBoneNode('hips');
  const vrmHipsY = vrmHipsNode ? vrmHipsNode.getWorldPosition(new THREE.Vector3()).y : 1;
  const vrmHipsHeight = vrm.humanoid.normalizedRestPose?.hips?.position?.[1] ?? vrmHipsY;
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    // Extract bone name and property from track name
    const trackSplitted = track.name.split('.');
    const mixamoBoneName = trackSplitted[0];
    const propertyName = trackSplitted[1];

    // Get VRM bone name from mapping
    const vrmBoneName = mixamoVRMRigMap[mixamoBoneName];
    if (!vrmBoneName) {
      return; // Skip unmapped bones
    }

    const vrmBoneNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
    const vrmBoneNodeName = vrmBoneNode?.name;

    if (!vrmBoneNodeName) {
      return;
    }

    const mixamoBoneNode = asset.getObjectByName(mixamoBoneName);
    if (!mixamoBoneNode) {
      return;
    }

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // Store rotations
      mixamoBoneNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoBoneNode.parent?.getWorldQuaternion(parentRestWorldRotation);

      // Convert rotations for VRM
      const values = track.values.map((v, i) => {
        // Reconstruct quaternion from track values
        if (i % 4 === 0) {
          _quatA.set(
            track.values[i],
            track.values[i + 1],
            track.values[i + 2],
            track.values[i + 3]
          );

          // Apply retargeting: parentRestWorldRotation * trackRotation * restRotationInverse
          _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);

          return _quatA.x;
        } else if (i % 4 === 1) {
          return _quatA.y;
        } else if (i % 4 === 2) {
          return _quatA.z;
        } else {
          return _quatA.w;
        }
      });

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmBoneNodeName}.quaternion`,
          track.times,
          values
        )
      );
    } else if (
      track instanceof THREE.VectorKeyframeTrack &&
      propertyName === 'position' &&
      vrmBoneName === 'hips'
    ) {
      // Handle hips position track
      const values = track.values.map((v, i) => {
        // Scale the position and flip coordinates for VRM
        const component = i % 3;
        if (component === 0) {
          return v * hipsPositionScale; // X
        } else if (component === 1) {
          return v * hipsPositionScale; // Y
        } else {
          return v * hipsPositionScale; // Z
        }
      });

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmBoneNodeName}.position`,
          track.times,
          values
        )
      );
    }
  });

  return new THREE.AnimationClip('vrmAnimation', clip.duration, tracks);
}
