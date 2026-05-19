import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;

const spaceOut = (s) => s.split("").join(" ");

const formatDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return isoString; }
};

export const handler = async (event) => {
  try {
    const customerId = event.pathParameters?.customerId;
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId is required' }) };
    }

    const now = new Date().toISOString();

    // Query all bookings for this customer
    const result = await ddb.send(new QueryCommand({
      TableName: BOOKINGS_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}` },
    }));

    // Filter to upcoming flight bookings and sort by departure date
    const bookings = (result.Items || [])
      .filter(item => {
        if (item.bookingType === 'FLIGHT') return item.departureTime > now;
        return false;
      })
      .sort((a, b) => {
        const dateA = a.departureTime || '';
        const dateB = b.departureTime || '';
        return dateA.localeCompare(dateB);
      })
      .map(item => {
        const { PK, SK, GSI1PK, GSI1SK, ...booking } = item;
        return booking;
      });

    // Build speech-friendly summary
    let summary;
    if (bookings.length === 0) {
      summary = 'You have no upcoming flights.';
    } else {
      const cap = 3;
      const shown = bookings.slice(0, cap);
      const flightDescriptions = shown.map(b => {
        const fn = b.flightNumber ? spaceOut(b.flightNumber) : 'unknown flight';
        const from = b.departureAirport || b.departureCity || 'unknown origin';
        const to = b.arrivalAirport || b.arrivalCity || 'unknown destination';
        const dt = b.departureTime ? formatDate(b.departureTime) : 'unknown date';
        // Include bookingId so the agent can use it for follow-up tool calls
        const bid = b.bookingId ? ` (booking ${b.bookingId})` : '';
        return `${fn} from ${from} to ${to} on ${dt}${bid}`;
      });

      const flightWord = bookings.length === 1 ? 'flight' : 'flights';
      summary = `You have ${bookings.length} upcoming ${flightWord}.\n${flightDescriptions.join('\n')}`;
      if (bookings.length > cap) {
        summary += `\nand ${bookings.length - cap} more`;
      }
      summary += '.';
    }

    const response = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, bookings }),
    };
    
    console.log('=== LAMBDA RESPONSE ===');
    console.log('Response body:', response.body);
    console.log('Summary length:', summary.length);
    console.log('Summary preview:', summary.substring(0, 100));
    console.log('======================');
    
    return response;
  } catch (err) {
    console.error('get-upcoming-itinerary error:', err);
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
