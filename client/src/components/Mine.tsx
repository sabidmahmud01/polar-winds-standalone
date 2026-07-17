import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getPlayerHex } from "@/constants/playerColors";

type MineColor = "RED" | "GREEN" | "BLUE" | "NEUTRAL";
export type MineType = "square" | "horizontal" | "vertical";

type MineProps = {
  position?: [number, number, number];
  color?: MineColor;
  type?: MineType;
  triggered?: boolean;
};

type MineExplosionProps = {
  position?: [number, number, number];
  type?: MineType;
};

const TYPE_ACCENTS: Record<MineType, string> = {
  square: "#38bdf8",
  horizontal: "#f97316",
  vertical: "#facc15",
};

function AnchorFeet({ bodyMaterial }: { bodyMaterial: THREE.Material }) {
  return (
    <>
      {[Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 0.52, -0.04, Math.sin(angle) * 0.52]}
          rotation={[0, angle, 0]}
          material={bodyMaterial}
        >
          <boxGeometry args={[0.28, 0.08, 0.13]} />
        </mesh>
      ))}
    </>
  );
}

function HorizontalMineBody({ bodyMaterial, rimMaterial, warningMaterial }: {
  bodyMaterial: THREE.Material;
  rimMaterial: THREE.Material;
  warningMaterial: THREE.Material;
}) {
  return (
    <>
      {/* Central mine charge. This keeps the directional mine from reading as just a line. */}
      <mesh position={[0, 0, 0]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.48, 0.62, 0.22, 6]} />
      </mesh>
      <mesh position={[0, 0.13, 0]} material={rimMaterial}>
        <cylinderGeometry args={[0.36, 0.44, 0.08, 6]} />
      </mesh>
      <AnchorFeet bodyMaterial={bodyMaterial} />

      {/* Left/right blast barrels. The mine still has a clear horizontal direction, but the body is a mine casing. */}
      <mesh position={[-0.72, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 0.62, 8]} />
      </mesh>
      <mesh position={[0.72, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 0.62, 8]} />
      </mesh>

      {/* Heavy end caps make the barrels look like emitters instead of thin decorative lines. */}
      <mesh position={[-1.1, 0.04, 0]} material={bodyMaterial} castShadow>
        <boxGeometry args={[0.24, 0.25, 0.5]} />
      </mesh>
      <mesh position={[1.1, 0.04, 0]} material={bodyMaterial} castShadow>
        <boxGeometry args={[0.24, 0.25, 0.5]} />
      </mesh>

      {/* Horizontal warning glyph sits on top of the mine, not as the whole silhouette. */}
      <mesh position={[0, 0.23, 0]} material={warningMaterial}>
        <boxGeometry args={[0.78, 0.055, 0.09]} />
      </mesh>
      <mesh position={[-0.96, 0.22, 0]} rotation={[0, 0, Math.PI / 4]} material={warningMaterial}>
        <boxGeometry args={[0.2, 0.055, 0.2]} />
      </mesh>
      <mesh position={[0.96, 0.22, 0]} rotation={[0, 0, Math.PI / 4]} material={warningMaterial}>
        <boxGeometry args={[0.2, 0.055, 0.2]} />
      </mesh>

      {/* Small side rails reinforce left/right, but the chunky casing remains the dominant shape. */}
      <mesh position={[0, 0.16, -0.27]} material={rimMaterial}>
        <boxGeometry args={[1.18, 0.055, 0.06]} />
      </mesh>
      <mesh position={[0, 0.16, 0.27]} material={rimMaterial}>
        <boxGeometry args={[1.18, 0.055, 0.06]} />
      </mesh>
    </>
  );
}

function VerticalMineBody({ bodyMaterial, rimMaterial, warningMaterial }: {
  bodyMaterial: THREE.Material;
  rimMaterial: THREE.Material;
  warningMaterial: THREE.Material;
}) {
  return (
    <>
      {/* Central mine charge. Same mine family as horizontal, but aimed up/down on the board. */}
      <mesh position={[0, 0, 0]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.48, 0.62, 0.22, 6]} />
      </mesh>
      <mesh position={[0, 0.13, 0]} material={rimMaterial}>
        <cylinderGeometry args={[0.36, 0.44, 0.08, 6]} />
      </mesh>
      <AnchorFeet bodyMaterial={bodyMaterial} />

      {/* Up/down blast barrels. These are fixed in world direction and no longer spin. */}
      <mesh position={[0, 0.03, -0.72]} rotation={[Math.PI / 2, 0, 0]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 0.62, 8]} />
      </mesh>
      <mesh position={[0, 0.03, 0.72]} rotation={[Math.PI / 2, 0, 0]} material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 0.62, 8]} />
      </mesh>

      {/* Heavy end caps make the vertical mine read as a planted directional charge, not a glowing line. */}
      <mesh position={[0, 0.04, -1.1]} material={bodyMaterial} castShadow>
        <boxGeometry args={[0.5, 0.25, 0.24]} />
      </mesh>
      <mesh position={[0, 0.04, 1.1]} material={bodyMaterial} castShadow>
        <boxGeometry args={[0.5, 0.25, 0.24]} />
      </mesh>

      {/* Vertical warning glyph sits on top of the mine, not as the whole silhouette. */}
      <mesh position={[0, 0.23, 0]} material={warningMaterial}>
        <boxGeometry args={[0.09, 0.055, 0.78]} />
      </mesh>
      <mesh position={[0, 0.22, -0.96]} rotation={[0, Math.PI / 4, 0]} material={warningMaterial}>
        <boxGeometry args={[0.2, 0.055, 0.2]} />
      </mesh>
      <mesh position={[0, 0.22, 0.96]} rotation={[0, Math.PI / 4, 0]} material={warningMaterial}>
        <boxGeometry args={[0.2, 0.055, 0.2]} />
      </mesh>

      {/* Small side rails reinforce up/down, but the chunky casing remains the dominant shape. */}
      <mesh position={[-0.27, 0.16, 0]} material={rimMaterial}>
        <boxGeometry args={[0.06, 0.055, 1.18]} />
      </mesh>
      <mesh position={[0.27, 0.16, 0]} material={rimMaterial}>
        <boxGeometry args={[0.06, 0.055, 1.18]} />
      </mesh>
    </>
  );
}

