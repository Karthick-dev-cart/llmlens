export interface AlertPayload {
  projectId: string;
  period: string;
  thresholdUsd: number;
  spendUsd: number;
}

interface EmailChannelConfig {
  [key: string]: unknown;
  type: "email";
  to: string;
}

interface SlackChannelConfig {
  [key: string]: unknown;
  type: "slack";
  webhookUrl: string;
}

function isEmailChannel(config: Record<string, unknown>): config is EmailChannelConfig {
  return config.type === "email" && typeof config.to === "string";
}

function isSlackChannel(config: Record<string, unknown>): config is SlackChannelConfig {
  return config.type === "slack" && typeof config.webhookUrl === "string";
}

function alertText(payload: AlertPayload): { subject: string; body: string } {
  const subject = `LLMLens budget alert: ${payload.period} spend $${payload.spendUsd.toFixed(2)} over $${payload.thresholdUsd.toFixed(2)}`;
  const body = `Project ${payload.projectId}'s ${payload.period} spend has reached $${payload.spendUsd.toFixed(2)}, over the $${payload.thresholdUsd.toFixed(2)} budget threshold.`;
  return { subject, body };
}

// No RESEND_API_KEY configured (the default for local dev) logs the email
// instead of sending it — see README for why real delivery is opt-in here.
async function sendEmail(to: string, payload: AlertPayload): Promise<void> {
  const { subject, body } = alertText(payload);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[dry-run] would email ${to}: ${subject} — ${body}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "alerts@llmlens.dev",
      to,
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    console.error(`resend send failed: ${res.status} ${await res.text()}`);
  }
}

// Slack incoming webhooks are a plain POST to a URL the user supplies in
// their own budget config — no credential of ours involved, so this always
// attempts a real send rather than dry-running.
async function sendSlack(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const { subject } = alertText(payload);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `:rotating_light: *${subject}*` }),
  });
  if (!res.ok) {
    console.error(`slack webhook failed: ${res.status} ${await res.text()}`);
  }
}

export async function sendAlert(
  channelConfig: Record<string, unknown>,
  payload: AlertPayload,
): Promise<void> {
  if (isEmailChannel(channelConfig)) {
    await sendEmail(channelConfig.to, payload);
  } else if (isSlackChannel(channelConfig)) {
    await sendSlack(channelConfig.webhookUrl, payload);
  } else {
    console.warn("budget threshold breached but channelConfig has no recognized channel");
  }
}
