import { appPath } from "@/lib/app-path";
import Image from "next/image";
import { Smartphone } from "lucide-react";
import type { Platform } from "@/lib/device-data";

export function DevicePlatformIcon({ platform }: { platform: Platform | null }) {
  const icon = platform === "iOS" ? "apple" : platform === "Android" ? "android" : null;
  return <span className="row-device-icon" data-platform={platform ?? "unknown"} title={platform ?? "Platform not recorded"} aria-hidden="true">
    {icon ? <Image src={appPath(`/platforms/${icon}.svg`)} width={22} height={22} alt="" /> : <Smartphone size={22} strokeWidth={1.5} />}
  </span>;
}
