import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE;

const spaceOut = (s) => s.split("").join(" ");

/**
 * Log an escalation to a human agent.
 *
 * Records the escalation reason, priority, and conversation context
 * in the conversations table for the human agent to review.
 */
export const handler = async (event) => {
  try {
    const { customerId, sessionId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { reason, priority, context, customerName } = body;

    if (!customerId || !sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId and sessionId are required' }) };
    }

    if (!reason) {
      return { statusCode: 400, body: JSON.stringify({ error: 'reason is required' }) };
    }

    const now = new Date();
    const referenceNumber = `ESC-${customerId.replace('CUST-', '')}-${now.getTime().toString(36).toUpperCase()}`;
    const ttl = Math.floor(now.getTime() / 1000) + (90 * 24 * 60 * 60); // 90 days

    await ddb.send(new PutCommand({
      TableName: CONVERSATIONS_TABLE,
      Item: {
        PK: `CUSTOMER#${customerId}`,
        SK: `ESCALATION#${sessionId}#${now.toISOString()}`,
        type: 'ESCALATION',
        sessionId,
        referenceNumber,
        reason,
        priority: priority || 'NORMAL',
        context: context || '',
        customerName: customerName || '',
        status: 'PENDING',
        createdAt: now.toISOString(),
        ttl,
      },
    }));

    // Simulated queue — in production this would return real queue data
    const queuePosition = Math.floor(Math.random() * 3) + 1;
    const estimatedWaitMinutes = queuePosition * 2;

    // Support phone number — configurable via SUPPORT_PHONE env var
    const supportPhone = process.env.SUPPORT_PHONE || '';

    // Build speech-friendly summary
    const summary = `I've created escalation reference ${spaceOut(referenceNumber)}. A live agent will be with you shortly.`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        message: 'Escalation logged successfully',
        referenceNumber,
        queuePosition,
        estimatedWaitMinutes,
        supportPhone,
        helpdeskHours: 'Available 24/7',
        note: 'A live agent will have access to your full conversation history and itinerary.',
      }),
    };
  } catch (err) {
    console.error('escalate-to-agent error:', err);
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
