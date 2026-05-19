import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const PREFERENCES_TABLE = process.env.PREFERENCES_TABLE;
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Travel Concierge';

const spaceOut = (s) => s.split("").join(" ");

export const handler = async (event) => {
  try {
    const { customerId, category } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { preferences } = body;

    if (!customerId || !category) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId and category are required' }) };
    }

    if (!preferences || typeof preferences !== 'object') {
      return { statusCode: 400, body: JSON.stringify({ error: 'preferences object is required in body' }) };
    }

    const validCategories = ['SEAT', 'MEAL', 'TRANSPORT', 'WIFI'];
    if (!validCategories.includes(category.toUpperCase())) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid category. Use: ${validCategories.join(', ')}` }) };
    }

    await ddb.send(new PutCommand({
      TableName: PREFERENCES_TABLE,
      Item: {
        PK: `CUSTOMER#${customerId}`,
        SK: `PREF#${category.toUpperCase()}`,
        category: category.toUpperCase(),
        preferences,
        confidence: 'HIGH',
        lastUpdated: new Date().toISOString(),
      },
    }));

    // Send email notification (await to ensure it completes before Lambda freezes)
    const prefSummary = Object.entries(preferences).map(([k, v]) => `${k}: ${v}`).join(', ');
    try {
      await sendPreferenceEmail(customerId, category, prefSummary);
    } catch (e) {
      console.warn('Email notification failed:', e.message);
    }

    // Build speech-friendly summary
    const catName = category.charAt(0) + category.slice(1).toLowerCase();
    const summary = `Your ${catName.toLowerCase()} preferences have been updated.`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, message: `${category} preferences updated`, customerId, category: category.toUpperCase() }),
    };
  } catch (err) {
    console.error('update-preferences error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        summary: "I'm having trouble processing that request right now. Please try again or I can connect you with a live agent.",
      }),
    };
  }
};

// --- Email notification helper ---

async function sendPreferenceEmail(customerId, category, summary) {
  if (!SENDER_EMAIL || !CUSTOMERS_TABLE) return;

  const custResult = await ddb.send(new GetCommand({
    TableName: CUSTOMERS_TABLE,
    Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' },
  }));

  const customer = custResult.Item;
  if (!customer?.email) return;

  const changeType = `${category} Preferences`;

  await ses.send(new SendEmailCommand({
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [customer.email] },
    Message: {
      Subject: { Data: `${COMPANY_NAME} — Preferences Updated: ${category}`, Charset: 'UTF-8' },
      Body: {
        Html: { Data: buildHtml(customer.name, changeType, `Your ${category.toLowerCase()} preferences have been updated: ${summary}.`), Charset: 'UTF-8' },
        Text: { Data: `Hi ${customer.name},\n\nYour ${category.toLowerCase()} preferences have been updated: ${summary}.\n\n— ${COMPANY_NAME}`, Charset: 'UTF-8' },
      },
    },
  }));
  console.log(`Email sent to ${customer.email}: ${changeType}`);
}

function buildHtml(name, changeType, summary) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#E4002B;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:white;margin:0;font-size:20px">${COMPANY_NAME}</h2></div>
    <div style="background:#fff;padding:24px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px">
      <p style="color:#1a1a1a;font-size:16px;margin-top:0">Hi ${name},</p>
      <p style="color:#333;font-size:15px">Your preferences have been updated:</p>
      <div style="background:#f0f9ff;border-left:4px solid #0066cc;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
        <strong style="color:#0066cc;text-transform:capitalize">${changeType}</strong>
        <p style="color:#333;margin:8px 0 0">${summary}</p>
      </div>
      <p style="color:#666;font-size:13px;margin-top:24px">If you did not request this change, please contact us immediately.</p>
      <hr style="border:none;border-top:1px solid #e8e8e8;margin:20px 0"/>
      <p style="color:#999;font-size:12px;margin-bottom:0">Automated notification from ${COMPANY_NAME}.</p>
    </div></div>`;
}
