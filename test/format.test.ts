import { describe, expect, it } from "vitest";
import { MAX_TEXT, paged, parseSprintValue, slimIssue, slimUser, toJiraDate, truncate } from "../src/jira/format.js";

const BASE = "https://jira.test";
const user = (name: string) => ({ self: "x", name, key: name, displayName: name.toUpperCase(), avatarUrls: { "48x48": "a" } });

describe("truncate", () => {
  it("keeps strings up to the limit", () => {
    const s = "a".repeat(MAX_TEXT);
    expect(truncate(s, "h")).toBe(s);
  });
  it("cuts longer strings and appends the hint", () => {
    expect(truncate("a".repeat(MAX_TEXT + 1), "use X")).toBe("a".repeat(MAX_TEXT) + "…[truncated] use X");
  });
  it("passes null through", () => {
    expect(truncate(null, "h")).toBeNull();
    expect(truncate(undefined, "h")).toBeNull();
  });
});

describe("slimUser", () => {
  it("keeps name and displayName", () => expect(slimUser(user("alice"))).toEqual({ name: "alice", displayName: "ALICE" }));
  it("handles null", () => expect(slimUser(null)).toBeNull());
});

describe("parseSprintValue", () => {
  it("parses the legacy Sprint@ string (real Jira 8.5 format)", () => {
    const v = [
      "com.atlassian.greenhopper.service.sprint.Sprint@527df1bb[id=5651,rapidViewId=3306,state=FUTURE,name=Deliverable-3 (28/09 - 19/10),startDate=<null>,endDate=<null>,completeDate=<null>,sequence=5687,goal=Level 3]",
    ];
    expect(parseSprintValue(v)).toEqual([{ id: 5651, name: "Deliverable-3 (28/09 - 19/10)", state: "FUTURE" }]);
  });
  it("keeps commas inside sprint names", () => {
    const v = ["com.atlassian.greenhopper.service.sprint.Sprint@1[id=1,rapidViewId=3,state=ACTIVE,name=A, B,goal=,startDate=x]"];
    expect(parseSprintValue(v)[0]?.name).toBe("A, B");
  });
  it("accepts object values", () => {
    expect(parseSprintValue([{ id: 1, name: "S", state: "closed", boardId: 3 }])).toEqual([{ id: 1, name: "S", state: "closed" }]);
  });
  it("returns [] for null", () => expect(parseSprintValue(null)).toEqual([]));
});

const rawIssue = (fields: Record<string, unknown>) => ({ id: "10", self: "s", key: "ABC-1", expand: "e", fields });

describe("slimIssue", () => {
  it("produces the minimal shape without noise", () => {
    const out = slimIssue(
      rawIssue({
        summary: "S",
        status: { self: "x", name: "Open", iconUrl: "i" },
        issuetype: { name: "Bug", iconUrl: "i" },
        priority: { name: "High", iconUrl: "i" },
        assignee: user("bob"),
        updated: "2026-10-08",
      }),
      { baseUrl: BASE },
    );
    expect(out).toEqual({
      key: "ABC-1",
      url: "https://jira.test/browse/ABC-1",
      summary: "S",
      status: "Open",
      issuetype: "Bug",
      priority: "High",
      assignee: { name: "bob", displayName: "BOB" },
      updated: "2026-10-08",
    });
    expect(JSON.stringify(out)).not.toMatch(/self|avatarUrls|expand|iconUrl/);
  });

  it("adds detail fields when full", () => {
    const comments = Array.from({ length: 15 }, (_, i) => ({ id: String(i), author: user("c"), body: `c${i}`, created: "t", updated: "t" }));
    const out = slimIssue(
      rawIssue({
        summary: "S",
        reporter: user("rep"),
        labels: ["x"],
        description: "d",
        created: "c",
        resolution: { name: "Done" },
        parent: { key: "ABC-0", fields: { summary: "P" } },
        subtasks: [{ key: "ABC-2", fields: { summary: "Sub", status: { name: "Open" } } }],
        issuelinks: [
          { type: { name: "Blocks", inward: "is blocked by", outward: "blocks" }, inwardIssue: { key: "ABC-9", fields: { summary: "I", status: { name: "Done" } } } },
        ],
        attachment: [{ self: "x", id: "7", filename: "a.png", size: 3, mimeType: "image/png", content: "u" }],
        comment: { comments, total: 15 },
        customfield_10000: ["com.atlassian.greenhopper.service.sprint.Sprint@1[id=5,rapidViewId=1,state=ACTIVE,name=S5,startDate=x]"],
        customfield_10006: 3,
        customfield_99999: { nested: true },
      }),
      { baseUrl: BASE, sprintFieldId: "customfield_10000", full: true },
    );
    expect(out.reporter).toEqual({ name: "rep", displayName: "REP" });
    expect(out.resolution).toBe("Done");
    expect(out.parent).toEqual({ key: "ABC-0", summary: "P" });
    expect(out.subtasks).toEqual([{ key: "ABC-2", summary: "Sub", status: "Open" }]);
    expect(out.issuelinks).toEqual([{ type: "is blocked by", direction: "inward", key: "ABC-9", summary: "I", status: "Done" }]);
    expect(out.attachments).toEqual([{ id: "7", filename: "a.png", size: 3, mimeType: "image/png" }]);
    expect((out.comments as unknown[]).length).toBe(10);
    expect((out.comments as Array<{ id: string }>)[0]?.id).toBe("5");
    expect(out.commentsTotal).toBe(15);
    expect(out.sprint).toEqual([{ id: 5, name: "S5", state: "ACTIVE" }]);
    expect(out.customfield_10006).toBe(3);
    expect(out).not.toHaveProperty("customfield_99999");
    expect(out).not.toHaveProperty("customfield_10000");
  });
});

describe("paged", () => {
  it("computes hasMore", () => {
    expect(paged([1, 2], { total: 5, startAt: 0, maxResults: 2 })).toEqual({ items: [1, 2], total: 5, startAt: 0, maxResults: 2, hasMore: true });
    expect(paged([1, 2], { total: 2, startAt: 0, maxResults: 2 }).hasMore).toBe(false);
  });
});

describe("toJiraDate", () => {
  it("preserves a positive offset", () => expect(toJiraDate("2026-10-08T09:00:00+07:00")).toBe("2026-10-08T09:00:00.000+0700"));
  it("maps Z to +0000", () => expect(toJiraDate("2026-10-08T02:00:00Z")).toBe("2026-10-08T02:00:00.000+0000"));
  it("keeps millis and negative offsets", () => expect(toJiraDate("2026-10-08T09:00:00.123-05:30")).toBe("2026-10-08T09:00:00.123-0530"));
  it("treats a string without offset as local time", () =>
    expect(toJiraDate("2026-10-08T09:00")).toMatch(/^2026-10-08T09:00:00\.000[+-]\d{4}$/));
  it("formats Date with local offset", () =>
    expect(toJiraDate(new Date(2026, 0, 2, 3, 4, 5, 6))).toMatch(/^2026-01-02T03:04:05\.006[+-]\d{4}$/));
  it("defaults to now", () => expect(toJiraDate()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d{4}$/));
  it("rejects garbage", () => expect(() => toJiraDate("not a date")).toThrow());
});
