"use client";

import { useRef, type PointerEvent } from "react";

/**
 * A stylised 3D agricultural drone built purely from CSS 3D transforms.
 *
 * No WebGL, no libraries — every part is a box made of six shaded faces, and
 * the whole assembly sits on a slow turntable so it clearly reads as 3D. The
 * camera follows the cursor (parallax) and everything is switched off under
 * prefers-reduced-motion.
 *
 * Coordinate space: +x right, +y down (CSS), +z toward the viewer. Each box
 * is centred on the drone's origin, which lives at the middle of the stage.
 */

type BoxProps = {
  w: number;
  h: number;
  d: number;
  x?: number;
  y?: number;
  z?: number;
};

/** A solid box. Six faces, each shaded to fake a single light from top-front. */
function Box3D({ w, h, d, x = 0, y = 0, z = 0 }: BoxProps) {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  return (
    <div
      className="drone3d-box"
      style={{
        width: w,
        height: h,
        transform: `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${z}px)`,
      }}
    >
      <div
        className="face face-top"
        style={{ width: w, height: d, transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${hh}px)` }}
      />
      <div
        className="face face-bottom"
        style={{ width: w, height: d, transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${hh}px)` }}
      />
      <div
        className="face face-front"
        style={{ width: w, height: h, transform: `translate(-50%, -50%) translateZ(${hd}px)` }}
      />
      <div
        className="face face-back"
        style={{ width: w, height: h, transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${hd}px)` }}
      />
      <div
        className="face face-left"
        style={{ width: d, height: h, transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${hw}px)` }}
      />
      <div
        className="face face-right"
        style={{ width: d, height: h, transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${hw}px)` }}
      />
    </div>
  );
}

const ARM_LEN = 134;

/** A rotor pod: motor box with a spinning disc on top, at the tip of an arm. */
function RotorPod() {
  return (
    <div className="drone3d-part" style={{ transform: `translate3d(${ARM_LEN - 12}px, -4px, 0)` }}>
      <Box3D w={16} h={13} d={16} />
      <div
        className="drone3d-rotor"
        style={{
          width: 104,
          height: 104,
          transform: `translate3d(-50%, calc(-50% - 16px), 0) rotateX(-90deg)`,
        }}
      >
        <div className="drone3d-rotor-blades" />
      </div>
    </div>
  );
}

export function Drone3D() {
  const tiltRef = useRef<HTMLDivElement>(null);

  function applyTilt(rx: number, ry: number) {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
  }

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - rect.left) / rect.width - 0.5;
    const dy = (event.clientY - rect.top) / rect.height - 0.5;
    applyTilt(-10 - dy * 12, dx * 14);
  }

  function onLeave() {
    applyTilt(-10, 0);
  }

  return (
    <div
      aria-hidden
      className="relative h-full w-full"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div aria-hidden className="drone-halo" />

      <div className="drone3d-scene">
        <div ref={tiltRef} className="drone3d-tilt">
          <div className="drone3d-spin">
            {/* Fuselage, tank and antenna. */}
            <Box3D w={72} h={28} d={44} />
            <Box3D w={48} h={18} d={30} y={-23} />
            <Box3D w={4} h={16} d={4} y={-41} />

            {/* Four arms, each with a rotor pod at its tip. */}
            {[45, 135, 225, 315].map((angle) => (
              <div key={angle} className="drone3d-arm" style={{ transform: `rotateY(${angle}deg)` }}>
                <Box3D w={ARM_LEN} h={5} d={8} x={ARM_LEN / 2 - 18} y={-2} />
                <RotorPod />
              </div>
            ))}

            {/* Spray boom, struts and nozzles. */}
            <Box3D w={7} h={36} d={7} x={-36} y={31} />
            <Box3D w={7} h={36} d={7} x={36} y={31} />
            <Box3D w={220} h={6} d={9} y={49} />
            {[-86, -43, 0, 43, 86].map((x) => (
              <Box3D key={x} w={4} h={15} d={4} x={x} y={58} />
            ))}

            {/* Landing gear: four struts down to two skids. */}
            {[26, -26].flatMap((z) => [
              <Box3D key={`strut-l-${z}`} w={6} h={50} d={6} x={-30} y={40} z={z} />,
              <Box3D key={`strut-r-${z}`} w={6} h={50} d={6} x={30} y={40} z={z} />,
              <Box3D key={`skid-${z}`} w={76} h={6} d={7} y={65} z={z} />,
            ])}
          </div>
        </div>
      </div>
    </div>
  );
}
