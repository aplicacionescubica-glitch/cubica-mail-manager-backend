const { google } = require("googleapis");

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_ACCOUNT_EMAIL = process.env.GMAIL_ACCOUNT_EMAIL || "me";
const GMAIL_QUOTE_QUERY = process.env.GMAIL_QUOTE_QUERY || "in:inbox";

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.warn("[Gmail] Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET o GMAIL_REFRESH_TOKEN");
}

// Crea un cliente OAuth2 para la API de Gmail
function createOAuth2Client() {
  const oAuth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET
  );

  oAuth2Client.setCredentials({
    refresh_token: GMAIL_REFRESH_TOKEN,
  });

  return oAuth2Client;
}

// Devuelve una instancia autenticada del cliente de Gmail
function getGmailClient() {
  const auth = createOAuth2Client();
  return google.gmail({ version: "v1", auth });
}

// Lista mensajes de Gmail según una consulta
async function listMessages({ q, maxResults = 50, pageToken } = {}) {
  const gmail = getGmailClient();

  const query = q || GMAIL_QUOTE_QUERY;

  const res = await gmail.users.messages.list({
    userId: GMAIL_ACCOUNT_EMAIL,
    q: query,
    maxResults,
    pageToken,
  });

  const messages = res.data.messages || [];
  const nextPageToken = res.data.nextPageToken || null;

  return {
    messages,
    nextPageToken,
  };
}

// Obtiene el detalle de un mensaje por id
async function getMessageById(messageId) {
  const gmail = getGmailClient();

  const res = await gmail.users.messages.get({
    userId: GMAIL_ACCOUNT_EMAIL,
    id: messageId,
    format: "full",
  });

  return res.data;
}

module.exports = {
  getGmailClient,
  listMessages,
  getMessageById,
  GMAIL_QUOTE_QUERY,
};
