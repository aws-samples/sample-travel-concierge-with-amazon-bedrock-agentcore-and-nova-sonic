import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
const PASSENGERS_TABLE = process.env.PASSENGERS_TABLE;
const SEATMAP_TABLE = process.env.SEATMAP_TABLE;
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Travel Concierge';

const spaceOut = (s) => s.split("").join(" ");

const formatDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return isoString; }
};

const formatTime = (isoString) => {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return isoString; }
};

/**
 * Rebook a flight to a new date/flight.
 *
 * Updates the booking record, releases old seats, optionally assigns new seats,
 * and sends an email confirmation.
 *
 * In production, this would call the airline's PSS to issue a new ticket.
 */
export const handler = async (event) => {
  try {
    const { customerId, bookingId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { newFlightNumber, newDate, newDepartureTime, newArrivalTime, fareDifference, selectedSeats } = body;

    if (!customerId || !bookingId || !newFlightNumber || !newDate) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId, bookingId, newFlightNumber, and newDate are required' }) };
    }

    // Get current booking
    const bookingResult = await ddb.send(new GetCommand({
      TableName: BOOKINGS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `BOOKING#${bookingId}` },
    }));

    const booking = bookingResult.Item;
    if (!booking) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: `Booking ${bookingId} not found`,
          summary: `I couldn't find that booking. Could you double-check the booking reference?`,
        }),
      };
    }

    const oldFlight = booking.flightNumber;
    const oldDate = booking.departureTime?.substring(0, 10);

    // Get all passengers for this booking
    const paxResult = await ddb.send(new QueryCommand({
      TableName: PASSENGERS_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `BOOKING#${bookingId}` },
    }));
    const passengers = paxResult.Items || [];

    // Release old seats for all passengers
    for (const pax of passengers) {
      if (pax.seatNumber && oldFlight && oldDate) {
        await ddb.send(new UpdateCommand({
          TableName: SEATMAP_TABLE,
          Key: { PK: `FLIGHT#${oldFlight}#${oldDate}`, SK: `SEAT#${pax.seatNumber}` },
          UpdateExpression: 'SET isAvailable = :true, assignedTo = :null',
          ExpressionAttributeValues: { ':true': true, ':null': null },
        }));
      }
    }

    // Assign new seats if provided
    const seatAssignments = [];
    if (selectedSeats && Array.isArray(selectedSeats) && selectedSeats.length > 0) {
      for (let i = 0; i < Math.min(passengers.length, selectedSeats.length); i++) {
        const pax = passengers[i];
        const newSeat = selectedSeats[i];

        // Mark seat as taken
        await ddb.send(new UpdateCommand({
          TableName: SEATMAP_TABLE,
          Key: { PK: `FLIGHT#${newFlightNumber}#${newDate}`, SK: `SEAT#${newSeat}` },
          UpdateExpression: 'SET isAvailable = :false, assignedTo = :pax',
          ExpressionAttributeValues: { ':false': false, ':pax': `PASSENGER#${pax.SK.replace('PASSENGER#', '')}` },
        }));

        // Update passenger record
        await ddb.send(new UpdateCommand({
          TableName: PASSENGERS_TABLE,
          Key: { PK: pax.PK, SK: pax.SK },
          UpdateExpression: 'SET seatNumber = :seat',
          ExpressionAttributeValues: { ':seat': newSeat },
        }));

        seatAssignments.push({ passenger: pax.name, oldSeat: pax.seatNumber, newSeat });
      }
    } else {
      // Clear seat assignments (will need to be reassigned)
      for (const pax of passengers) {
        await ddb.send(new UpdateCommand({
          TableName: PASSENGERS_TABLE,
          Key: { PK: pax.PK, SK: pax.SK },
          UpdateExpression: 'REMOVE seatNumber',
        }));
        seatAssignments.push({ passenger: pax.name, oldSeat: pax.seatNumber, newSeat: 'TBD' });
      }
    }

    // Update booking record with new flight details
    await ddb.send(new UpdateCommand({
      TableName: BOOKINGS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `BOOKING#${bookingId}` },
      UpdateExpression: 'SET flightNumber = :fn, departureTime = :dt, arrivalTime = :at, #s = :status, rebookedFrom = :old, rebookedAt = :now, GSI1PK = :gsi1pk',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':fn': newFlightNumber,
        ':dt': newDepartureTime || `${newDate}T00:00:00`,
        ':at': newArrivalTime || `${newDate}T23:59:59`,
        ':status': 'REBOOKED',
        ':old': `${oldFlight}#${oldDate}`,
        ':now': new Date().toISOString(),
        ':gsi1pk': `FLIGHT#${newFlightNumber}#${newDate}`,
      },
    }));

    // Send email notification
    try {
      await sendRebookEmail(customerId, oldFlight, oldDate, newFlightNumber, newDate, fareDifference, seatAssignments);
    } catch (e) {
      console.warn('Email notification failed:', e.message);
    }

    // Build speech-friendly summary
    const fn = spaceOut(newFlightNumber);
    const dt = formatDate(newDate);
    const dep = newDepartureTime ? formatTime(newDepartureTime) : '';
    let summary = `Rebooking confirmed. You are now on flight ${fn} on ${dt}`;
    if (dep) summary += ` departing at ${dep}`;
    summary += '.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        message: `Flight rebooked from ${oldFlight} (${oldDate}) to ${newFlightNumber} (${newDate})`,
        bookingId,
        oldFlight: `${oldFlight} on ${oldDate}`,
        newFlight: `${newFlightNumber} on ${newDate}`,
        fareDifference: fareDifference || 0,
        passengersRebooked: passengers.length,
        seatAssignments,
      }),
    };
  } catch (err) {
    console.error('rebook-flight error:', err);
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

// --- Email notification ---

async function sendRebookEmail(customerId, oldFlight, oldDate, newFlight, newDate, fareDifference, seatAssignments) {
  if (!SENDER_EMAIL || !CUSTOMERS_TABLE) return;

  const custResult = await ddb.send(new GetCommand({
    TableName: CUSTOMERS_TABLE,
    Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' },
  }));
  const customer = custResult.Item;
  if (!customer?.email) return;

  const fareText = !fareDifference || fareDifference === 0 ? 'No fare difference'
    : fareDifference > 0 ? `Additional charge: ${fareDifference}`
    : `Credit back: ${Math.abs(fareDifference)}`;

  const seatText = seatAssignments.map(s =>
    `${s.passenger}: ${s.oldSeat || 'none'} → ${s.newSeat}`
  ).join('<br/>');

  const summary = `Your flight has been rebooked from ${oldFlight} (${oldDate}) to ${newFlight} (${newDate}). ${fareText}.`;

  const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#0066CC;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:white;margin:0;font-size:20px">${COMPANY_NAME}</h2></div>
    <div style="background:#fff;padding:24px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px">
      <p style="color:#1a1a1a;font-size:16px;margin-top:0">Hi ${customer.name},</p>
      <p style="color:#333;font-size:15px">Your flight has been rebooked:</p>
      <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0">
        <p style="margin:0 0 8px;color:#666;text-decoration:line-through">✈️ ${oldFlight} on ${oldDate}</p>
        <p style="margin:0;color:#0066CC;font-weight:600">✈️ ${newFlight} on ${newDate}</p>
      </div>
      <div style="background:#f0f9ff;border-left:4px solid #0066CC;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
        <strong style="color:#0066CC">Fare Adjustment</strong>
        <p style="color:#333;margin:8px 0 0">${fareText}</p>
      </div>
      <div style="margin:16px 0">
        <strong style="color:#333">Seat Assignments</strong>
        <p style="color:#666;margin:8px 0 0">${seatText}</p>
      </div>
      <hr style="border:none;border-top:1px solid #e8e8e8;margin:20px 0"/>
      <p style="color:#999;font-size:12px;margin-bottom:0">Automated notification from ${COMPANY_NAME}.</p>
    </div></div>`;

  await ses.send(new SendEmailCommand({
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [customer.email] },
    Message: {
      Subject: { Data: `${COMPANY_NAME} — Flight Rebooked: ${newFlight} on ${newDate}`, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: `Hi ${customer.name},\n\n${summary}\n\nSeat assignments:\n${seatAssignments.map(s => `${s.passenger}: ${s.oldSeat || 'none'} → ${s.newSeat}`).join('\n')}\n\n— ${COMPANY_NAME}`, Charset: 'UTF-8' },
      },
    },
  }));
  console.log(`Rebook email sent to ${customer.email}`);
}