function SquareMineBody({ bodyMaterial, rimMaterial, warningMaterial }: {
  bodyMaterial: THREE.Material;
  rimMaterial: THREE.Material;
  warningMaterial: THREE.Material;
}) {
  return (
    <>
      <mesh material={bodyMaterial} castShadow>
        <cylinderGeometry args={[0.58, 0.72, 0.18, 6]} />
      </mesh>

      <mesh position={[0, 0.11, 0]} material={rimMaterial}>
        <cylinderGeometry args={[0.47, 0.52, 0.08, 6]} />
      </mesh>

      {[Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 0.42, 0.16, Math.sin(angle) * 0.42]}
          rotation={[0, angle, 0]}
          material={warningMaterial}
        >
          <boxGeometry args={[0.22, 0.07, 0.22]} />
        </mesh>
      ))}
    </>
  );
}

export function Mine({ position = [0, 0, 0], color = "NEUTRAL", type = "square", triggered = false }: MineProps) {
  const groupRef = useRef<THREE.Group>(null);
  const colorAccent = color === "NEUTRAL" ? "#ef4444" : getPlayerHex(color);
  const typeAccent = TYPE_ACCENTS[type];
  const warningColor = color === "NEUTRAL" ? typeAccent : colorAccent;
  const opacity = triggered ? 0.35 : 1;
  const glowScale = triggered ? 0.25 : 1;

  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#08111f",
    metalness: 0.62,
    roughness: 0.28,
    emissive: "#0f172a",
    emissiveIntensity: 0.25 * glowScale,
    transparent: true,
    opacity,
  }), [glowScale, opacity]);

  const rimMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#172554",
    metalness: 0.45,
    roughness: 0.35,
    emissive: warningColor,
    emissiveIntensity: (color === "GREEN" ? 0.32 : 0.45) * glowScale,
    transparent: true,
    opacity,
  }), [warningColor, color, glowScale, opacity]);

  const warningMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: warningColor,
    emissive: warningColor,
    emissiveIntensity: (color === "GREEN" ? 0.65 : 1.0) * glowScale,
    transparent: true,
    opacity,
  }), [warningColor, color, glowScale, opacity]);

  useFrame((state) => {
    if (!groupRef.current) return;

    // Do not spin mines. Directional mines need to stay fixed so players can read the blast direction.
    groupRef.current.rotation.y = 0;
    groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2.0) * 0.055;
  });

  return (
    <group ref={groupRef} position={position}>
      {type === "horizontal" ? (
        <HorizontalMineBody bodyMaterial={bodyMaterial} rimMaterial={rimMaterial} warningMaterial={warningMaterial} />
      ) : type === "vertical" ? (
        <VerticalMineBody bodyMaterial={bodyMaterial} rimMaterial={rimMaterial} warningMaterial={warningMaterial} />
      ) : (
        <SquareMineBody bodyMaterial={bodyMaterial} rimMaterial={rimMaterial} warningMaterial={warningMaterial} />
      )}

      {/* Center charge. */}
      <mesh position={[0, 0.28, 0]} material={warningMaterial}>
        <sphereGeometry args={[0.13, 16, 16]} />
      </mesh>
    </group>
  );
}

export function MineExplosion({ position = [0, 0, 0], type = "square" }: MineExplosionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef<number | null>(null);
  const explosionColor = TYPE_ACCENTS[type];

  const burstMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: explosionColor,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [explosionColor]);

  const hotCoreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    if (startTime.current === null) startTime.current = state.clock.elapsedTime;

    const age = state.clock.elapsedTime - startTime.current;
    const progress = Math.min(age / 0.62, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const maxScale = type === "square" ? 2.6 : 3.45;
    const scale = 0.55 + easeOut * maxScale;

    groupRef.current.scale.set(scale, scale, scale);
    groupRef.current.rotation.y = easeOut * Math.PI * 1.35;

    const opacity = Math.max(0, 1 - progress);
    burstMaterial.opacity = opacity;
    hotCoreMaterial.opacity = Math.max(0, 1 - progress * 1.45);
  });

  return (
    <group ref={groupRef} position={position} renderOrder={999}>
      {/* Big flash core. */}
      <mesh material={hotCoreMaterial} renderOrder={1000}>
        <sphereGeometry args={[0.38, 20, 20]} />
      </mesh>

      {/* Rings in several rotations so the blast reads from different camera angles. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={burstMaterial} renderOrder={1000}>
        <torusGeometry args={[0.58, 0.035, 10, 64]} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} material={burstMaterial} renderOrder={1000}>
        <torusGeometry args={[0.46, 0.025, 10, 48]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} material={burstMaterial} renderOrder={1000}>
        <torusGeometry args={[0.46, 0.025, 10, 48]} />
      </mesh>

      {/* Sparks/debris flash. These vanish with the component. */}
      {[0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75].map((angle) => (
        <mesh
          key={angle}
          position={[Math.cos(angle) * 0.54, 0.06, Math.sin(angle) * 0.54]}
          rotation={[0, angle, 0]}
          material={burstMaterial}
          renderOrder={1000}
        >
          <boxGeometry args={[0.36, 0.055, 0.055]} />
        </mesh>
      ))}
    </group>
  );
}
