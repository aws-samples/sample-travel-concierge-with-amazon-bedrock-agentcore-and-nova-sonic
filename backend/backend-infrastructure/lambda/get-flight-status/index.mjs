import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const FLIGHT_STATUS_TABLE = process.env.FLIGHT_STATUS_TABLE;

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
 * Get real-time flight status including delays, gate changes, and cancellations.
 *
 * Returns: status, scheduled/estimated times, gate, terminal, delay info, alerts.
 * In production, this would call an airline OpsDB or FlightAware API.
 */
export const handler = async (event) => {
  try {
    const { flightNumber, date } = event.pathParameters || {};

    if (!flightNumber || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'flightNumber and date are required' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: FLIGHT_STATUS_TABLE,
      Key: {
        PK: `FLIGHT#${flightNumber}#${date}`,
        SK: 'STATUS',
      },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `No status found for flight ${flightNumber} on ${date}`,
          summary: `I couldn't find status information for flight ${spaceOut(flightNumber)} on ${formatDate(date)}.`,
        }),
      };
    }

    // Remove internal keys from response
    const { PK, SK, ...status } = result.Item;

    // Build speech-friendly summary
    const fn = spaceOut(flightNumber);
    const dt = formatDate(date);
    const flightStatus = (status.status || 'unknown').toLowerCase();

    let summary;
    if (flightStatus === 'delayed' || status.delayMinutes > 0) {
      const delayMins = status.delayMinutes || 0;
      const newDep = status.estimatedDeparture ? formatTime(status.estimatedDeparture) : '';
      const gate = status.departureGate ? spaceOut(status.departureGate) : '';
      const prevGate = status.previousGate ? spaceOut(status.previousGate) : '';

      summary = `Flight ${fn} on ${dt} is delayed by ${delayMins} minutes.`;
      if (newDep) summary += ` New departure at ${newDep}`;
      if (gate) summary += ` from gate ${gate}`;
      if (newDep || gate) summary += '.';
      if (prevGate) summary += ` Previous gate was ${prevGate}.`;
    } else {
      const dep = status.scheduledDeparture ? formatTime(status.scheduledDeparture) : '';
      const gate = status.departureGate ? spaceOut(status.departureGate) : '';

      summary = `Flight ${fn} on ${dt} is ${flightStatus}.`;
      if (dep && gate) {
        summary += ` Departing from gate ${gate} at ${dep}.`;
      } else if (dep) {
        summary += ` Departing at ${dep}.`;
      } else if (gate) {
        summary += ` Departing from gate ${gate}.`;
      }
    }

    console.log('=== LAMBDA RESPONSE (get-flight-status) ===');
    console.log('Flight:', flightNumber, 'Date:', date);
    console.log('Summary:', summary);
    console.log('==========================================');
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, ...status, flightNumber, date }),
    };
  } catch (err) {
    console.error('get-flight-status error:', err);
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
