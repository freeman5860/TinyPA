"use client";

import { useEffect, useRef } from "react";

export function TimezoneSync({ serverTz }: { serverTz: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    let browserTz: string | null = null;
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return;
    }
    if (!browserTz || browserTz === serverTz) return;

    const key = `tinypa:tz-sync:${serverTz}:${browserTz}`;
    if (sessionStorage.getItem(key)) return;

    fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone: browserTz }),
    })
      .then((r) => {
        if (r.ok) sessionStorage.setItem(key, "1");
      })
      .catch(() => {});
  }, [serverTz]);

  return null;
}
