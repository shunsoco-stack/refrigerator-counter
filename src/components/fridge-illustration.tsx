"use client";

import { useEffect } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

export function FridgeIllustration({ pulse }: { pulse: number }) {
  const reducedMotion = useReducedMotion();
  const rotation = useSpring(0, { stiffness: 420, damping: 38, mass: 0.8 });
  const glow = useTransform(rotation, [0, -24], [0.12, 0.95]);
  useEffect(() => {
    if (pulse === 0 || reducedMotion) return;
    rotation.set(-24);
    const timeout = setTimeout(() => rotation.set(0), 480);
    return () => clearTimeout(timeout);
  }, [pulse, reducedMotion, rotation]);

  return (
    <div className="fridge-scene" aria-hidden="true">
      <div className="fridge-halo" />
      <div className="fridge-shadow" />
      <div className="fridge-body">
        <motion.div className="fridge-cold-light" style={{ opacity: glow }} />
        <div className="fridge-shelf shelf-one" /><div className="fridge-shelf shelf-two" />
        <motion.div className="fridge-door freezer-door" style={{ rotateY: rotation }}><span className="fridge-handle" /><span className="fridge-dot" /></motion.div>
        <motion.div className="fridge-door main-door" style={{ rotateY: rotation }}><span className="fridge-handle" /><span className="fridge-wordmark">COOL.</span></motion.div>
        <div className="fridge-foot foot-left" /><div className="fridge-foot foot-right" />
      </div>
      <span className="cold-spark spark-one">+</span><span className="cold-spark spark-two">+</span>
    </div>
  );
}
