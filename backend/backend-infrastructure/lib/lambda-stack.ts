import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaStackProps extends cdk.StackProps {
  tables: {
    customers: dynamodb.Table;
    bookings: dynamodb.Table;
    seatMap: dynamodb.Table;
    passengers: dynamodb.Table;
    purchaseHistory: dynamodb.Table;
    preferences: dynamodb.Table;
    conversations: dynamodb.Table;
    flightStatus: dynamodb.Table;
  };
}

export class LambdaStack extends cdk.Stack {
  public readonly functions: { [key: string]: lambda.Function };

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { tables } = props;
    this.functions = {};

    const lambdaDir = path.join(__dirname, '../lambda');

    // SES sender email — used for itinerary change notifications
    // Note: The SES email identity must be verified separately (done via deploy-all.sh).
    // We don't create it in CDK because SES identities are account-level singletons
    // and will fail if the identity already exists from a previous deployment.
    const senderEmail = new cdk.CfnParameter(this, 'SenderEmail', {
      type: 'String',
      default: '',
      description: 'Verified SES sender email for itinerary change notifications. If empty, email notifications are disabled.',
    });

    const companyName = new cdk.CfnParameter(this, 'CompanyName', {
      type: 'String',
      default: 'Travel Concierge',
      description: 'Company name used in email notifications.',
    });

    const supportPhone = new cdk.CfnParameter(this, 'SupportPhone', {
      type: 'String',
      default: '',
      description: 'Support phone number dialed when customer requests a live agent (e.g. +18005551234). If empty, the call button is hidden.',
    });

    // Common env vars for update functions that send emails
    const emailEnvVars = {
      CUSTOMERS_TABLE: tables.customers.tableName,
      BOOKINGS_TABLE: tables.bookings.tableName,
      PASSENGERS_TABLE: tables.passengers.tableName,
      SENDER_EMAIL: senderEmail.valueAsString,
      COMPANY_NAME: companyName.valueAsString,
    };

    // Helper to create a Lambda function
    const createFn = (name: string, envVars: Record<string, string> = {}): lambda.Function => {
      const fn = new lambda.Function(this, name, {
        functionName: `TH-${name}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(lambdaDir, name)),
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: envVars,
      });
      this.functions[name] = fn;
      return fn;
    };

    // --- Booking & Itinerary ---
    const getItinerary = createFn('get-upcoming-itinerary', {
      BOOKINGS_TABLE: tables.bookings.tableName,
    });
    tables.bookings.grantReadData(getItinerary);

    const getBooking = createFn('get-booking-details', {
      BOOKINGS_TABLE: tables.bookings.tableName,
    });
    tables.bookings.grantReadData(getBooking);

    // --- Seat Management ---
    const getSeatMap = createFn('get-seat-map', {
      SEATMAP_TABLE: tables.seatMap.tableName,
    });
    tables.seatMap.grantReadData(getSeatMap);

    const updateSeat = createFn('update-seat', {
      ...emailEnvVars,
      SEATMAP_TABLE: tables.seatMap.tableName,
    });
    tables.seatMap.grantReadWriteData(updateSeat);
    tables.passengers.grantReadWriteData(updateSeat);
    tables.customers.grantReadData(updateSeat);
    tables.bookings.grantReadData(updateSeat);
    updateSeat.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // --- Passenger Details ---
    const getPassengers = createFn('get-passenger-details', {
      PASSENGERS_TABLE: tables.passengers.tableName,
      BOOKINGS_TABLE: tables.bookings.tableName,
    });
    tables.passengers.grantReadData(getPassengers);
    tables.bookings.grantReadData(getPassengers);

    const updatePassenger = createFn('update-passenger', {
      ...emailEnvVars,
    });
    tables.passengers.grantReadWriteData(updatePassenger);
    tables.customers.grantReadData(updatePassenger);
    tables.bookings.grantReadData(updatePassenger);
    updatePassenger.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // --- Loyalty & Upgrades ---
    const getLoyalty = createFn('get-loyalty-status', {
      CUSTOMERS_TABLE: tables.customers.tableName,
    });
    tables.customers.grantReadData(getLoyalty);

    const getUpgrades = createFn('get-upgrade-options', {
      BOOKINGS_TABLE: tables.bookings.tableName,
      SEATMAP_TABLE: tables.seatMap.tableName,
    });
    tables.bookings.grantReadData(getUpgrades);
    tables.seatMap.grantReadData(getUpgrades);

    const getPurchases = createFn('get-purchase-history', {
      PURCHASE_HISTORY_TABLE: tables.purchaseHistory.tableName,
    });
    tables.purchaseHistory.grantReadData(getPurchases);

    // --- Preferences ---
    const getPrefs = createFn('get-preferences', {
      PREFERENCES_TABLE: tables.preferences.tableName,
    });
    tables.preferences.grantReadData(getPrefs);

    const updatePrefs = createFn('update-preferences', {
      PREFERENCES_TABLE: tables.preferences.tableName,
      ...emailEnvVars,
    });
    tables.preferences.grantReadWriteData(updatePrefs);
    tables.customers.grantReadData(updatePrefs);
    updatePrefs.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // --- Conversation History (audit) ---
    const saveConversation = createFn('save-conversation', {
      CONVERSATIONS_TABLE: tables.conversations.tableName,
    });
    tables.conversations.grantReadWriteData(saveConversation);

    // --- Escalation to Human Agent ---
    const escalateToAgent = createFn('escalate-to-agent', {
      CONVERSATIONS_TABLE: tables.conversations.tableName,
      SUPPORT_PHONE: supportPhone.valueAsString,
    });
    tables.conversations.grantReadWriteData(escalateToAgent);

    // --- Flight Status ---
    const getFlightStatus = createFn('get-flight-status', {
      FLIGHT_STATUS_TABLE: tables.flightStatus.tableName,
    });
    tables.flightStatus.grantReadData(getFlightStatus);

    // --- Rebooking ---
    const getRebookOptions = createFn('get-rebook-options', {
      FLIGHT_STATUS_TABLE: tables.flightStatus.tableName,
      SEATMAP_TABLE: tables.seatMap.tableName,
      BOOKINGS_TABLE: tables.bookings.tableName,
    });
    tables.flightStatus.grantReadData(getRebookOptions);
    tables.seatMap.grantReadData(getRebookOptions);
    tables.bookings.grantReadData(getRebookOptions);

    const rebookFlight = createFn('rebook-flight', {
      ...emailEnvVars,
      SEATMAP_TABLE: tables.seatMap.tableName,
    });
    tables.bookings.grantReadWriteData(rebookFlight);
    tables.passengers.grantReadWriteData(rebookFlight);
    tables.seatMap.grantReadWriteData(rebookFlight);
    tables.customers.grantReadData(rebookFlight);
    rebookFlight.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));

    // Export all function ARNs
    for (const [name, fn] of Object.entries(this.functions)) {
      new cdk.CfnOutput(this, `${name}Arn`, {
        value: fn.functionArn,
        description: `${name} Lambda ARN`,
      });
    }
  }
}
