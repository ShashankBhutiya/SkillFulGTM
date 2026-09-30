import { z } from "zod";

export const mailboxInput = z.object({
  host: z.string().trim().min(1, "SMTP host is required.").max(253),
  port: z.number().int().refine((port) => [465, 587, 2525].includes(port), "Use SMTP port 465, 587, or 2525."),
  secure: z.boolean(),
  username: z.string().trim().min(1, "SMTP username is required.").max(254),
  password: z.string().max(4096).default(""),
  fromName: z.string().trim().max(100).refine((value) => !/[\r\n]/.test(value), "Sender name cannot contain newlines.").default(""),
  fromEmail: z.email().max(254).transform((value) => value.toLowerCase()),
  replyTo: z.union([z.email().max(254), z.literal("")]).default(""),
  postalAddress: z.string().trim().min(1, "Physical postal address is required.").max(2000),
  maxSendsPerDay: z.number().int().min(1).max(1000).default(40),
  secondsBetween: z.number().int().min(1).max(3600).default(45),
}).refine((input) => input.secure === (input.port === 465), {
  message: "Enable implicit TLS for port 465; disable it for ports 587 and 2525.",
  path: ["secure"],
});
