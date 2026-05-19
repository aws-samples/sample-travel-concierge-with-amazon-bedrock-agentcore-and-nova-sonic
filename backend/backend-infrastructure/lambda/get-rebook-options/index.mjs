import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const FLIGHT_STATUS_TABLE = process.env.FLIGHT_STATUS_TABLE;
const SEATMAP_TABLE = process.env.SEATMAP_TABLE;
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;

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
 * Get rebooking options for a flight.
 *
 * Finds alternative flights on the same route, checks seat availability,
 * calculates fare differences, and identifies group seating options.
 *
 * In production, this would call the airline's PSS (Amadeus/Sabre).
 */
export const handler = async (event) => {
  try {
    const { customerId, bookingId } = event.pathParameters || {};

    if (!customerId || !bookingId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId and bookingId are required' }) };
    }

    // Get the current booking
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

    // Get current flight status to know the route and current fare
    const currentFlight = booking.flightNumber;
    const currentDate = booking.departureTime?.substring(0, 10);
    const currentStatusResult = await ddb.send(new GetCommand({
      TableName: FLIGHT_STATUS_TABLE,
      Key: { PK: `FLIGHT#${currentFlight}#${currentDate}`, SK: 'STATUS' },
    }));

    const currentStatus = currentStatusResult.Item;
    const route = currentStatus?.route || `${booking.departureAirport}-${booking.arrivalAirport}`;
    const currentFare = currentStatus?.baseFare || 289;
    const partySize = booking.partySize || 1;

    // Scan flight status table for alternative flights on the same route
    // In production, this would be a targeted query to a schedule/inventory API
    const scanResult = await ddb.send(new ScanCommand({
      TableName: FLIGHT_STATUS_TABLE,
      FilterExpression: '#route = :route AND #status <> :arrived AND #status <> :cancelled AND PK <> :currentPK',
      ExpressionAttributeNames: {
        '#route': 'route',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':route': route,
        ':arrived': 'ARRIVED',
        ':cancelled': 'CANCELLED',
        ':currentPK': `FLIGHT#${currentFlight}#${currentDate}`,
      },
    }));

    const alternatives = scanResult.Items || [];

    // For each alternative, check seat availability
    const options = [];
    for (const alt of alternatives) {
      const altFlight = alt.flightNumber;
      const altDate = alt.date;

      // Query seat map for available seats
      const seatResult = await ddb.send(new QueryCommand({
        TableName: SEATMAP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `FLIGHT#${altFlight}#${altDate}` },
      }));

      const allSeats = seatResult.Items || [];
      const availableSeats = allSeats.filter(s => s.isAvailable);
      const totalSeats = allSeats.length;

      // Find adjacent group seating options
      const groupOptions = findAdjacentSeats(availableSeats, partySize);

      // Calculate fare difference
      const altFare = alt.baseFare || 289;
      const fareDifference = Number(altFare) - Number(currentFare);

      // Categorize available seats by type
      const seatsByType = {
        aisle: availableSeats.filter(s => s.seatType === 'AISLE').length,
        window: availableSeats.filter(s => s.seatType === 'WINDOW').length,
        middle: availableSeats.filter(s => s.seatType === 'MIDDLE').length,
        extraLegroom: availableSeats.filter(s => s.isExtraLegroom).length,
      };

      options.push({
        flightNumber: altFlight,
        date: altDate,
        scheduledDeparture: alt.scheduledDeparture,
        scheduledArrival: alt.scheduledArrival,
        status: alt.status,
        aircraft: alt.aircraft,
        fareClass: alt.fareClass,
        baseFare: Number(altFare),
        fareDifference,
        fareDifferenceDisplay: fareDifference === 0 ? 'No fare difference'
          : fareDifference > 0 ? `+${fareDifference} additional`
          : `-${Math.abs(fareDifference)} credit back`,
        availableSeats: availableSeats.length,
        totalSeats,
        occupancyPercent: Math.round(((totalSeats - availableSeats.length) / totalSeats) * 100),
        seatsByType,
        hasAdjacentGroupSeats: groupOptions.length > 0,
        adjacentGroupOptions: groupOptions.slice(0, 3), // Top 3 group options
        gate: alt.departureGate,
        terminal: alt.terminal,
      });
    }

    // Sort: on-time first, then by fare difference
    options.sort((a, b) => {
      if (a.status === 'DELAYED' && b.status !== 'DELAYED') return 1;
      if (a.status !== 'DELAYED' && b.status === 'DELAYED') return -1;
      return a.fareDifference - b.fareDifference;
    });

    // Build speech-friendly summary
    let summary;
    if (options.length === 0) {
      summary = 'I could not find any alternative flights on the same route right now.';
    } else {
      const cap = 3;
      const shown = options.slice(0, cap);
      const optionParts = shown.map((opt, i) => {
        const fn = spaceOut(opt.flightNumber);
        const dt = formatDate(opt.date);
        const dep = opt.scheduledDeparture ? formatTime(opt.scheduledDeparture) : '';
        let fare = '';
        if (opt.fareDifference === 0) fare = 'same fare';
        else if (opt.fareDifference > 0) fare = `$${opt.fareDifference} more`;
        else fare = `$${Math.abs(opt.fareDifference)} less`;

        let part = `Option ${i + 1}: ${fn} on ${dt}`;
        if (dep) part += ` at ${dep}`;
        part += `, ${fare}`;
        return part;
      });

      summary = `Found ${options.length} alternative flight${options.length > 1 ? 's' : ''} on the same route. ${optionParts.join('. ')}.`;
      if (options.length > cap) {
        summary += ` And ${options.length - cap} more option${options.length - cap > 1 ? 's' : ''}.`;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        currentBooking: {
          bookingId,
          flightNumber: currentFlight,
          date: currentDate,
          route,
          currentFare: Number(currentFare),
          partySize,
          status: currentStatus?.status || 'UNKNOWN',
          delayMinutes: currentStatus?.delayMinutes || 0,
        },
        rebookOptions: options,
        optionCount: options.length,
      }),
    };
  } catch (err) {
    console.error('get-rebook-options error:', err);
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

/**
 * Find groups of N adjacent available seats in the same row.
 */
function findAdjacentSeats(availableSeats, partySize) {
  if (partySize <= 1) return [];

  const byRow = {};
  for (const seat of availableSeats) {
    if (!byRow[seat.row]) byRow[seat.row] = [];
    byRow[seat.row].push(seat);
  }

  const groups = [];
  for (const [row, seats] of Object.entries(byRow)) {
    seats.sort((a, b) => a.column.localeCompare(b.column));

    for (let i = 0; i <= seats.length - partySize; i++) {
      const group = [seats[i]];
      for (let j = 1; j < partySize; j++) {
        const prev = group[group.length - 1];
        const next = seats[i + j];
        if (next && next.column.charCodeAt(0) === prev.column.charCodeAt(0) + 1) {
          group.push(next);
        } else break;
      }
      if (group.length === partySize) {
        groups.push(group.map(s => ({
          seatNumber: s.seatNumber,
          seatType: s.seatType,
          isExtraLegroom: s.isExtraLegroom,
          price: s.price,
        })));
      }
    }
  }

  return groups;
}
