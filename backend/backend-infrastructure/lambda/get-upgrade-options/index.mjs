import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
const SEATMAP_TABLE = process.env.SEATMAP_TABLE;

const spaceOut = (s) => s.split("").join(" ");

// Upgrade pricing (simplified)
const UPGRADE_PRICING = {
  'ECONOMY->PREMIUM_ECONOMY': { miles: 10000, coPay: 75, cashRange: '$75-$200' },
  'ECONOMY->BUSINESS': { miles: 25000, coPay: 150, cashRange: '$200-$600' },
  'PREMIUM_ECONOMY->BUSINESS': { miles: 15000, coPay: 100, cashRange: '$150-$400' },
  'BUSINESS->FIRST': { miles: 20000, coPay: 200, cashRange: '$300-$800' },
};

const formatCabin = (cabin) => {
  const names = {
    ECONOMY: 'Economy',
    PREMIUM_ECONOMY: 'Premium Economy',
    BUSINESS: 'Business Class',
    FIRST: 'First Class',
  };
  return names[cabin] || cabin;
};

export const handler = async (event) => {
  try {
    const { bookingId } = event.pathParameters || {};
    const customerId = event.queryStringParameters?.customerId;

    if (!bookingId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'bookingId is required' }) };
    }

    // Get booking to determine current fare class
    // We need customerId to construct the PK
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId query parameter is required' }) };
    }

    const booking = await ddb.send(new GetCommand({
      TableName: BOOKINGS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `BOOKING#${bookingId}` },
    }));

    if (!booking.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Booking not found',
          summary: `I couldn't find that booking. Could you double-check the booking reference?`,
        }),
      };
    }

    const fareClass = booking.Item.fareClass || 'ECONOMY';
    const upgrades = [];

    // Determine available upgrades based on current fare class
    const upgradeMap = {
      ECONOMY: ['PREMIUM_ECONOMY', 'BUSINESS'],
      PREMIUM_ECONOMY: ['BUSINESS'],
      BUSINESS: ['FIRST'],
      FIRST: [],
    };

    for (const target of (upgradeMap[fareClass] || [])) {
      const key = `${fareClass}->${target}`;
      const pricing = UPGRADE_PRICING[key];
      if (pricing) {
        upgrades.push({
          from: fareClass,
          to: target,
          milesRequired: pricing.miles,
          coPay: pricing.coPay,
          estimatedCashPrice: pricing.cashRange,
          available: true, // Simplified — would check actual cabin availability
        });
      }
    }

    // Build speech-friendly summary
    const fn = booking.Item.flightNumber ? spaceOut(booking.Item.flightNumber) : '';
    let summary;
    if (upgrades.length === 0) {
      summary = `No upgrade options are available for your current fare class.`;
    } else {
      const parts = upgrades.map(u => {
        const targetName = formatCabin(u.to);
        const points = u.milesRequired.toLocaleString('en-US');
        return `${targetName} for ${points} points or ${u.estimatedCashPrice}`;
      });
      summary = `Upgrade options for flight ${fn}: ${parts.join(', ')}.`;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        bookingId,
        currentFareClass: fareClass,
        flightNumber: booking.Item.flightNumber,
        upgrades,
      }),
    };
  } catch (err) {
    console.error('get-upgrade-options error:', err);
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
