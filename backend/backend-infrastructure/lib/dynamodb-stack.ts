import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDBStack extends cdk.Stack {
  public readonly tables: {
    customers: dynamodb.Table;
    bookings: dynamodb.Table;
    seatMap: dynamodb.Table;
    passengers: dynamodb.Table;
    purchaseHistory: dynamodb.Table;
    preferences: dynamodb.Table;
    conversations: dynamodb.Table;
    flightStatus: dynamodb.Table;
  };

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // TH-Customers: Customer profiles, loyalty info, travel documents
    // PK: CUSTOMER#{customerId}, SK: PROFILE
    const customersTable = new dynamodb.Table(this, 'CustomersTable', {
      tableName: 'TH-Customers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // TH-Bookings: Flight and hotel bookings with multi-passenger support
    // PK: CUSTOMER#{customerId}, SK: BOOKING#{bookingId}
    // GSI1: PK: FLIGHT#{flightNumber}#{date}, SK: CUSTOMER#{customerId}
    const bookingsTable = new dynamodb.Table(this, 'BookingsTable', {
      tableName: 'TH-Bookings',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    bookingsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // TH-SeatMap: Seat availability per flight
    // PK: FLIGHT#{flightNumber}#{date}, SK: SEAT#{seatNumber}
    const seatMapTable = new dynamodb.Table(this, 'SeatMapTable', {
      tableName: 'TH-SeatMap',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // TH-Passengers: Per-booking passenger details (meal, seat, baggage, assistance)
    // PK: BOOKING#{bookingId}, SK: PASSENGER#{passengerId}
    // GSI1: PK: CUSTOMER#{customerId}, SK: BOOKING#{bookingId}
    const passengersTable = new dynamodb.Table(this, 'PassengersTable', {
      tableName: 'TH-Passengers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    passengersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // TH-PurchaseHistory: Ancillary purchases for personalized upselling
    // PK: CUSTOMER#{customerId}, SK: PURCHASE#{timestamp}#{purchaseId}
    // GSI1: PK: CUSTOMER#{customerId}#CATEGORY#{category}, SK: PURCHASE#{timestamp}
    const purchaseHistoryTable = new dynamodb.Table(this, 'PurchaseHistoryTable', {
      tableName: 'TH-PurchaseHistory',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    purchaseHistoryTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // TH-Preferences: Learned customer preferences
    // PK: CUSTOMER#{customerId}, SK: PREF#{category}
    const preferencesTable = new dynamodb.Table(this, 'PreferencesTable', {
      tableName: 'TH-Preferences',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // TH-Conversations: Conversation history for audit purposes
    // PK: CUSTOMER#{customerId}, SK: SESSION#{sessionId}
    // Each item stores the full message array for one voice session
    const conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: 'TH-Conversations',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'ttl',
    });

    // TH-FlightStatus: Real-time flight status, delays, gate changes, cancellations
    // PK: FLIGHT#{flightNumber}#{date}, SK: STATUS
    const flightStatusTable = new dynamodb.Table(this, 'FlightStatusTable', {
      tableName: 'TH-FlightStatus',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // Store table references
    this.tables = {
      customers: customersTable,
      bookings: bookingsTable,
      seatMap: seatMapTable,
      passengers: passengersTable,
      purchaseHistory: purchaseHistoryTable,
      preferences: preferencesTable,
      conversations: conversationsTable,
      flightStatus: flightStatusTable,
    };

    // Stack Outputs
    const tableOutputs = [
      { table: customersTable, name: 'Customers' },
      { table: bookingsTable, name: 'Bookings' },
      { table: seatMapTable, name: 'SeatMap' },
      { table: passengersTable, name: 'Passengers' },
      { table: purchaseHistoryTable, name: 'PurchaseHistory' },
      { table: preferencesTable, name: 'Preferences' },
      { table: conversationsTable, name: 'Conversations' },
      { table: flightStatusTable, name: 'FlightStatus' },
    ];

    for (const { table, name } of tableOutputs) {
      new cdk.CfnOutput(this, `${name}TableName`, {
        value: table.tableName,
        description: `${name} table name`,
        exportName: `TH-${name}TableName`,
      });
      new cdk.CfnOutput(this, `${name}TableArn`, {
        value: table.tableArn,
        description: `${name} table ARN`,
        exportName: `TH-${name}TableArn`,
      });
    }
  }
}
