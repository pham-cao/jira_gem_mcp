import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const base = { JIRA_BASE_URL: "https://pm.gem-corp.tech", JIRA_USERNAME: "u", JIRA_PASSWORD: "p" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toEqual({
      baseUrl: "https://pm.gem-corp.tech",
      username: "u",
      password: "p",
      readOnly: false,
      insecureTls: false,
      timeoutMs: 30000,
    });
  });

  it("reuses Jira credentials for Confluence by default", () => {
    expect(loadConfig({ ...base, CONFLUENCE_BASE_URL: "https://conf.gem-corp.tech/" }).confluence)
      .toEqual({ baseUrl: "https://conf.gem-corp.tech", username: "u", password: "p" });
  });
  it("lets CONFLUENCE_USERNAME/PASSWORD override", () => {
    expect(loadConfig({ ...base, CONFLUENCE_BASE_URL: "https://c", CONFLUENCE_USERNAME: "cu", CONFLUENCE_PASSWORD: "cp" }).confluence)
      .toMatchObject({ username: "cu", password: "cp" });
  });
  it("omits confluence when CONFLUENCE_BASE_URL is unset", () => {
    expect("confluence" in loadConfig(base)).toBe(false);
  });
  it.each(["CONFLUENCE_USERNAME", "CONFLUENCE_PASSWORD"])("rejects %s without CONFLUENCE_BASE_URL", (k) => {
    expect(() => loadConfig({ ...base, [k]: "x" })).toThrow(/CONFLUENCE_BASE_URL/);
  });
  it("validates CONFLUENCE_BASE_URL as http(s)", () => {
    expect(() => loadConfig({ ...base, CONFLUENCE_BASE_URL: "ftp://c" })).toThrow(/CONFLUENCE_BASE_URL/);
  });

  it.each(["JIRA_BASE_URL", "JIRA_USERNAME", "JIRA_PASSWORD"])("throws ConfigError naming missing %s", (k) => {
    expect(() => loadConfig({ ...base, [k]: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, [k]: "" })).toThrow(new RegExp(k));
  });

  it("strips trailing slashes but keeps context path", () => {
    expect(loadConfig({ ...base, JIRA_BASE_URL: "https://host/jira//" }).baseUrl).toBe("https://host/jira");
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["false", false],
    ["0", false],
  ])("parses JIRA_READ_ONLY=%s", (v, want) => {
    expect(loadConfig({ ...base, JIRA_READ_ONLY: v }).readOnly).toBe(want);
  });

  it("rejects a bad boolean", () => {
    expect(() => loadConfig({ ...base, JIRA_INSECURE_TLS: "yes" })).toThrow(/JIRA_INSECURE_TLS/);
  });

  it("parses timeout and rejects non-positive values", () => {
    expect(loadConfig({ ...base, JIRA_TIMEOUT_MS: "5000" }).timeoutMs).toBe(5000);
    expect(() => loadConfig({ ...base, JIRA_TIMEOUT_MS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, JIRA_TIMEOUT_MS: "abc" })).toThrow(ConfigError);
  });

  it("rejects a non-http base URL", () => {
    expect(() => loadConfig({ ...base, JIRA_BASE_URL: "pm.gem-corp.tech" })).toThrow(ConfigError);
  });

  it("lists every failing variable", () => {
    expect(() => loadConfig({})).toThrow(/JIRA_BASE_URL[\s\S]*JIRA_USERNAME[\s\S]*JIRA_PASSWORD/);
  });
});
