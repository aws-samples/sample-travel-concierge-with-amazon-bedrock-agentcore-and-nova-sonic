import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const SEATMAP_TABLE = process.env.SEATMAP_TABLE;
const PASSENGERS_TABLE = process.env.PASSENGERS_TABLE;
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Travel Concierge';

const spaceOut = (s) => s.split("").join(" ");

const formatSeat = (seat) => {
  if (!seat) return 'unassigned';
  const match = seat.match(/^(\d+)([A-Za-z]+)$/);
  if (match) return `${match[1]} ${match[2]}`;
  return seat;
};

const formatDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return isoString; }
};

export const handler = async (event) => {
  try {
    const { bookingId, passengerId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { flightNumber, date, newSeat, action, partySize } = body;

    if (!bookingId || !passengerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'bookingId and passengerId are required' }) };
    }

    // Action: find-group-seats — find N adjacent available seats
    if (action === 'find-group-seats') {
      if (!flightNumber || !date || !partySize) {
        return { statusCode: 400, body: JSON.stringify({ error: 'flightNumber, date, and partySize required for group seat search' }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: SEATMAP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `FLIGHT#${flightNumber}#${date}` },
      }));

      const seats = (result.Items || []).filter(s => s.isAvailable).sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column.localeCompare(b.column);
      });

      const groups = [];
      for (let i = 0; i <= seats.length - partySize; i++) {
        const group = [seats[i]];
        for (let j = 1; j < partySize; j++) {
          const prev = group[group.length - 1];
          const next = seats[i + j];
          if (next && next.row === prev.row && next.column.charCodeAt(0) === prev.column.charCodeAt(0) + 1) {
            group.push(next);
          } else break;
        }
        if (group.length === partySize) {
          groups.push(group.map(s => ({ seatNumber: s.seatNumber, row: s.row, column: s.column, seatType: s.seatType, cabin: s.cabin, isExtraLegroom: s.isExtraLegroom, price: s.price })));
        }
      }

      const groupOptions = groups.slice(0, 5);

      // Build speech-friendly summary for group seats
      let summary;
      if (groupOptions.length === 0) {
        summary = `I couldn't find ${partySize} adjacent seats on flight ${spaceOut(flightNumber)}. Would you like me to show available individual seats?`;
      } else {
        const firstGroup = groupOptions[0];
        const seatList = firstGroup.map(s => formatSeat(s.seatNumber)).join(', ');
        summary = `Found ${groupOptions.length} group${groupOptions.length > 1 ? 's' : ''} of ${partySize} adjacent seats. First option: row ${firstGroup[0].row}: ${seatList}.`;
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      };
    }

    // Default action: change seat
    if (!flightNumber || !date || !newSeat) {
      return { statusCode: 400, body: JSON.stringify({ error: 'flightNumber, date, and newSeat are required' }) };
    }

    // Check new seat availability AND get current passenger in parallel
    const [seatCheck, passenger] = await Promise.all([
      ddb.send(new GetCommand({
        TableName: SEATMAP_TABLE,
        Key: { PK: `FLIGHT#${flightNumber}#${date}`, SK: `SEAT#${newSeat}` },
      })),
      ddb.send(new GetCommand({
        TableName: PASSENGERS_TABLE,
        Key: { PK: `BOOKING#${bookingId}`, SK: `PASSENGER#${passengerId}` },
      })),
    ]);

    if (!seatCheck.Item || !seatCheck.Item.isAvailable) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Seat ${newSeat} is not available`,
          summary: `Seat ${formatSeat(newSeat)} is not available on flight ${spaceOut(flightNumber)}. Would you like me to show available seats?`,
        }),
      };
    }

    const oldSeat = passenger.Item?.seatNumber;

    // Run all seat updates in parallel: release old, assign new, update passenger
    const writeOps = [
      // Assign new seat
      ddb.send(new UpdateCommand({
        TableName: SEATMAP_TABLE,
        Key: { PK: `FLIGHT#${flightNumber}#${date}`, SK: `SEAT#${newSeat}` },
        UpdateExpression: 'SET isAvailable = :false, assignedTo = :passenger',
        ExpressionAttributeValues: { ':false': false, ':passenger': `PASSENGER#${passengerId}` },
      })),
      // Update passenger record
      ddb.send(new UpdateCommand({
        TableName: PASSENGERS_TABLE,
        Key: { PK: `BOOKING#${bookingId}`, SK: `PASSENGER#${passengerId}` },
        UpdateExpression: 'SET seatNumber = :seat',
        ExpressionAttributeValues: { ':seat': newSeat },
      })),
    ];

    // Release old seat if exists
    if (oldSeat) {
      writeOps.push(ddb.send(new UpdateCommand({
        TableName: SEATMAP_TABLE,
        Key: { PK: `FLIGHT#${flightNumber}#${date}`, SK: `SEAT#${oldSeat}` },
        UpdateExpression: 'SET isAvailable = :true, assignedTo = :null',
        ExpressionAttributeValues: { ':true': true, ':null': null },
      })));
    }

    await Promise.all(writeOps);

    // Send email notification (await to ensure it completes before Lambda freezes)
    try {
      await sendItineraryEmail(bookingId, 'Seat Change',
        `Your seat has been changed from ${oldSeat || 'unassigned'} to ${newSeat} on flight ${flightNumber} (${date}).`,
        { flightNumber, date });
    } catch (e) {
      console.warn('Email notification failed:', e.message);
    }

    // Build speech-friendly summary
    const summary = `Done. Seat changed from ${formatSeat(oldSeat)} to ${formatSeat(newSeat)} on flight ${spaceOut(flightNumber)}.`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, message: `Seat changed from ${oldSeat || 'none'} to ${newSeat}`, bookingId, passengerId, newSeat }),
    };
  } catch (err) {
    console.error('update-seat error:', err);
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

async function sendItineraryEmail(bookingId, changeType, summary, flightContext) {
  if (!SENDER_EMAIL || !CUSTOMERS_TABLE) return;

  // Resolve customer from booking via passenger record
  const paxResult = await ddb.send(new QueryCommand({
    TableName: PASSENGERS_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `BOOKING#${bookingId}` },
    Limit: 1,
  }));

  const customerId = paxResult.Items?.[0]?.GSI1PK?.replace('CUSTOMER#', '');
  if (!customerId) return;

  const custResult = await ddb.send(new GetCommand({
    TableName: CUSTOMERS_TABLE,
    Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' },
  }));

  const customer = custResult.Item;
  if (!customer?.email) return;

  const flightInfo = flightContext
    ? `Flight ${flightContext.flightNumber || ''} on ${flightContext.date || ''}`
    : '';

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
