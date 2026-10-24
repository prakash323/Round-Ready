import { useCallback, useEffect, useState } from "react";
import { get } from "./api";
import type { ApiFailure } from "./api";
import type { BoardResponse } from "./types";

/**
 * The board, fetched.
 *
 * Returns the loading state explicitly rather than treating `null` as both
 * "still loading" and "nothing there": every page that reads the board shows a
 * skeleton while it is in flight, which the server-rendered version never
 * needed and the client-rendered one very much does (AUDIT.md D8).
 */
export function useBoard(): {
  board: BoardResponse | null;
  loading: boolean;
  failure: ApiFailure | null;
  reload: () => Promise<void>;
} {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, failure: error } = await get<BoardResponse>("/api/board");
    setBoard(data);
    setFailure(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { board, loading, failure, reload };
}
