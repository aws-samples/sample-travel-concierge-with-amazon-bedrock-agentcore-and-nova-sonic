import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE;

/**
 * Save a conversation message to the session history.
 *
 * Called by the agent via MCP tool after each turn.
 * Creates the session on first message, appends on subsequent ones.
 *
 * Body: {
 *   role: "user" | "assistant",
 *   content: "message text",
 *   customerName: "optional — set on first message"
 * }
 */
export const handler = async (event) => {
  try {
    const { customerId, sessionId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { role, content, customerName } = body;

    if (!customerId || !sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId and sessionId are required' }) };
    }

    if (!role || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'role and content are required' }) };
    }

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

    const message = { role, content, timestamp: now };

    // Append message to session. Creates the item if it doesn't exist.
    await ddb.send(new UpdateCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: {
        PK: `CUSTOMER#${customerId}`,
        SK: `SESSION#${sessionId}`,
      },
      UpdateExpression: `
        SET messages = list_append(if_not_exists(messages, :empty), :msg),
            updatedAt = :now,
            #ttl = :ttl,
            startedAt = if_not_exists(startedAt, :now)
            ${customerName ? ', customerName = if_not_exists(customerName, :name)' : ''}
      `,
      ExpressionAttributeNames: {
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':msg': [message],
        ':empty': [],
        ':now': now,
        ':ttl': ttl,
        ...(customerName ? { ':name': customerName } : {}),
      },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'Conversation saved.', message: 'Conversation saved', customerId, sessionId, role }),
    };
  } catch (err) {
    console.error('save-conversation error:', err);
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
