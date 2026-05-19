import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CognitoStackProps extends cdk.StackProps {
  // Parameters passed via --parameters during deploy
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props?: CognitoStackProps) {
    super(scope, id, props);

    // CDK Parameters (passed via --parameters during deploy)
    const userEmail = new cdk.CfnParameter(this, 'UserEmail', {
      type: 'String',
      description: 'Email for the test user (receives temporary password)',
    });

    const userName = new cdk.CfnParameter(this, 'UserName', {
      type: 'String',
      description: 'Full name for the test user',
    });

    // User Pool
    this.userPool = new cognito.UserPool(this, 'TravelUserPool', {
      userPoolName: 'TH-UserPool',
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      userInvitation: {
        emailSubject: 'Welcome to Travel Concierge — Your Account is Ready',
        emailBody: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0F2B46;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
    <h2 style="color:white;margin:0;font-size:22px">✈️ Travel Concierge</h2>
    <p style="color:#8BB8E8;margin:6px 0 0;font-size:14px">Your AI-Powered Flight Assistant</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px">
    <p style="color:#1a1a1a;font-size:16px;margin-top:0">Welcome aboard!</p>
    <p style="color:#333;font-size:15px">Your Travel Concierge account has been created. Use the credentials below to sign in:</p>
    <div style="background:#f0f9ff;border-left:4px solid #0066cc;padding:16px;margin:20px 0;border-radius:0 6px 6px 0">
      <p style="margin:0 0 8px;color:#333"><strong>Username:</strong> {username}</p>
      <p style="margin:0;color:#333"><strong>Temporary Password:</strong></p>
      <p style="margin:4px 0 0;font-family:monospace;font-size:16px;color:#0066cc;letter-spacing:1px">{####}</p>
    </div>
    <p style="color:#666;font-size:13px">You will be asked to set a new password on your first sign-in.</p>
    <hr style="border:none;border-top:1px solid #e8e8e8;margin:20px 0"/>
    <p style="color:#999;font-size:12px;margin-bottom:0">This is an automated message from Travel Concierge. Do not reply to this email.</p>
  </div>
</div>`,
      },
      customAttributes: {
        customerId: new cognito.StringAttribute({ mutable: false }),
        loyaltyTier: new cognito.StringAttribute({ mutable: true }),
      },
    });

    // App Client
    this.userPoolClient = this.userPool.addClient('TravelAppClient', {
      userPoolClientName: 'TH-AppClient',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Identity Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'TravelIdentityPool', {
      identityPoolName: 'TH-IdentityPool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Authenticated Role
    this.authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: 'TH-CognitoAuthRole',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Grant authenticated users permission to invoke AgentCore Runtime (including WebSocket streaming)
    this.authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock-agentcore:InvokeAgent',
          'bedrock-agentcore:InvokeAgentStream',
          'bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream',
        ],
        resources: ['*'],
      })
    );

    // Grant authenticated users permission to call API Gateway
    this.authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:*`],
      })
    );

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
      },
    });

    // Create test user (AppUser)
    const testUser = new cognito.CfnUserPoolUser(this, 'TestUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'AppUser',
      userAttributes: [
        { name: 'email', value: userEmail.valueAsString },
        { name: 'name', value: userName.valueAsString },
        { name: 'custom:customerId', value: 'CUST-001' },
        { name: 'custom:loyaltyTier', value: 'GOLD' },
      ],
      desiredDeliveryMediums: ['EMAIL'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'TH-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: 'TH-UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'TH-IdentityPoolId',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });

    new cdk.CfnOutput(this, 'AppUserEmail', {
      value: userEmail.valueAsString,
      description: 'Test user email',
    });
  }
}
