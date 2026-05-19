import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends cdk.StackProps {
  functions: { [key: string]: lambda.Function };
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { functions } = props;

    this.api = new apigateway.RestApi(this, 'TravelApi', {
      restApiName: 'TH-TravelConciergeAPI',
      description: 'Travel Concierge - Backend API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
      deployOptions: { stageName: 'prod' },
    });

    const iamAuth = apigateway.AuthorizationType.IAM;

    // Helper for GET endpoints (no request body)
    const addGet = (resource: apigateway.IResource, fn: lambda.Function) => {
      resource.addMethod('GET', new apigateway.LambdaIntegration(fn), {
        authorizationType: iamAuth,
        methodResponses: [{ statusCode: '200', responseModels: { 'application/json': apigateway.Model.EMPTY_MODEL } }],
      });
    };

    // Helper for PUT/POST endpoints with request body schema
    const addWrite = (
      resource: apigateway.IResource,
      method: string,
      fn: lambda.Function,
      model: apigateway.IModel,
    ) => {
      resource.addMethod(method, new apigateway.LambdaIntegration(fn), {
        authorizationType: iamAuth,
        requestModels: { 'application/json': model },
        methodResponses: [{ statusCode: '200', responseModels: { 'application/json': apigateway.Model.EMPTY_MODEL } }],
      });
    };

    // ─── Request Body Models ─────────────────────────────────────────────────
    // These appear in the OpenAPI export so the MCP gateway can tell the agent
    // exactly what body parameters each tool expects.

    const updateSeatModel = this.api.addModel('UpdateSeatModel', {
      contentType: 'application/json',
      modelName: 'UpdateSeatRequest',
      description: 'Change a passenger seat or find group seats',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          flightNumber: { type: apigateway.JsonSchemaType.STRING, description: 'Flight number, e.g. AA2350' },
          date: { type: apigateway.JsonSchemaType.STRING, description: 'Flight date in YYYY-MM-DD format' },
          newSeat: { type: apigateway.JsonSchemaType.STRING, description: 'New seat number, e.g. 14B' },
          action: { type: apigateway.JsonSchemaType.STRING, description: 'Optional action: "find-group-seats" to search for adjacent seats' },
          partySize: { type: apigateway.JsonSchemaType.INTEGER, description: 'Number of adjacent seats needed (for find-group-seats action)' },
        },
        required: ['flightNumber', 'date'],
      },
    });

    const updatePassengerModel = this.api.addModel('UpdatePassengerModel', {
      contentType: 'application/json',
      modelName: 'UpdatePassengerRequest',
      description: 'Update passenger meal, baggage, or assistance',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          action: { type: apigateway.JsonSchemaType.STRING, description: 'Action type: "meal", "baggage", or "assistance"' },
          mealPreference: { type: apigateway.JsonSchemaType.STRING, description: 'Meal type for action=meal, e.g. VEGETARIAN, REGULAR, VEGAN, HALAL, KOSHER' },
          extraChecked: { type: apigateway.JsonSchemaType.INTEGER, description: 'Number of extra checked bags for action=baggage' },
          specialAssistance: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING },
            description: 'List of assistance needs for action=assistance, e.g. ["WHEELCHAIR", "VISUAL_AID"]',
          },
        },
        required: ['action'],
      },
    });

    const updatePreferencesModel = this.api.addModel('UpdatePreferencesModel', {
      contentType: 'application/json',
      modelName: 'UpdatePreferencesRequest',
      description: 'Update customer preferences for a category',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          preferences: {
            type: apigateway.JsonSchemaType.OBJECT,
            description: 'Key-value pairs of preferences to set',
          },
        },
        required: ['preferences'],
      },
    });

    const queryPolicyModel = this.api.addModel('QueryPolicyModel', {
      contentType: 'application/json',
      modelName: 'QueryPolicyRequest',
      description: 'Search the travel policy knowledge base',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          question: { type: apigateway.JsonSchemaType.STRING, description: 'Natural language question about travel policies' },
        },
        required: ['question'],
      },
    });

    // ─── Endpoints ───────────────────────────────────────────────────────────

    // --- Booking & Itinerary ---
    const itinerary = this.api.root.addResource('itinerary').addResource('{customerId}');
    addGet(itinerary, functions['get-upcoming-itinerary']);

    const booking = this.api.root.addResource('booking')
      .addResource('{customerId}')
      .addResource('{bookingId}');
    addGet(booking, functions['get-booking-details']);

    // --- Seat Management ---
    const seatmap = this.api.root.addResource('seatmap')
      .addResource('{flightNumber}')
      .addResource('{date}');
    addGet(seatmap, functions['get-seat-map']);

    const seat = this.api.root.addResource('seat')
      .addResource('{bookingId}')
      .addResource('{passengerId}');
    addWrite(seat, 'PUT', functions['update-seat'], updateSeatModel);

    // --- Passenger Details ---
    const passengers = this.api.root.addResource('passengers').addResource('{bookingId}');
    addGet(passengers, functions['get-passenger-details']);

    const passenger = this.api.root.addResource('passenger')
      .addResource('{bookingId}')
      .addResource('{passengerId}');
    addWrite(passenger, 'PUT', functions['update-passenger'], updatePassengerModel);

    // --- Loyalty & Upgrades ---
    const loyalty = this.api.root.addResource('loyalty').addResource('{customerId}');
    addGet(loyalty, functions['get-loyalty-status']);

    const upgrades = this.api.root.addResource('upgrades').addResource('{bookingId}');
    addGet(upgrades, functions['get-upgrade-options']);

    const purchases = this.api.root.addResource('purchases').addResource('{customerId}');
    addGet(purchases, functions['get-purchase-history']);

    // --- Preferences ---
    const preferences = this.api.root.addResource('preferences').addResource('{customerId}');
    addGet(preferences, functions['get-preferences']);

    const prefCategory = preferences.addResource('{category}');
    addWrite(prefCategory, 'PUT', functions['update-preferences'], updatePreferencesModel);

    // --- Policy KB ---
    const policy = this.api.root.addResource('policy').addResource('query');
    addWrite(policy, 'POST', functions['query-policy'], queryPolicyModel);

    // --- Conversation History (audit) ---
    const saveConversationModel = this.api.addModel('SaveConversationModel', {
      contentType: 'application/json',
      modelName: 'SaveConversationRequest',
      description: 'Save a conversation message for audit purposes',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          role: { type: apigateway.JsonSchemaType.STRING, description: 'Message role: "user" or "assistant"' },
          content: { type: apigateway.JsonSchemaType.STRING, description: 'The message text content' },
          customerName: { type: apigateway.JsonSchemaType.STRING, description: 'Customer name (optional, set on first message of session)' },
        },
        required: ['role', 'content'],
      },
    });

    const conversation = this.api.root.addResource('conversation')
      .addResource('{customerId}')
      .addResource('{sessionId}');
    addWrite(conversation, 'POST', functions['save-conversation'], saveConversationModel);

    // --- Escalation to Human Agent ---
    const escalateModel = this.api.addModel('EscalateToAgentModel', {
      contentType: 'application/json',
      modelName: 'EscalateToAgentRequest',
      description: 'Escalate conversation to a human agent',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          reason: { type: apigateway.JsonSchemaType.STRING, description: 'Why the escalation is needed, e.g. "Customer requests live agent", "Refund processing required", "Medical emergency"' },
          priority: { type: apigateway.JsonSchemaType.STRING, description: 'Priority level: NORMAL, HIGH, or URGENT' },
          context: { type: apigateway.JsonSchemaType.STRING, description: 'Brief summary of the conversation and what the customer needs' },
          customerName: { type: apigateway.JsonSchemaType.STRING, description: 'Customer name for the human agent' },
        },
        required: ['reason'],
      },
    });

    const escalate = this.api.root.addResource('escalate')
      .addResource('{customerId}')
      .addResource('{sessionId}');
    addWrite(escalate, 'POST', functions['escalate-to-agent'], escalateModel);

    // --- Flight Status ---
    const flightStatus = this.api.root.addResource('flight-status')
      .addResource('{flightNumber}')
      .addResource('{date}');
    addGet(flightStatus, functions['get-flight-status']);

    // --- Rebooking ---
    const rebookOptions = this.api.root.addResource('rebook-options')
      .addResource('{customerId}')
      .addResource('{bookingId}');
    addGet(rebookOptions, functions['get-rebook-options']);

    const rebookFlightModel = this.api.addModel('RebookFlightModel', {
      contentType: 'application/json',
      modelName: 'RebookFlightRequest',
      description: 'Rebook a flight to a new date/flight number',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          newFlightNumber: { type: apigateway.JsonSchemaType.STRING, description: 'New flight number, e.g. AA2351' },
          newDate: { type: apigateway.JsonSchemaType.STRING, description: 'New flight date in YYYY-MM-DD format' },
          newDepartureTime: { type: apigateway.JsonSchemaType.STRING, description: 'New departure time in ISO format (optional)' },
          newArrivalTime: { type: apigateway.JsonSchemaType.STRING, description: 'New arrival time in ISO format (optional)' },
          fareDifference: { type: apigateway.JsonSchemaType.NUMBER, description: 'Fare difference amount (positive = customer pays more, negative = credit)' },
          selectedSeats: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING },
            description: 'Array of seat numbers to assign to passengers in order, e.g. ["16A", "16B", "16C"]',
          },
        },
        required: ['newFlightNumber', 'newDate'],
      },
    });

    const rebookFlight = this.api.root.addResource('rebook')
      .addResource('{customerId}')
      .addResource('{bookingId}');
    addWrite(rebookFlight, 'PUT', functions['rebook-flight'], rebookFlightModel);

    // --- Outputs ---
    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: 'TH-ApiGatewayId',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: 'TH-ApiGatewayUrl',
    });
  }
}
