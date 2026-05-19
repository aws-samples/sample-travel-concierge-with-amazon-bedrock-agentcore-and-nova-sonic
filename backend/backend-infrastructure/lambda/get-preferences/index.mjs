import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const PREFERENCES_TABLE = process.env.PREFERENCES_TABLE;

const spaceOut = (s) => s.split("").join(" ");

export const handler = async (event) => {
  try {
    const { customerId } = event.pathParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId is required' }) };
    }

    const result = await ddb.send(new QueryCommand({
      TableName: PREFERENCES_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}` },
    }));

    const preferences = {};
    for (const item of (result.Items || [])) {
      const category = item.SK.replace('PREF#', '');
      preferences[category] = {
        ...item.preferences,
        confidence: item.confidence,
        lastUpdated: item.lastUpdated,
      };
    }

    // Build speech-friendly summary
    const prefParts = [];
    for (const [category, prefs] of Object.entries(preferences)) {
      const { confidence, lastUpdated, ...values } = prefs;
      for (const [key, val] of Object.entries(values)) {
        if (val && typeof val === 'string') {
          prefParts.push(`${val.toLowerCase()} ${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`);
        } else if (val && typeof val === 'boolean' && val) {
          prefParts.push(`${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`);
        }
      }
    }

    let summary;
    if (prefParts.length === 0) {
      summary = 'You have no saved preferences yet.';
    } else {
      summary = `Your saved preferences are: ${prefParts.join(', ')}.`;
    }

    const response = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, customerId, preferences }),
    };
    
    console.log('=== LAMBDA RESPONSE ===');
    console.log('Response body:', response.body);
    console.log('Summary length:', summary.length);
    console.log('Summary preview:', summary.substring(0, 100));
    console.log('======================');
    
    return response;
  } catch (err) {
    console.error('get-preferences error:', err);
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
