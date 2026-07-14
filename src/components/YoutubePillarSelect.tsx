"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignYoutubeVideoPillar } from "@/lib/youtube/actions";

// Mismo patrón que PillarAssignSelect (campañas de ads), pero para videos de
// YouTube — permite cruzar YT con IG orgánico y pauta por pilar de contenido.
export function YoutubePillarSelect({
  videoId, pillarId, pillars,
}: {
  videoId: number;
  pillarId: number | null;
  pillars: { id: number; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value ? Number(e.target.value) : null;
    startTransition(async () => {
      await assignYoutubeVideoPillar(videoId, value);
      router.refresh();
    });
  }

  return (
    <select
      value={pillarId ?? ""}
      onChange={handleChange}
      disabled={pending}
      className="form-input"
      style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem", width: "100%", marginTop: "0.4rem" }}
    >
      <option value="">Pilar: sin asignar</option>
      {pillars.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  );
}
