const { google } = require("googleapis");

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_ACCOUNT_EMAIL = process.env.GMAIL_ACCOUNT_EMAIL || "me";
const GMAIL_QUOTE_QUERY = process.env.GMAIL_QUOTE_QUERY || "in:inbox";
const GMAIL_REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI || "https://developers.google.com/oauthplayground";

// Cuenta de alertas (administrativa)
const ALERT_GMAIL_ACCOUNT_EMAIL = process.env.ALERT_GMAIL_ACCOUNT_EMAIL;
const ALERT_GMAIL_REFRESH_TOKEN = process.env.ALERT_GMAIL_REFRESH_TOKEN;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
  console.warn("[Gmail] Faltan GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET");
}

if (!GMAIL_REFRESH_TOKEN) {
  console.warn("[Gmail] Falta GMAIL_REFRESH_TOKEN para la cuenta principal");
}

if (!ALERT_GMAIL_REFRESH_TOKEN || !ALERT_GMAIL_ACCOUNT_EMAIL) {
  console.warn("[Gmail] Cuenta de alertas no configurada completamente (ALERT_GMAIL_ACCOUNT_EMAIL / ALERT_GMAIL_REFRESH_TOKEN)");
}

/* Crea un cliente OAuth2 con un refresh token dado */
function createOAuth2Client(refreshToken) {
  const oAuth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );

  if (refreshToken) {
    oAuth2Client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  return oAuth2Client;
}

/* Retorna el email de usuario para una cuenta lógica */
function getUserEmailForAccount(account) {
  if (account === "alerts") {
    return ALERT_GMAIL_ACCOUNT_EMAIL || "me";
  }
  return GMAIL_ACCOUNT_EMAIL || "me";
}

/* Crea un cliente de Gmail para la cuenta indicada */
function getGmailClient(account = "primary") {
  const isAlerts = account === "alerts";

  const refreshToken = isAlerts ? ALERT_GMAIL_REFRESH_TOKEN : GMAIL_REFRESH_TOKEN;

  if (!refreshToken) {
    const key = isAlerts ? "ALERT_GMAIL_REFRESH_TOKEN" : "GMAIL_REFRESH_TOKEN";
    throw new Error(`[Gmail] Falta ${key} para la cuenta ${account}`);
  }

  const auth = createOAuth2Client(refreshToken);
  return google.gmail({ version: "v1", auth });
}

/* Lista mensajes de Gmail según un query en la cuenta principal (cotizaciones) */
async function listMessages({ q, maxResults = 50, pageToken } = {}) {
  const gmail = getGmailClient("primary");

  const res = await gmail.users.messages.list({
    userId: getUserEmailForAccount("primary"),
    q: q || GMAIL_QUOTE_QUERY,
    maxResults,
    pageToken,
  });

  return {
    messages: res.data.messages || [],
    nextPageToken: res.data.nextPageToken || null,
    resultSizeEstimate: res.data.resultSizeEstimate || 0,
  };
}

/* Obtiene un mensaje por id en formato completo desde la cuenta principal */
async function getMessageById(messageId) {
  if (!messageId) {
    throw new Error("[Gmail] messageId es requerido");
  }

  const gmail = getGmailClient("primary");

  const res = await gmail.users.messages.get({
    userId: getUserEmailForAccount("primary"),
    id: messageId,
    format: "full",
  });

  return res.data;
}

/* Codifica un string en base64 url safe */
function encodeBase64Url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/* Construye el mensaje MIME bruto para Gmail */
function buildRawMessage({ from, to, cc, subject, text, html }) {
  const toList = Array.isArray(to) ? to.join(", ") : to;
  const ccList = Array.isArray(cc) ? cc.join(", ") : cc;

  const boundary = "====CUBICA_MAIL_BOUNDARY_" + Date.now();

  const lines = [];

  if (from) lines.push(`From: ${from}`);
  if (toList) lines.push(`To: ${toList}`);
  if (ccList) lines.push(`Cc: ${ccList}`);

  const encodedSubject = subject
    ? `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`
    : "";

  if (encodedSubject) {
    lines.push(`Subject: ${encodedSubject}`);
  }

  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");

  const plainText = text || (html ? html.replace(/<[^>]+>/g, "") : "");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(plainText || "");
  lines.push("");

  const htmlBody = html || plainText;
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(htmlBody || "");
  lines.push("");

  lines.push(`--${boundary}--`);
  lines.push("");

  return lines.join("\r\n");
}

/* Envía un correo usando la API de Gmail en la cuenta indicada */
async function sendGmailMessage({ to, cc, subject, text, html, from, account = "primary" }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error("[Gmail] Campo 'to' es obligatorio para enviar correo");
  }

  const gmail = getGmailClient(account);
  const userId = getUserEmailForAccount(account);

  const fromHeader = from || userId;

  const raw = buildRawMessage({
    from: fromHeader,
    to,
    cc,
    subject,
    text,
    html,
  });

  const encodedRaw = encodeBase64Url(raw);

  const res = await gmail.users.messages.send({
    userId,
    requestBody: {
      raw: encodedRaw,
    },
  });

  return res.data;
}

module.exports = {
  getGmailClient,
  listMessages,
  getMessageById,
  sendGmailMessage,
  GMAIL_QUOTE_QUERY,
};
