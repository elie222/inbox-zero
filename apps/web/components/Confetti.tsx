"use client";

import RawConfetti from "react-dom-confetti";
import type { ComponentType } from "react";

type ConfettiConfig = {
  angle?: number;
  spread?: number;
  width?: string;
  height?: string;
  duration?: number;
  dragFriction?: number;
  stagger?: number;
  startVelocity?: number;
  elementCount?: number;
  decay?: number;
  colors?: string[];
  random?: () => number;
};

type ConfettiProps = {
  active: boolean;
  config?: ConfettiConfig;
  className?: string;
};

export const Confetti = RawConfetti as unknown as ComponentType<ConfettiProps>;
