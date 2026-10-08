import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const readJson = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

describe("plugin packaging", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  const market = readJson(".claude-plugin/marketplace.json");
  const pkg = readJson("package.json");

  it("plugin.json name and version", () => {
    expect(plugin.name).toBe("gem-jira");
    expect(plugin.version).toBe(pkg.version);
  });

  it("userConfig keys and defaults", () => {
    const uc = plugin.userConfig;
    expect(Object.keys(uc).sort()).toEqual(["confluence_base_url", "jira_base_url", "password", "username"]);
    expect(uc.jira_base_url.default).toBe("https://pm.gem-corp.tech");
    expect(uc.confluence_base_url.default).toBe("https://conf.gem-corp.tech");
    expect(uc.password.sensitive).toBe(true);
  });

  it("marketplace.json", () => {
    expect(market.name).toBe("gem-tools");
    expect(market.plugins[0]).toMatchObject({ name: "gem-jira", source: "." });
  });

  it("mcp server wiring", () => {
    const s = plugin.mcpServers.jira;
    expect(s.command).toBe("node");
    expect(s.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]);
    expect(s.env).toEqual({
      JIRA_BASE_URL: "${user_config.jira_base_url}",
      CONFLUENCE_BASE_URL: "${user_config.confluence_base_url}",
      JIRA_USERNAME: "${user_config.username}",
      JIRA_PASSWORD: "${user_config.password}",
    });
  });

  it("dist/index.js exists", () => {
    expect(existsSync(resolve(root, "dist/index.js"))).toBe(true);
  });
});
