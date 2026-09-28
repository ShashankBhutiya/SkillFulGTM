import { NextResponse } from "next/server";
import { newId, sql, store } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ templates: await store.listTemplates() });
}

function validate(input: { name?: string; subject?: string; body?: string }) {
  const name = input.name?.trim() ?? "";
  const subject = input.subject?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  if (!name || !subject || !body) return { error: "Name, subject, and body are required." };
  if (name.length > 100 || subject.length > 200 || body.length > 20_000) {
    return { error: "Template content is too long." };
  }
  return { name, subject, body };
}

export async function POST(req: Request) {
  const valid = validate(await req.json());
  if ("error" in valid) return NextResponse.json({ error: valid.error }, { status: 400 });
  const id = newId("tpl");
  await sql("INSERT INTO email_templates (id, name, subject, body) VALUES ($1,$2,$3,$4)", [
    id,
    valid.name,
    valid.subject,
    valid.body,
  ]);
  return NextResponse.json({ template: await store.getTemplate(id) });
}

export async function PATCH(req: Request) {
  const input = (await req.json()) as { id?: string; name?: string; subject?: string; body?: string };
  if (!input.id || !(await store.getTemplate(input.id))) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  const valid = validate(input);
  if ("error" in valid) return NextResponse.json({ error: valid.error }, { status: 400 });
  await sql(
    "UPDATE email_templates SET name=$1, subject=$2, body=$3, updated_at=now() WHERE id=$4",
    [valid.name, valid.subject, valid.body, input.id],
  );
  return NextResponse.json({ template: await store.getTemplate(input.id) });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  await sql("DELETE FROM email_templates WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
