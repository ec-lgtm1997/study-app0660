import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClientId, latestScores, loadLearnData } from "@/lib/learn";

/** Geräte-ID erst im Browser bestimmen (kein localStorage beim Server-Rendering). */
export function useClientId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(getClientId()), []);
  return id;
}

export function useLearnData() {
  const clientId = useClientId();
  const query = useQuery({
    queryKey: ["learn", clientId],
    queryFn: () => loadLearnData(clientId as string),
    enabled: clientId !== null,
    staleTime: 30_000,
  });
  const latest = useMemo(() => latestScores(query.data?.attempts ?? []), [query.data]);
  return { clientId, query, data: query.data, latest };
}
