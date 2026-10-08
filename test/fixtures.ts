import { http, HttpResponse } from "msw";
import { API } from "./helpers.js";

export const SPRINT_FIELD = "customfield_10000";

export const fieldsHandler = http.get(`${API}/field`, () =>
  HttpResponse.json([
    { id: "summary", name: "Summary", custom: false, schema: { type: "string" } },
    { id: SPRINT_FIELD, name: "Sprint", custom: true, schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" } },
  ]),
);

export const user = (name: string) => ({ self: "s", name, displayName: name.toUpperCase(), avatarUrls: {} });
