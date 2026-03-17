"use client";

import { useEffect, useState } from "react";
import { fetchAppConfig, MICRO_ALGO, type AppConfig } from "@/lib/algorand";

function PlatformSettingsSection() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  
  useEffect(() => {
    fetchAppConfig()
      .then(setAppConfig)
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Platform settings
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-500">Required stake per voter</p>

          <p className="mt-0.5 text-sm font-semibold text-zinc-800">
            {appConfig ? `${Number(appConfig.defaultStake) / MICRO_ALGO} ALGO` : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-500">Withdraw window</p>

          <p className="mt-0.5 text-sm font-semibold text-zinc-800">
            {appConfig
              ? `${Number(appConfig.defaultWithdrawWindow) / 3600}h after vote ends`
              : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default PlatformSettingsSection;
