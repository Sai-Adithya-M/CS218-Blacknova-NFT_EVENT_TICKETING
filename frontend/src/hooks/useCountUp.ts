import { useEffect, useState } from 'react';
import { animate, useMotionValue, useTransform } from 'framer-motion';

export const useCountUp = (end: number, duration: number = 2) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(count, end, { duration });
    return controls.stop;
  }, [count, end, duration]);

  useEffect(() => {
    return rounded.on("change", (v) => setDisplayValue(v));
  }, [rounded]);

  return displayValue;
};
