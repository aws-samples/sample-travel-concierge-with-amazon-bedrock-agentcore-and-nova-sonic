import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const SEATMAP_TABLE = process.env.SEATMAP_TABLE;

const spaceOut = (s) => s.split("").join(" ");

const formatDate = (isoString) => {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return isoString; }
};

export const handler = async (event) => {
  try {
    const { flightNumber, date } = event.pathParameters || {};
    if (!flightNumber || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'flightNumber and date are required' }) };
    }

    // Optional seatType filter: AISLE, WINDOW, or MIDDLE
    const seatTypeFilter = (event.queryStringParameters?.seatType || '').toUpperCase() || null;

    const result = await ddb.send(new QueryCommand({
      TableName: SEATMAP_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `FLIGHT#${flightNumber}#${date}` },
    }));

    const allSeats = (result.Items || []).map(item => {
      const { PK, SK, ...seat } = item;
      return seat;
    });

    // Apply seatType filter if provided — only to available seats shown to user
    const seats = seatTypeFilter
      ? allSeats.filter(s => s.seatType?.toUpperCase() === seatTypeFilter)
      : allSeats;

    // Group by cabin for easier consumption
    const byCabin = {};
    for (const seat of seats) {
      const cabin = seat.cabin || 'ECONOMY';
      if (!byCabin[cabin]) byCabin[cabin] = [];
      byCabin[cabin].push(seat);
    }

    const totalSeats = seatTypeFilter ? seats.length : allSeats.length;
    const available = seats.filter(s => s.isAvailable).length;

    // Build speech-friendly summary
    const fn = spaceOut(flightNumber);
    const dt = formatDate(date);
    const typeLabel = seatTypeFilter
      ? seatTypeFilter.charAt(0) + seatTypeFilter.slice(1).toLowerCase()
      : null;

    let summary = typeLabel
      ? `Flight ${fn} on ${dt} has ${available} available ${typeLabel} seats.`
      : `Flight ${fn} on ${dt} has ${available} available seats out of ${totalSeats}.`;

    // Add cabin row ranges (only when not filtered — filtered view is already specific)
    if (!seatTypeFilter) {
      const cabinSummaries = [];
      for (const [cabin, cabinSeats] of Object.entries(byCabin)) {
        const rows = cabinSeats.map(s => s.row).filter(Boolean);
        if (rows.length > 0) {
          const minRow = Math.min(...rows);
          const maxRow = Math.max(...rows);
          cabinSummaries.push(`${cabin.charAt(0) + cabin.slice(1).toLowerCase()} rows ${minRow} through ${maxRow}`);
        }
      }
      if (cabinSummaries.length > 0) {
        summary += ` ${cabinSummaries.join(', ')}.`;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary, flightNumber, date,
        totalSeats, availableSeats: available,
        seatType: seatTypeFilter || null,
        seats, byCabin,
      }),
    };
  } catch (err) {
    console.error('get-seat-map error:', err);
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
