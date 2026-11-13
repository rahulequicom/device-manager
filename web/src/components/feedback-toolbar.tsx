"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Agentation = dynamic(
  () => import("agentation").then(module => module.Agentation),
  { ssr: false }
);

export function FeedbackToolbar() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get("feedback") === "1");
  }, []);

  return enabled ? <Agentation /> : null;
}
