import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const PASSENGERS_TABLE = process.env.PASSENGERS_TABLE;
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Travel Concierge';

const spaceOut = (s) => s.split("").join(" ");

export const handler = async (event) => {
  try {
    const { bookingId, passengerId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    if (!bookingId || !passengerId || !action) {
      return { statusCode: 400, body: JSON.stringify({ error: 'bookingId, passengerId, and action are required' }) };
    }

    let updateExpression, expressionValues, message, summary;

    switch (action) {
      case 'meal': {
        const { mealPreference } = body;
        if (!mealPreference) return { statusCode: 400, body: JSON.stringify({ error: 'mealPreference is required' }) };
        updateExpression = 'SET mealPreference = :meal';
        expressionValues = { ':meal': mealPreference };
        message = `Meal preference updated to ${mealPreference}`;
        summary = `Meal preference updated to ${mealPreference} for the passenger.`;
        break;
      }
      case 'baggage': {
        const { extraChecked } = body;
        if (extraChecked === undefined) return { statusCode: 400, body: JSON.stringify({ error: 'extraChecked count is required' }) };
        updateExpression = 'SET baggageAllowance.extraChecked = :extra';
        expressionValues = { ':extra': extraChecked };
        message = `Extra checked bags updated to ${extraChecked}`;
        summary = `Extra checked bags updated to ${extraChecked}.`;
        break;
      }
      case 'assistance': {
        const { specialAssistance } = body;
        if (!specialAssistance) return { statusCode: 400, body: JSON.stringify({ error: 'specialAssistance list is required' }) };
        updateExpression = 'SET specialAssistance = :assist';
        expressionValues = { ':assist': specialAssistance };
        message = `Special assistance updated`;
        summary = 'Special assistance updated.';
        break;
      }
      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}. Use meal, baggage, or assistance` }) };
    }

    await ddb.send(new UpdateCommand({
      TableName: PASSENGERS_TABLE,
      Key: { PK: `BOOKING#${bookingId}`, SK: `PASSENGER#${passengerId}` },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
    }));

    // Fetch passenger name for the response card
    let passengerName;
    try {
      const paxResult = await ddb.send(new GetCommand({
        TableName: PASSENGERS_TABLE,
        Key: { PK: `BOOKING#${bookingId}`, SK: `PASSENGER#${passengerId}` },
      }));
      passengerName = paxResult.Item?.name;
    } catch (e) {
      console.warn('Could not fetch passenger name:', e.message);
    }

    // Send email notification (await to ensure it completes before Lambda freezes)
    const changeType = action.charAt(0).toUpperCase() + action.slice(1);
    try {
      await sendItineraryEmail(bookingId, changeType, message);
    } catch (e) {
      console.warn('Email notification failed:', e.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, message, bookingId, passengerId, passengerName, action }),
    };
  } catch (err) {
    console.error('update-passenger error:', err);
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

async function sendItineraryEmail(bookingId, changeType, summary) {
  if (!SENDER_EMAIL || !CUSTOMERS_TABLE) return;

  // Get passenger to find customerId
  const paxResult = await ddb.send(new QueryCommand({
    TableName: PASSENGERS_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `BOOKING#${bookingId}` },
    Limit: 1,
  }));

  const customerId = paxResult.Items?.[0]?.GSI1PK?.replace('CUSTOMER#', '');
  if (!customerId) return;

  // Fetch customer profile and booking details in parallel
  const [custResult, bookingResult] = await Promise.all([
    ddb.send(new GetCommand({
      TableName: CUSTOMERS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' },
    })),
    BOOKINGS_TABLE ? ddb.send(new GetCommand({
      TableName: BOOKINGS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `BOOKING#${bookingId}` },
    })).catch(() => null) : Promise.resolve(null),
  ]);

  const customer = custResult.Item;
  if (!customer?.email) return;

  const b = bookingResult?.Item;
  const flightInfo = b?.flightNumber ? `Flight ${b.flightNumber} on ${b.departureDate || ''}` : '';

  await ses.send(new SendEmailCommand({
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [customer.email] },
    Message: {
      Subject: { Data: `${COMPANY_NAME} — Itinerary Update: ${changeType}`, Charset: 'UTF-8' },
      Body: {
        Html: { Data: buildHtml(customer.name, changeType, summary, flightInfo), Charset: 'UTF-8' },
        Text: { Data: `Hi ${customer.name},\n\nYour itinerary has been updated.\n\n${flightInfo ? flightInfo + '\n\n' : ''}${changeType}: ${summary}\n\n— ${COMPANY_NAME}`, Charset: 'UTF-8' },
      },
    },
  }));
  console.log(`Email sent to ${customer.email}: ${changeType}`);
}

function buildHtml(name, changeType, summary, flightInfo) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#E4002B;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:white;margin:0;font-size:20px">${COMPANY_NAME}</h2></div>
    <div style="background:#fff;padding:24px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px">
      <p style="color:#1a1a1a;font-size:16px;margin-top:0">Hi ${name},</p>
      <p style="color:#333;font-size:15px">Your itinerary has been updated:</p>
      ${flightInfo ? `<p style="color:#666;font-size:14px;background:#f8f9fa;padding:12px;border-radius:6px">✈️ ${flightInfo}</p>` : ''}
      <div style="background:#f0f9ff;border-left:4px solid #0066cc;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
        <strong style="color:#0066cc;text-transform:capitalize">${changeType}</strong>
        <p style="color:#333;margin:8px 0 0">${summary}</p>
      </div>
      <p style="color:#666;font-size:13px;margin-top:24px">If you did not request this change, please contact us immediately.</p>
      <hr style="border:none;border-top:1px solid #e8e8e8;margin:20px 0"/>
      <p style="color:#999;font-size:12px;margin-bottom:0">Automated notification from ${COMPANY_NAME}.</p>
    </div></div>`;
}
