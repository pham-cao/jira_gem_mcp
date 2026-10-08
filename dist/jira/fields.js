const SPRINT_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint";
/** Lazily loads `GET /rest/api/2/field` once per instance. */
export class FieldCache {
    client;
    fields;
    constructor(client) {
        this.client = client;
    }
    all() {
        this.fields ??= this.client.get("/rest/api/2/field").catch((e) => {
            this.fields = undefined;
            throw e;
        });
        return this.fields;
    }
    async sprintFieldId() {
        return (await this.all()).find((f) => f.schema?.custom === SPRINT_SCHEMA)?.id;
    }
}
