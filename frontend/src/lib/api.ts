/**
 * The browser side of the API.
 *
 * Every route answers with the same error shape, so there is exactly one place
 * that knows how to read a failure and exactly one thing a form has to render.
 *
 * `credentials: "include"` is on every request without exception. The session
 * is an httpOnly cookie; omit this and the cookie is never attached, so every
 * call 401s while looking for all the world like a broken login.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface ApiFailure {
  message: string;
  fields: Record<string, string>;
  status: number;
}

export interface ApiResult<T> {
  data: T | null;
  failure: ApiFailure | null;
}

async function request<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  } catch {
    // A dropped connection is not a validation error, and saying "check your
    // fields" when the network is down sends the student looking in the wrong
    // place.
    return {
      data: null,
      failure: { message: "Could not reach the server", fields: {}, status: 0 },
    };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; fields?: Record<string, string> } })
      ?.error;
    return {
      data: null,
      failure: {
        message: error?.message ?? `Request failed (${response.status})`,
        fields: error?.fields ?? {},
        status: response.status,
      },
    };
  }

  return { data: payload as T, failure: null };
}

export function get<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET" });
}

export function send<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The .ics download has to carry the cookie too, so it cannot be a bare link. */
export async function downloadCalendar(): Promise<string | null> {
  const response = await fetch(`${BASE}/api/calendar`, { credentials: "include" });
  if (!response.ok) return null;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "roundready.ics";
  anchor.click();
  URL.revokeObjectURL(url);
  return "ok";
}
