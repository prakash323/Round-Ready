import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";

/**
 * The HTTP error contract, exercised over a real socket.
 *
 * Every path here is reachable without a database, which is the point: a
 * malformed body is a 422 and a missing session is a 401 *whether or not* Mongo
 * is up, because validation and authorisation both run before any controller
 * touches a collection. If that ordering ever regresses these fail, and a
 * misconfigured deployment stops being able to mask a client bug as a 503.
 */

// Set before importing anything that reads the environment.
process.env.AUTH_SECRET = "x".repeat(40);
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
process.env.NODE_ENV = "development";

let server: Server | undefined;
let base: string;

// Generous: the first import pulls in Express and the whole Mongoose model
// layer, which on a cold module cache takes longer than vitest's 10s default.
// Nothing here connects to a database — only the modules are loaded.
beforeAll(async () => {
  const { createApp } = await import("@/server");
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  const address = server!.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((error) => (error ? reject(error) : resolve()));
  });
});

const json = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);

const post = (path: string, body: unknown) =>
  json(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * `Response.json()` is `Promise<unknown>` under @types/node, where the DOM lib
 * would hand back `any`. Naming the shape here is better than casting at each
 * assertion, and it means a change to the error contract shows up as a type
 * error in the tests that assert it.
 */
interface ErrorBody {
  error: { message: string; fields?: Record<string, string> };
}

async function bodyOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("health", () => {
  it("answers without a session or a database", async () => {
    const response = await json("/api/health");
    expect(response.status).toBe(200);
    expect(await bodyOf<{ ok: boolean }>(response)).toEqual({ ok: true });
  });
});

describe("no session", () => {
  it("is 401 on the board", async () => {
    const response = await json("/api/board");
    expect(response.status).toBe(401);
    expect((await bodyOf<ErrorBody>(response)).error.message).toBe("Sign in to continue");
  });

  it("is 401 on every authenticated route", async () => {
    for (const path of ["/api/profile", "/api/drives", "/api/applications", "/api/calendar"]) {
      expect((await json(path)).status, path).toBe(401);
    }
  });

  it("checks the session before the body, so an empty POST is still 401", async () => {
    expect((await post("/api/simulate", {})).status).toBe(401);
  });
});

describe("validation", () => {
  it("is 422 with per-field messages, not 500", async () => {
    const response = await post("/api/auth/login", { email: "not-an-email", password: "" });
    expect(response.status).toBe(422);
    const body = await bodyOf<ErrorBody>(response);
    expect(body.error.message).toBe("Some fields need fixing");
    expect(body.error.fields?.email).toBe("Enter a valid email");
    expect(body.error.fields?.password).toBe("Password is required");
  });

  it("rejects a registration with a short password before touching the database", async () => {
    const response = await post("/api/auth/register", {
      name: "A",
      email: "a@b.com",
      password: "short",
      college: "X",
      gradYear: 2027,
    });
    expect(response.status).toBe(422);
    expect((await bodyOf<ErrorBody>(response)).error.fields?.password).toBe("Use at least 8 characters");
  });

  it("treats an unreadable body as a validation failure", async () => {
    const response = await json("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect([400, 422]).toContain(response.status);
    expect(await bodyOf<ErrorBody>(response)).toHaveProperty("error.message");
  });
});

describe("job-description routes", () => {
  it("require a session, like every other private route", async () => {
    expect((await json("/api/jd")).status).toBe(401);
    expect((await post("/api/jd/analyse", { text: "Java" })).status).toBe(401);
  });

  it("check the session before the body", async () => {
    // An unauthenticated caller must not learn whether their payload was
    // well formed.
    expect((await post("/api/jd/analyse", {})).status).toBe(401);
  });
});

describe("unknown endpoints", () => {
  it("answer in the same error shape rather than an HTML page", async () => {
    const response = await json("/api/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await bodyOf<ErrorBody>(response)).error.message).toBe("No such endpoint");
  });
});

describe("error bodies", () => {
  it("never carry a stack trace", async () => {
    const paths = ["/api/board", "/api/nope"];
    for (const path of paths) {
      const text = await (await json(path)).text();
      expect(text, path).not.toMatch(/\bat \S+ \(/);
      expect(text, path).not.toContain("node_modules");
    }
  });
});

/**
 * The officer gate, as far as it can be exercised without a database.
 *
 * Proving a *student* gets 403 needs a real session and a real user row, so
 * that is verified against a live server rather than here. What these assert
 * is the ordering, which is the part that silently regresses: authentication
 * runs before the role check, so an anonymous caller learns only that they are
 * not signed in. If `requireOfficer` ever moved ahead of `requireAuth`, this
 * route would start answering 403 to the whole internet — telling anybody who
 * asks that the endpoint exists and what it is for.
 */
describe("the officer-only routes", () => {
  const DRIVE_ID = "6adca93997238f52b6a4ffb2";

  it("answer 401 before 403 when nobody is signed in", async () => {
    expect((await post("/api/drives", { company: "Zoho", role: "MTS", ctcLpa: 11 })).status).toBe(
      401,
    );
    expect((await json(`/api/drives/${DRIVE_ID}`, { method: "DELETE" })).status).toBe(401);
    expect(
      (
        await json(`/api/drives/${DRIVE_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: "Zoho", role: "MTS", ctcLpa: 11, criteria: {} }),
        })
      ).status,
    ).toBe(401);
  });

  it("check the session before the body on the policy route", async () => {
    expect(
      (
        await json("/api/policy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceMultiplier: 99 }),
        })
      ).status,
    ).toBe(401);
  });

  it("keep reading a batch's policy behind a session too", async () => {
    // Readable by any student in the batch, but not by the public: it names
    // the college's rule and, with it, the batch.
    expect((await json("/api/policy")).status).toBe(401);
  });
});
