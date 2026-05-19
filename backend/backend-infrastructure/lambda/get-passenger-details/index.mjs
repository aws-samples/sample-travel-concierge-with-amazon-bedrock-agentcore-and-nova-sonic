import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const PASSENGERS_TABLE = process.env.PASSENGERS_TABLE;
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;

const spaceOut = (s) => s.split("").join(" ");

const formatSeat = (seat) => {
  if (!seat) return 'no seat assigned';
  const match = seat.match(/^(\d+)([A-Za-z]+)$/);
  if (match) return `${match[1]} ${match[2]}`;
  return seat;
};

export const handler = async (event) => {
  try {
    const { bookingId } = event.pathParameters || {};
    if (!bookingId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'bookingId is required' }) };
    }

    // Fetch passengers and booking details in parallel
    const [paxResult, bookingResult] = await Promise.all([
      ddb.send(new QueryCommand({
        TableName: PASSENGERS_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `BOOKING#${bookingId}` },
      })),
      BOOKINGS_TABLE ? ddb.send(new ScanCommand({
        TableName: BOOKINGS_TABLE,
        FilterExpression: 'bookingId = :bid',
        ExpressionAttributeValues: { ':bid': bookingId },
        Limit: 10,
      })) : Promise.resolve(null),
    ]);

    const passengers = (paxResult.Items || []).map(item => {
      const { PK, SK, GSI1PK, GSI1SK, ...passenger } = item;
      return passenger;
    });

    // Extract flight info from booking
    const booking = bookingResult?.Items?.[0];
    const flightNumber = booking?.flightNumber || null;
    const departureAirport = booking?.departureAirport || null;
    const arrivalAirport = booking?.arrivalAirport || null;
    const departureTime = booking?.departureTime || null;

    // Build speech-friendly summary
    let summary;
    if (passengers.length === 0) {
      summary = `No passengers found for booking ${spaceOut(bookingId)}.`;
    } else {
      const paxDescriptions = passengers.map(p => {
        const name = p.name || 'unnamed passenger';
        const seat = formatSeat(p.seatNumber);
        return `${name} in seat ${seat}`;
      });

      summary = `Booking ${spaceOut(bookingId)} has ${passengers.length} passenger${passengers.length > 1 ? 's' : ''}.\n`;
      summary += paxDescriptions.join('\n');
      summary += '.';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, bookingId, flightNumber, departureAirport, arrivalAirport, departureTime, passengers }),
    };
  } catch (err) {
    console.error('get-passenger-details error:', err);
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
