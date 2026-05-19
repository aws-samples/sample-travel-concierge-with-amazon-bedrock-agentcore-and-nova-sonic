import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;

const spaceOut = (s) => s.split("").join(" ");

const formatDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return isoString; }
};

const formatSeat = (seat) => {
  if (!seat) return '';
  const match = seat.match(/^(\d+)([A-Za-z]+)$/);
  if (match) return `${match[1]} ${match[2]}`;
  return seat;
};

export const handler = async (event) => {
  try {
    const { customerId, bookingId } = event.pathParameters || {};
    if (!customerId || !bookingId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId and bookingId are required' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: BOOKINGS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `BOOKING#${bookingId}` },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Booking not found',
          summary: `I couldn't find a booking with that ID. Could you double-check the booking reference?`,
        }),
      };
    }

    const { PK, SK, GSI1PK, GSI1SK, ...booking } = result.Item;

    // Build speech-friendly summary
    const parts = [];
    const bId = booking.bookingId || bookingId;
    parts.push(`Booking ${spaceOut(bId)}`);
    if (booking.confirmationCode) parts[0] += `, confirmation ${spaceOut(booking.confirmationCode)}`;

    if (booking.flightNumber) {
      const fn = spaceOut(booking.flightNumber);
      const from = booking.departureAirport || booking.departureCity || '';
      const to = booking.arrivalAirport || booking.arrivalCity || '';
      const dt = booking.departureTime ? formatDate(booking.departureTime) : '';
      let flightPart = `Flight ${fn}`;
      if (from && to) flightPart += ` from ${from} to ${to}`;
      if (dt) flightPart += ` on ${dt}`;
      parts.push(flightPart);
    }

    if (booking.status) parts.push(`Status: ${booking.status.toLowerCase()}`);
    if (booking.partySize) parts.push(`${booking.partySize} passenger${booking.partySize > 1 ? 's' : ''}`);

    const summary = parts.join('. ') + '.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, ...booking }),
    };
  } catch (err) {
    console.error('get-booking-details error:', err);
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
