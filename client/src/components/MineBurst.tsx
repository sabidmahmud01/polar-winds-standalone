import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type MineBurstProps = {
  color: string;
  position: [number, number, number];
  timestamp: number;
  onComplete: () => void;
};

type Spark = {
  angle: number;
  distance: number;
  size: number;
  delay: number;
};

export function MineBurst({ color, position, timestamp, onComplete }: MineBurstProps) {
  const rootRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const sparkRefs = useRef<Array<THREE.Mesh | null>>([]);
  const hasCompleted = useRef(false);
  const duration = 1200;

  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: 22 }, (_, index) => {
        const angle = (index / 22) * Math.PI * 2 + (index % 2) * 0.08;
        return {
          angle,
          distance: 1.25 + (index % 5) * 0.18,
          size: 0.12 + (index % 4) * 0.025,
          delay: (index % 3) * 0.035,
        };
      }),
    []
  );

  useFrame(() => {
    if (!rootRef.current || hasCompleted.current) return;

    const elapsed = Date.now() - timestamp;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      hasCompleted.current = true;
      onComplete();
      return;
    }

    const blast = 1 - Math.pow(1 - progress, 4);
    rootRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.08);

    if (flashRef.current) {
      const flashScale = THREE.MathUtils.lerp(1.35, 0.15, progress);
      flashRef.current.scale.set(flashScale, flashScale, flashScale);
      if (flashRef.current.material instanceof THREE.Material) {
        flashRef.current.material.opacity = THREE.MathUtils.lerp(0.9, 0, progress);
      }
    }

    ringRefs.current.forEach((ring, index) => {
      if (!ring) return;

      const delay = index * 0.11;
      const ringProgress = THREE.MathUtils.clamp((progress - delay) / (1 - delay), 0, 1);
      const ringBlast = 1 - Math.pow(1 - ringProgress, 3);
      const scale = THREE.MathUtils.lerp(0.35 + index * 0.2, 2.7 + index * 0.65, ringBlast);
      ring.scale.set(scale, scale, 1);

      if (ring.material instanceof THREE.Material) {
        ring.material.opacity = THREE.MathUtils.lerp(0.85 - index * 0.18, 0, ringProgress);
      }
    });

    sparkRefs.current.forEach((spark, index) => {
      if (!spark) return;

      const spec = sparks[index];
      const sparkProgress = THREE.MathUtils.clamp((progress - spec.delay) / (1 - spec.delay), 0, 1);
      const sparkBlast = 1 - Math.pow(1 - sparkProgress, 3);
      const distance = THREE.MathUtils.lerp(0.08, spec.distance, sparkBlast);
      const lift = Math.sin(sparkProgress * Math.PI) * 0.2;

      spark.position.set(
        Math.cos(spec.angle) * distance,
        Math.sin(spec.angle) * distance,
        0.08 + lift
      );
      spark.rotation.z = spec.angle + progress * 9;
      spark.scale.setScalar(THREE.MathUtils.lerp(1.25, 0.18, sparkProgress));

      if (spark.material instanceof THREE.Material) {
        spark.material.opacity = THREE.MathUtils.lerp(0.95, 0, sparkProgress);
      }
    });

    rootRef.current.rotation.z = blast * 0.18;
  });

  return (
    <group ref={rootRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={flashRef} position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.34, 18, 18]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>

      {[0, 1, 2].map((ring) => (
        <mesh
          key={ring}
          ref={(mesh) => {
            ringRefs.current[ring] = mesh;
          }}
          position={[0, 0, 0.04 + ring * 0.015]}
        >
          <ringGeometry args={[0.48 + ring * 0.08, 0.62 + ring * 0.09, 64]} />
          <meshBasicMaterial color={ring === 0 ? "#ffffff" : color} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {sparks.map((spark, index) => (
        <mesh
          key={`${spark.angle}-${index}`}
          ref={(mesh) => {
            sparkRefs.current[index] = mesh;
          }}
          position={[Math.cos(spark.angle) * 0.08, Math.sin(spark.angle) * 0.08, 0.08]}
          rotation={[0, 0, spark.angle]}
        >
          <boxGeometry args={[spark.size * 1.9, spark.size * 0.45, 0.05]} />
          <meshBasicMaterial color={index % 4 === 0 ? "#ffffff" : color} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}
