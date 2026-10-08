import type { JiraClient } from "./client.js";

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type?: string; custom?: string };
}

const SPRINT_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint";

/** Lazily loads `GET /rest/api/2/field` once per instance. */
export class FieldCache {
  private fields?: Promise<JiraField[]>;

  constructor(private readonly client: JiraClient) {}

  all(): Promise<JiraField[]> {
    this.fields ??= this.client.get<JiraField[]>("/rest/api/2/field").catch((e) => {
      this.fields = undefined;
      throw e;
    });
    return this.fields;
  }

  async sprintFieldId(): Promise<string | undefined> {
    return (await this.all()).find((f) => f.schema?.custom === SPRINT_SCHEMA)?.id;
  }
}
