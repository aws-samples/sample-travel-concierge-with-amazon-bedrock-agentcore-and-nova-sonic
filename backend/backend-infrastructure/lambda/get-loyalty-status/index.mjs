import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const CUSTOMERS_TABLE = process.env.CUSTOMERS_TABLE;

const spaceOut = (s) => s.split("").join(" ");

// Lounge access rules by tier and card
const LOUNGE_ACCESS = {
  PLATINUM: { hasAccess: true, reason: 'Platinum tier benefit', guestPasses: 2 },
  GOLD: { hasAccess: false, reason: 'Gold tier — lounge access not included', guestPasses: 0 },
  SILVER: { hasAccess: false, reason: 'Silver tier — lounge access not included', guestPasses: 0 },
  BLUE: { hasAccess: false, reason: 'Base tier — lounge access not included', guestPasses: 0 },
};

const CARD_LOUNGE = {
  PREMIUM: { hasAccess: true, reason: 'Premium credit card benefit' },
  STANDARD: { hasAccess: false, reason: 'Standard card — no lounge access' },
};

export const handler = async (event) => {
  try {
    const { customerId } = event.pathParameters || {};
    if (!customerId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'customerId is required' }) };
    }

    const result = await ddb.send(new GetCommand({
      TableName: CUSTOMERS_TABLE,
      Key: { PK: `CUSTOMER#${customerId}`, SK: 'PROFILE' },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Customer not found',
          summary: 'I could not find your loyalty account. Could you verify your customer ID?',
        }),
      };
    }

    const { PK, SK, ...customer } = result.Item;
    const tier = customer.loyaltyTier || 'BLUE';
    const cardTier = customer.creditCardTier || 'STANDARD';

    const tierLounge = LOUNGE_ACCESS[tier] || LOUNGE_ACCESS.BLUE;
    const cardLounge = CARD_LOUNGE[cardTier] || CARD_LOUNGE.STANDARD;
    const loungeAccess = tierLounge.hasAccess || cardLounge.hasAccess;

    // Build speech-friendly summary
    const points = (customer.loyaltyPoints || 0).toLocaleString('en-US');
    const tierName = tier.charAt(0) + tier.slice(1).toLowerCase();
    let summary = `You are a ${tierName} tier member with ${points} points.`;
    if (loungeAccess) {
      summary += ' You have lounge access at departure airports.';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        customerId,
        customerName: customer.name || '',
        loyaltyTier: tier,
        loyaltyPoints: customer.loyaltyPoints || 0,
        creditCardTier: cardTier,
        loungeAccess,
        loungeReason: loungeAccess ? (tierLounge.hasAccess ? tierLounge.reason : cardLounge.reason) : tierLounge.reason,
        guestPasses: tierLounge.guestPasses || 0,
      }),
    };
  } catch (err) {
    console.error('get-loyalty-status error:', err);
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
