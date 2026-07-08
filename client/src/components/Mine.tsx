import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type MineProps = {
  color: string;
  triggered?: boolean;
};

type Edge = {
  x: number;
  y: number;
  length: number;
  rotation: number;
};

function makeEdge(start: [number, number], end: [number, number]): Edge {
  const x = (start[0] + end[0]) / 2;
  const y = (start[1] + end[1]) / 2;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  return {
    x,
    y,
    length: Math.sqrt(dx * dx + dy * dy),
    rotation: Math.atan2(dy, dx) - Math.PI / 2,
  };
}

export function Mine({ color, triggered = false }: MineProps) {
  const groupRef = useRef<THREE.Group>(null);
  const opacity = triggered ? 0.35 : 0.95;
  const glow = triggered ? 0.12 : 0.55;

  const tickAngles = useMemo(
    () => Array.from({ length: 6 }, (_, index) => (index / 6) * Math.PI * 2),
    []
  );

  const triangleEdges = useMemo(
    () => [
      makeEdge([0, 0.3], [-0.3, -0.24]),
      makeEdge([-0.3, -0.24], [0.3, -0.24]),
      makeEdge([0.3, -0.24], [0, 0.3]),
    ],
    []
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.25;
  });

  return (
    <group ref={groupRef} scale={triggered ? 0.85 : 1}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.48, 0.045, 12, 64]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={glow}
            roughness={0.25}
            metalness={0.25}
            transparent
            opacity={opacity}
          />
        </mesh>

        {tickAngles.map((angle) => (
          <mesh
            key={angle}
            position={[Math.cos(angle) * 0.68, Math.sin(angle) * 0.68, 0]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.26, 0.07, 0.035]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={glow}
              roughness={0.25}
              metalness={0.2}
              transparent
              opacity={opacity}
            />
          </mesh>
        ))}

        {triangleEdges.map((edge, index) => (
          <mesh
            key={index}
            position={[edge.x, edge.y, 0.04]}
            rotation={[0, 0, edge.rotation]}
          >
            <cylinderGeometry args={[0.025, 0.025, edge.length, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={glow}
              roughness={0.2}
              metalness={0.15}
              transparent
              opacity={opacity}
            />
          </mesh>
        ))}

        <mesh position={[0, 0.02, 0.06]}>
          <cylinderGeometry args={[0.025, 0.025, 0.24, 10]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={glow}
            roughness={0.2}
            metalness={0.15}
            transparent
            opacity={opacity}
          />
        </mesh>

        <mesh position={[0, -0.17, 0.06]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={glow}
            roughness={0.2}
            metalness={0.15}
            transparent
            opacity={opacity}
          />
        </mesh>
      </group>
    </group>
  );
}
