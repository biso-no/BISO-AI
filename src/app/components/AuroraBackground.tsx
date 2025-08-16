"use client";

import * as React from "react";
import { motion } from "framer-motion";

type AuroraBackgroundProps = {
  className?: string;
};

export function AuroraBackground({ className }: AuroraBackgroundProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <motion.div
        aria-hidden
        className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-500/20 via-fuchsia-400/20 to-amber-300/20 blur-3xl"
        animate={{
          scale: [1, 1.05, 1],
          rotate: [0, 12, -8, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        aria-hidden
        className="absolute bottom-[-20%] left-[-10%] h-[26rem] w-[26rem] rounded-full bg-gradient-to-tr from-emerald-400/15 via-cyan-400/15 to-sky-400/15 blur-3xl"
        animate={{
          x: [0, 20, -10, 0],
          y: [0, -10, 10, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        aria-hidden
        className="absolute right-[-10%] top-1/3 h-[22rem] w-[22rem] rounded-full bg-gradient-to-tr from-indigo-400/15 via-purple-400/15 to-pink-400/15 blur-3xl"
        animate={{
          x: [0, -10, 10, 0],
          y: [0, 10, -10, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export default AuroraBackground;



