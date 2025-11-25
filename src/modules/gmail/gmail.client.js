const { google } = require("googleapis");

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_ACCOUNT_EMAIL = process.env.GMAIL_ACCOUNT_EMAIL || "me";
const GMAIL_QUOTE_QUERY = process.env.GMAIL_QUOTE_QUERY || "in:inbox";
const GMAIL_REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI || "https://developers.google.com/oauthplayground";

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.warn("[Gmail] Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET o GMAIL_REFRESH_TOKEN");
}

/* Crea un cliente OAuth2 para la API de Gmail */
function createOAuth2Client() {
  const oAuth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );

  if (GMAIL_REFRESH_TOKEN) {
    oAuth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN,
    });
  }

  return oAuth2Client;
}

/* Devuelve un cliente de Gmail listo para usar */
function getGmailClient() {
  const auth = createOAuth2Client();
  return google.gmail({ version: "v1", auth });
}

/* Lista mensajes de Gmail según un query */
async function listMessages({ q, maxResults = 50, pageToken } = {}) {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.list({
    userId: GMAIL_ACCOUNT_EMAIL,
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

/* Obtiene un mensaje por id en formato completo */
async function getMessageById(messageId) {
  if (!messageId) {
    throw new Error("[Gmail] messageId es requerido");
  }

  const gmail = getGmailClient();

  const res = await gmail.users.messages.get({
    userId: GMAIL_ACCOUNT_EMAIL,
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

/* Envía un correo usando la API de Gmail */
async function sendGmailMessage({ to, cc, subject, text, html, from }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error("[Gmail] Campo 'to' es obligatorio para enviar correo");
  }

  const gmail = getGmailClient();

  const fromAddress = from || GMAIL_ACCOUNT_EMAIL;
  const fromHeader = fromAddress;

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
    userId: GMAIL_ACCOUNT_EMAIL,
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
