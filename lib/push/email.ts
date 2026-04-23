import { Resend } from "resend";

let singleton: Resend | null = null;

export function resend() {
  if (!singleton) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    singleton = new Resend(key);
  }
  return singleton;
}

export const MAIL_FROM = process.env.MAIL_FROM ?? "TinyPA <onboarding@resend.dev>";
