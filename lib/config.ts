import { z } from "zod";
const schema = z.object({
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(?:\+srv)?:\/\//)
    .default("mongodb://127.0.0.1:27017/tempmail"),
  MAIL_DOMAIN: z
    .string()
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)
    .default("email.fzeetechz.com"),
  NEXT_PUBLIC_MAIL_DOMAIN: z.string().default("email.fzeetechz.com"),
  MAIL_RETENTION_HOURS: z.coerce.number().positive().max(24).default(1),
  MAX_EMAIL_SIZE_MB: z.coerce.number().positive().max(10).default(2),
  MAX_STORED_BYTES: z.coerce
    .number()
    .int()
    .min(1048576)
    .max(1073741824)
    .default(268435456),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});
export function config() {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error("Invalid server configuration");
  if (result.data.MAIL_DOMAIN !== result.data.NEXT_PUBLIC_MAIL_DOMAIN)
    throw new Error("Mail domains must match");
  return result.data;
}
