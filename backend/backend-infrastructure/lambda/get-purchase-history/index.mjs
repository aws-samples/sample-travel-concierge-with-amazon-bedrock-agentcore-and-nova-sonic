import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const PURCHASE_HISTORY_TABLE = process.env.PURCHASE_HISTORY_TABLE;

const spaceOut = (s) => s.split("").join(" ");

export const handler = async (event) => {
  try {
    const { customerId } = event.pathParameters || {};
    const category = event.queryStringParameters?.category; // Optional filter: WIFI, LOUNGE, UPGRADE, etc.

    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId is required' }) };
    }

    let result;

    if (category) {
      // Use GSI1 to query by customer + category
      result = await ddb.send(new QueryCommand({
        TableName: PURCHASE_HISTORY_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: { ':gsi1pk': `CUSTOMER#${customerId}#CATEGORY#${category}` },
        ScanIndexForward: false, // Most recent first
      }));
    } else {
      // Query all purchases for customer
      result = await ddb.send(new QueryCommand({
        TableName: PURCHASE_HISTORY_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}` },
        ScanIndexForward: false,
      }));
    }

    const purchases = (result.Items || []).map(item => {
      const { PK, SK, GSI1PK, GSI1SK, ...purchase } = item;
      return purchase;
    });

    // Compute category summary for upsell intelligence
    const categorySummary = {};
    for (const p of purchases) {
      const cat = p.category || 'OTHER';
      if (!categorySummary[cat]) categorySummary[cat] = { count: 0, totalSpent: 0 };
      categorySummary[cat].count++;
      categorySummary[cat].totalSpent += p.amount || 0;
    }

    // Build speech-friendly summary
    let summary;
    if (purchases.length === 0) {
      summary = 'You have no recent purchases on file.';
    } else {
      const catParts = Object.entries(categorySummary).map(([cat, info]) => {
        const catName = cat.charAt(0) + cat.slice(1).toLowerCase();
        return `${info.count} ${catName}${info.count > 1 ? '' : ''}`;
      });

      summary = `You have ${purchases.length} recent purchase${purchases.length > 1 ? 's' : ''}`;
      if (catParts.length > 0) {
        summary += ` including ${catParts.join(' and ')}`;
      }
      summary += '.';
    }

    const response = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, customerId, purchases, count: purchases.length, categorySummary, filter: category || 'ALL' }),
    };
    
    console.log('=== LAMBDA RESPONSE ===');
    console.log('Response body:', response.body);
    console.log('Summary length:', summary.length);
    console.log('Summary preview:', summary.substring(0, 100));
    console.log('======================');
    
    return response;
  } catch (err) {
    console.error('get-purchase-history error:', err);
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
