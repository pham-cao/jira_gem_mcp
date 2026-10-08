import { z } from "zod";

export interface Config {
  baseUrl: string;
  username: string;
  password: string;
  readOnly: boolean;
  insecureTls: boolean;
  timeoutMs: number;
  confluence?: { baseUrl: string; username: string; password: string };
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

const required = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string({ required_error: "is required" }),
);

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return fallback;
      const s = v.toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be true/false/1/0",
      });
      return z.NEVER;
    });

const urlSchema = z
  .string()
  .url("must be an http(s) URL")
  .refine((u) => /^https?:\/\//i.test(u), "must be an http(s) URL")
  .transform((u) => u.replace(/\/+$/, ""));

const schema = z
  .object({
    JIRA_BASE_URL: required.pipe(urlSchema),
    CONFLUENCE_BASE_URL: z.preprocess(
      (v) => (v === "" ? undefined : v),
      urlSchema.optional(),
    ),
    CONFLUENCE_USERNAME: z.string().optional(),
    CONFLUENCE_PASSWORD: z.string().optional(),
    JIRA_USERNAME: required,
    JIRA_PASSWORD: required,
    JIRA_READ_ONLY: bool(false),
    JIRA_INSECURE_TLS: bool(false),
    JIRA_TIMEOUT_MS: z
      .preprocess(
        (v) => (v === undefined || v === "" ? "30000" : v),
        z.string(),
      )
      .pipe(
        z.coerce
          .number()
          .int("must be an integer")
          .positive("must be a positive integer"),
      ),
  })
  .superRefine((e, ctx) => {
    if (
      !e.CONFLUENCE_BASE_URL &&
      (e.CONFLUENCE_USERNAME || e.CONFLUENCE_PASSWORD)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONFLUENCE_BASE_URL"],
        message:
          "is required when CONFLUENCE_USERNAME/CONFLUENCE_PASSWORD is set",
      });
    }
  });

export function loadConfig(env: Record<string, string | undefined>): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const lines = r.error.issues.map(
      (i) => `- ${i.path.join(".")}: ${i.message}`,
    );
    throw new ConfigError(`Cấu hình không hợp lệ:\n${lines.join("\n")}`);
  }
  const e = r.data;
  const confluence = e.CONFLUENCE_BASE_URL
    ? {
        baseUrl: e.CONFLUENCE_BASE_URL,
        username: e.CONFLUENCE_USERNAME || e.JIRA_USERNAME,
        password: e.CONFLUENCE_PASSWORD || e.JIRA_PASSWORD,
      }
    : undefined;
  return {
    baseUrl: e.JIRA_BASE_URL,
    username: e.JIRA_USERNAME,
    password: e.JIRA_PASSWORD,
    readOnly: e.JIRA_READ_ONLY,
    insecureTls: e.JIRA_INSECURE_TLS,
    timeoutMs: e.JIRA_TIMEOUT_MS,
    ...(confluence && { confluence }),
  };
}
