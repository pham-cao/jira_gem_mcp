import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { JiraClient } from "../src/jira/client.js";

export const BASE_URL = "https://jira.test/ctx";
export const API = `${BASE_URL}/rest/api/2`;
export const AGILE = `${BASE_URL}/rest/agile/1.0`;

export const mswServer = setupServer();

export function useMsw(): void {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
  afterEach(() => mswServer.resetHandlers());
  afterAll(() => mswServer.close());
}

export function makeClient(overrides: { password?: string; timeoutMs?: number } = {}): JiraClient {
  return new JiraClient(
    { baseUrl: BASE_URL, username: "alice", password: overrides.password ?? "s3cret", timeoutMs: overrides.timeoutMs ?? 200 },
    { retryDelayMs: 0 },
  );
}
