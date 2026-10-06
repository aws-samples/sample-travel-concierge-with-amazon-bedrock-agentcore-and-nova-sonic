/**
 * AgentCore Gateway Custom Resource Handler (Node.js)
 *
 * Handles Create/Update/Delete operations for AgentCore Gateway
 * as a CloudFormation Custom Resource.
 *
 * Ported from Python handler.py to eliminate Docker dependency for bundling.
 */

import {
  BedrockAgentCoreControlClient,
  CreateGatewayCommand,
  GetGatewayCommand,
  DeleteGatewayCommand,
  ListGatewaysCommand,
  CreateGatewayTargetCommand,
  GetGatewayTargetCommand,
  DeleteGatewayTargetCommand,
  ListGatewayTargetsCommand,
  UpdateGatewayTargetCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';

import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  ListRolePoliciesCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand,
} from '@aws-sdk/client-iam';

import {
  APIGatewayClient,
  GetExportCommand,
} from '@aws-sdk/client-api-gateway';

const agentcoreClient = new BedrockAgentCoreControlClient();
const iamClient = new IAMClient();
const apigatewayClient = new APIGatewayClient();

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handler(event, context) {
  console.log(`RequestType: ${event.RequestType}`);

  try {
    const props = event.ResourceProperties;

    if (event.RequestType === 'Create') {
      const result = await createGateway(props);
      console.log('Create result:', JSON.stringify(result));
      return {
        PhysicalResourceId: result.gatewayId,
        Data: {
          GatewayId: result.gatewayId,
          GatewayUrl: result.gatewayUrl,
          GatewayArn: result.gatewayArn,
          GatewayRoleArn: result.gatewayRoleArn,
          TargetId: result.targetId,
          ApiGatewayId: result.apiGatewayId,
          ApiGatewayStage: result.apiGatewayStage,
          Region: result.region,
          AccountId: result.accountId,
          DeploymentTimestamp: result.deploymentTimestamp,
          ToolFiltersCount: String(result.toolFiltersCount),
          ToolOverridesCount: String(result.toolOverridesCount),
        },
      };

    } else if (event.RequestType === 'Update') {
      const gatewayId = event.PhysicalResourceId || 'not-created';
      const result = await updateGateway(gatewayId, props);
      return {
        PhysicalResourceId: gatewayId,
        Data: {
          GatewayId: result.gatewayId,
          GatewayUrl: result.gatewayUrl,
          GatewayArn: result.gatewayArn,
          GatewayRoleArn: result.gatewayRoleArn,
          TargetId: result.targetId,
          ApiGatewayId: result.apiGatewayId,
          ApiGatewayStage: result.apiGatewayStage,
          Region: result.region,
          AccountId: result.accountId,
          DeploymentTimestamp: result.deploymentTimestamp,
          ToolFiltersCount: String(result.toolFiltersCount),
          ToolOverridesCount: String(result.toolOverridesCount),
        },
      };

    } else if (event.RequestType === 'Delete') {
      const physicalResourceId = event.PhysicalResourceId || 'not-created';
      if (physicalResourceId !== 'not-created') {
        await deleteGateway(physicalResourceId, props);
      }
      return { PhysicalResourceId: physicalResourceId };
    }
  } catch (e) {
    console.error('Error:', e.message);
    throw e; // Let cr.Provider handle the error response
  }
}

// ─── Create Gateway ──────────────────────────────────────────────────────────

async function createGateway(props) {
  const gatewayName = props.GatewayName;
  const description = props.Description || 'Travel MCP Gateway';
  const apiGatewayId = props.ApiGatewayId;
  const stage = props.Stage;
  const region = props.Region;
  const accountId = props.AccountId;
  const knowledgeBaseId = props.KnowledgeBaseId;
  const knowledgeBaseArn = `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${knowledgeBaseId}`;

  console.log(`Creating Gateway: ${gatewayName}`);

  // Step 1: Create IAM role
  const roleName = `${gatewayName}-service-role`;
  const apiGatewayArn = `arn:aws:execute-api:${region}:${accountId}:${apiGatewayId}/${stage}/*/*`;
  const roleArn = await createGatewayServiceRole(roleName, apiGatewayArn, knowledgeBaseArn);

  // Wait for IAM propagation
  console.log('Waiting for IAM role propagation...');
  await sleep(10000);

  // Step 2: Fetch OpenAPI schema
  console.log(`Fetching OpenAPI schema from API Gateway ${apiGatewayId}...`);
  const schema = await fetchOpenApiSchema(apiGatewayId, stage);

  // Step 3: Parse schema for tool filters and overrides
  const { toolFilters, toolOverrides } = parseOpenApiSchema(schema);
  console.log(`Generated ${toolFilters.length} tool filters and ${toolOverrides.length} tool overrides`);

  // Step 4: Create Gateway
  console.log('Creating AgentCore Gateway...');
  let gatewayId;

  try {
    const resp = await agentcoreClient.send(new CreateGatewayCommand({
      name: gatewayName,
      description,
      authorizerType: 'AWS_IAM',
      protocolType: 'MCP',
      protocolConfiguration: {
        mcp: {
          supportedVersions: ['2025-03-26'],
          searchType: 'SEMANTIC',
          instructions: description,
        },
      },
      roleArn,
      exceptionLevel: 'DEBUG',
    }));

    gatewayId = resp.gatewayId || resp.gatewayIdentifier;
    if (!gatewayId) throw new Error(`Could not extract gateway ID from response`);
    console.log(`Gateway created: ${gatewayId}`);

  } catch (e) {
    if (e.name === 'ConflictException') {
      console.log(`Gateway ${gatewayName} already exists, retrieving...`);
      const listResp = await agentcoreClient.send(new ListGatewaysCommand({}));
      const existing = (listResp.items || []).find(g => g.name === gatewayName);
      if (!existing) throw new Error(`Gateway ${gatewayName} exists but could not be found`);
      gatewayId = existing.gatewayId || existing.gatewayIdentifier;
      console.log(`Using existing gateway: ${gatewayId}`);
    } else {
      throw e;
    }
  }

  // Fetch gateway details to get URL
  console.log('Fetching gateway details...');
  await sleep(2000);
  const getResp = await agentcoreClient.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
  const gatewayUrl = getResp.gatewayUrl;
  if (!gatewayUrl) throw new Error('Could not extract gateway URL');
  console.log(`Gateway URL: ${gatewayUrl}`);

  // Wait for gateway to be ready
  await waitForGatewayReady(gatewayId);

  // Step 5: Create API Gateway target
  console.log('Creating Gateway Target...');
  const targetPayload = {
    gatewayIdentifier: gatewayId,
    name: 'th-backend-api',
    description: 'Travel backend APIs exposed as MCP tools',
    targetConfiguration: {
      mcp: {
        apiGateway: {
          restApiId: apiGatewayId,
          stage,
          apiGatewayToolConfiguration: {
            toolFilters,
            toolOverrides,
          },
        },
      },
    },
    credentialProviderConfigurations: [
      { credentialProviderType: 'GATEWAY_IAM_ROLE' },
    ],
  };
  console.log('Target payload:', JSON.stringify(targetPayload, null, 2).substring(0, 2000));

  let targetResp;
  let targetId;
  try {
    targetResp = await agentcoreClient.send(new CreateGatewayTargetCommand(targetPayload));
    targetId = targetResp.targetIdentifier || targetResp.targetId;
    console.log(`Target created: ${targetId}`);
  } catch (targetErr) {
    if (targetErr.name === 'ConflictException' || targetErr.message?.includes('already exists')) {
      console.log('Target th-backend-api already exists, finding existing one...');
      const listResp = await agentcoreClient.send(new ListGatewayTargetsCommand({ gatewayIdentifier: gatewayId }));
      const existing = (listResp.items || []).find(t => t.name === 'th-backend-api');
      if (!existing) throw new Error('Target already exists but could not be found');
      targetId = existing.targetId || existing.targetIdentifier;
      console.log(`Reusing existing target: ${targetId}`);
    } else {
      console.error('CreateGatewayTarget error:', targetErr.message);
      throw targetErr;
    }
  }

  await waitForTargetReady(gatewayId, targetId);

  const gatewayArn = `arn:aws:bedrock:${region}:${accountId}:agent-gateway/${gatewayId}`;
  console.log(`Gateway deployment complete: ${gatewayUrl}`);

  return {
    gatewayId,
    gatewayUrl,
    gatewayArn,
    gatewayRoleArn: roleArn,
    targetId,
    apiGatewayId,
    apiGatewayStage: stage,
    region,
    accountId,
    deploymentTimestamp: new Date().toISOString(),
    toolFiltersCount: toolFilters.length,
    toolOverridesCount: toolOverrides.length,
  };
}

// ─── Update Gateway (delete target + recreate with fresh schema) ─────────────

async function updateGateway(gatewayId, props) {
  const apiGatewayId = props.ApiGatewayId;
  const stage = props.Stage;
  const region = props.Region;
  const accountId = props.AccountId;
  const gatewayName = props.GatewayName;
  const knowledgeBaseId = props.KnowledgeBaseId;
  const knowledgeBaseArn = `arn:aws:bedrock:${region}:${accountId}:knowledge-base/${knowledgeBaseId}`;

  console.log(`Updating Gateway: ${gatewayId}`);

  // Step 1: Get gateway details
  const getResp = await agentcoreClient.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
  const gatewayUrl = getResp.gatewayUrl;
  const gatewayArn = `arn:aws:bedrock:${region}:${accountId}:agent-gateway/${gatewayId}`;
  console.log(`Gateway URL: ${gatewayUrl}`);

  // Step 2: Update IAM role policy (in case API Gateway ARN or KB changed)
  const roleName = `${gatewayName}-service-role`;
  const apiGatewayArn = `arn:aws:execute-api:${region}:${accountId}:${apiGatewayId}/${stage}/*/*`;
  const roleArn = await createGatewayServiceRole(roleName, apiGatewayArn, knowledgeBaseArn);

  // Step 3: Update existing target with fresh schema (or create if none exists)
  console.log('Listing existing targets...');
  const listResp = await agentcoreClient.send(new ListGatewayTargetsCommand({ gatewayIdentifier: gatewayId }));
  const existingTargets = listResp.items || [];
  console.log(`Found ${existingTargets.length} existing target(s)`);

  // Step 4: Fetch fresh OpenAPI schema
  console.log(`Fetching OpenAPI schema from API Gateway ${apiGatewayId}...`);
  const schema = await fetchOpenApiSchema(apiGatewayId, stage);

  // Step 5: Parse schema for tool filters and overrides
  const { toolFilters, toolOverrides } = parseOpenApiSchema(schema);
  console.log(`Generated ${toolFilters.length} tool filters and ${toolOverrides.length} tool overrides`);

  const targetConfig = {
    mcp: {
      apiGateway: {
        restApiId: apiGatewayId,
        stage,
        apiGatewayToolConfiguration: {
          toolFilters,
          toolOverrides,
        },
      },
    },
  };

  let targetId;

  if (existingTargets.length > 0) {
    // Update existing target in place
    const existingTarget = existingTargets[0];
    targetId = existingTarget.targetId || existingTarget.targetIdentifier;
    console.log(`Updating existing target: ${targetId}`);

    await agentcoreClient.send(new UpdateGatewayTargetCommand({
      gatewayIdentifier: gatewayId,
      targetId,
      name: 'th-backend-api',
      description: 'Travel backend APIs exposed as MCP tools',
      targetConfiguration: targetConfig,
      credentialProviderConfigurations: [
        { credentialProviderType: 'GATEWAY_IAM_ROLE' },
      ],
    }));

    console.log(`Target ${targetId} update initiated`);
    await waitForTargetReady(gatewayId, targetId);
  } else {
    // No existing target — create new one
    console.log('No existing target, creating new one...');
    const targetResp = await agentcoreClient.send(new CreateGatewayTargetCommand({
      gatewayIdentifier: gatewayId,
      name: 'th-backend-api',
      description: 'Travel backend APIs exposed as MCP tools',
      targetConfiguration: targetConfig,
      credentialProviderConfigurations: [
        { credentialProviderType: 'GATEWAY_IAM_ROLE' },
      ],
    }));

    targetId = targetResp.targetIdentifier || targetResp.targetId;
    console.log(`New target created: ${targetId}`);
    await waitForTargetReady(gatewayId, targetId);
  }

  console.log(`Gateway update complete: ${gatewayUrl}`);

  return {
    gatewayId,
    gatewayUrl,
    gatewayArn,
    gatewayRoleArn: roleArn,
    targetId,
    apiGatewayId,
    apiGatewayStage: stage,
    region,
    accountId,
    deploymentTimestamp: new Date().toISOString(),
    toolFiltersCount: toolFilters.length,
    toolOverridesCount: toolOverrides.length,
  };
}

// ─── IAM Role ────────────────────────────────────────────────────────────────

async function createGatewayServiceRole(roleName, apiGatewayArn, knowledgeBaseArn) {
  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'bedrock-agentcore.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }],
  });

  const policyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 'execute-api:Invoke',
        Resource: apiGatewayArn,
      },
      {
        Effect: 'Allow',
        Action: [
          'bedrock:GetKnowledgeBase',
          'bedrock:Retrieve',
        ],
        Resource: knowledgeBaseArn,
      },
      {
        Effect: 'Allow',
        Action: 'bedrock:AgenticRetrieveStream',
        Resource: '*',
      },
    ],
  });

  try {
    const resp = await iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: trustPolicy,
      Description: 'Service role for AgentCore Gateway',
    }));
    const roleArn = resp.Role.Arn;
    console.log(`Created IAM role: ${roleArn}`);

    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'GatewayServicePolicy',
      PolicyDocument: policyDocument,
    }));

    return roleArn;
  } catch (e) {
    if (e.name === 'EntityAlreadyExistsException') {
      console.log(`Role ${roleName} exists, updating policy...`);
      const resp = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
      const roleArn = resp.Role.Arn;

      await iamClient.send(new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'GatewayServicePolicy',
        PolicyDocument: policyDocument,
      }));

      return roleArn;
    }
    throw e;
  }
}

// ─── OpenAPI Schema ──────────────────────────────────────────────────────────

async function fetchOpenApiSchema(apiGatewayId, stage) {
  const resp = await apigatewayClient.send(new GetExportCommand({
    restApiId: apiGatewayId,
    stageName: stage,
    exportType: 'oas30',
    accepts: 'application/json',
  }));

  // resp.body is a Uint8Array
  const bodyStr = new TextDecoder().decode(resp.body);
  return JSON.parse(bodyStr);
}

function parseOpenApiSchema(schema) {
  const toolFilters = [];
  const toolOverrides = [];

  if (!schema.paths) {
    console.log('Warning: No paths found in OpenAPI schema');
    return { toolFilters, toolOverrides };
  }

  // Rich tool descriptions so the agent knows exactly what parameters to send
  const TOOL_DESCRIPTIONS = {
    'PUT /seat/{bookingId}/{passengerId}': {
      name: 'UpdateSeat',
      description: 'Assign a new seat to a passenger, or find adjacent group seats. To assign: {"flightNumber": "SW2350", "date": "2026-10-10", "newSeat": "14B"}. To find adjacent seats for a group (does NOT assign — call again with newSeat per passenger to assign): {"action": "find-group-seats", "flightNumber": "SW2350", "date": "2026-10-10", "partySize": 3}.',
    },
    'PUT /passenger/{bookingId}/{passengerId}': {
      name: 'UpdatePassenger',
      description: 'Update passenger details. Request body requires JSON with "action" field. For meal: {"action": "meal", "mealPreference": "VEGETARIAN"} — valid values: REGULAR, VEGETARIAN, VEGAN, KOSHER, HALAL, GLUTEN_FREE. For baggage: {"action": "baggage", "extraChecked": 1}. For assistance: {"action": "assistance", "specialAssistance": ["WHEELCHAIR"]}.',
    },
    'PUT /preferences/{customerId}/{category}': {
      name: 'UpdatePreferences',
      description: 'Update customer preferences. Category must be one of: SEAT, MEAL, TRANSPORT, WIFI. Request body requires JSON: {"preferences": {"key": "value"}}.',
    },
    'GET /itinerary/{customerId}': {
      name: 'GetUpcomingItinerary',
      description: 'Get upcoming flight bookings (flight numbers, routes, dates, booking IDs) for a customer. Does NOT return seat assignments or meal preferences — use GetPassengerDetails for those.',
    },
    'GET /booking/{customerId}/{bookingId}': {
      name: 'GetBookingDetails',
      description: 'Get fare class, booking status, route, and pricing for a specific booking. Use when the customer asks about fare class or price. Does NOT return seat assignments or passenger details — use GetPassengerDetails for those.',
    },
    'GET /seatmap/{flightNumber}/{date}': {
      name: 'GetSeatMap',
      description: 'Get seat availability map for a specific flight and date — use to show available seats when the customer wants to browse or switch seats. Use flightNumber and date (YYYY-MM-DD) from GetUpcomingItinerary. Optional query parameter: seatType=AISLE, seatType=WINDOW, or seatType=MIDDLE to filter — always pass seatType when the customer asks for a specific type. Do NOT call this to look up the seat type of an already-assigned seat — you already know that from GetPassengerDetails.',
    },
    'GET /passengers/{bookingId}': {
      name: 'GetPassengerDetails',
      description: "Get passenger details for a booking: each passenger's current seat assignment, meal preference, booked extra bags, and special assistance. Use this for what THESE passengers currently have (their seats, their meals, their booked bags). Does NOT contain airline rules: baggage allowance, size, weight or fees, available meal options, fare rules, or any other policy. For those, query the policy knowledge base (th-policy-kb___Retrieve). Do NOT use GetUpcomingItinerary for seats or meals.",
    },
    'GET /loyalty/{customerId}': {
      name: 'GetLoyaltyStatus',
      description: 'Get customer loyalty tier, points balance, and benefits.',
    },
    'GET /upgrades/{bookingId}': {
      name: 'GetUpgradeOptions',
      description: 'Get available cabin upgrade options (e.g. Economy to Business) for a booking. Only requires bookingId — customerId is resolved automatically.',
    },
    'GET /purchases/{customerId}': {
      name: 'GetPurchaseHistory',
      description: 'Get customer ancillary purchase history (WiFi, baggage, upgrades) for upsell intelligence.',
    },
    'GET /preferences/{customerId}': {
      name: 'GetPreferences',
      description: 'Get learned customer preferences across all categories.',
    },
    'POST /conversation/{customerId}/{sessionId}': {
      name: 'SaveConversation',
      description: 'Save a conversation message for audit. Call this after EVERY user message and EVERY assistant response. Use a unique sessionId (UUID) per WebSocket session. Request body: {"role": "user" or "assistant", "content": "the message text", "customerName": "optional, include on first message only"}.',
    },
    'POST /escalate/{customerId}/{sessionId}': {
      name: 'EscalateToAgent',
      description: 'Transfer the conversation to a human agent. Use when: (1) customer explicitly asks to speak to a person, (2) request requires capabilities beyond available tools (refunds, cross-airline rebooking, lost baggage claims), (3) sensitive situations (medical, bereavement, complaints). Request body: {"reason": "why escalation is needed", "priority": "NORMAL|HIGH|URGENT", "context": "brief conversation summary", "customerName": "customer name"}. Returns a reference number and estimated wait time.',
    },
    'GET /flight-status/{flightNumber}/{date}': {
      name: 'GetFlightStatus',
      description: 'Get real-time flight status including delays, gate changes, and cancellations. Returns status (ON_TIME, DELAYED, CANCELLED, BOARDING, DEPARTED, ARRIVED), scheduled and estimated times, gate, terminal, and any alerts. Date format: YYYY-MM-DD — extract just the date part from the itinerary departureTime (e.g. "2026-10-10T14:30:00-05:00" → "2026-10-10").',
    },
    'GET /rebook-options/{customerId}/{bookingId}': {
      name: 'GetRebookOptions',
      description: 'Get alternative flight options for rebooking. Returns 2-3 flights on the same route with fare differences, seat availability counts, adjacent group seating options, and flight times. Use this BEFORE RebookFlight to present options to the customer.',
    },
    'PUT /rebook/{customerId}/{bookingId}': {
      name: 'RebookFlight',
      description: 'Rebook a flight to a new date/flight. Moves all passengers, releases old seats. Always include selectedSeats from GetRebookOptions — omitting it clears all seat assignments. Request body: {"newFlightNumber": "SW2351", "newDate": "2026-10-18", "newDepartureTime": "2026-10-18T17:15:00-05:00", "newArrivalTime": "2026-10-18T21:05:00-05:00", "fareDifference": 0, "selectedSeats": ["16A", "16B", "16C"]}.',
    },
  };

  const validMethods = ['get', 'post', 'put', 'delete', 'patch'];

  for (const [path, pathItem] of Object.entries(schema.paths)) {
    if (typeof pathItem !== 'object' || pathItem === null) continue;

    const methods = [];

    for (const method of validMethods) {
      if (pathItem[method]) {
        methods.push(method.toUpperCase());

        const operation = pathItem[method];
        const lookupKey = `${method.toUpperCase()} ${path}`;
        const richOverride = TOOL_DESCRIPTIONS[lookupKey];

        const operationId = richOverride?.name || operation.operationId || generateOperationId(path, method);
        const description = richOverride?.description || operation.summary || operation.description || undefined;

        const override = {
          name: operationId,
          path,
          method: method.toUpperCase(),
        };
        if (description) override.description = description;

        toolOverrides.push(override);
      }
    }

    if (methods.length > 0) {
      toolFilters.push({ filterPath: path, methods });
    }
  }

  return { toolFilters, toolOverrides };
}

function generateOperationId(path, method) {
  const parts = path.split('/').filter(p => p && !p.startsWith('{'));
  const camelCase = parts.map((p, i) => i > 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join('');
  return `${method}${camelCase.charAt(0).toUpperCase() + camelCase.slice(1)}`;
}

// ─── Wait Helpers ────────────────────────────────────────────────────────────

async function waitForGatewayReady(gatewayId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await agentcoreClient.send(new GetGatewayCommand({ gatewayIdentifier: gatewayId }));
    const status = resp.status || 'UNKNOWN';
    if (status === 'READY') { console.log('Gateway READY'); return; }
    if (['FAILED', 'DELETING', 'DELETED'].includes(status)) {
      throw new Error(`Gateway entered terminal state: ${status}`);
    }
    await sleep(2000);
  }
  throw new Error('Gateway did not become READY in time');
}

async function waitForTargetReady(gatewayId, targetId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await agentcoreClient.send(new GetGatewayTargetCommand({
      gatewayIdentifier: gatewayId,
      targetId,
    }));
    const status = resp.status || 'UNKNOWN';
    console.log(`Target status: ${status} (attempt ${i + 1}/${maxAttempts})`);
    if (status === 'READY') { console.log('Target READY'); return; }
    if (status === 'FAILED') {
      const reason = resp.statusReason || resp.failureReason || 'No reason provided';
      console.error(`Target FAILED. Reason: ${reason}`);
      console.error('Target response:', JSON.stringify(resp, null, 2).substring(0, 1000));
      throw new Error(`Target creation failed: ${reason}`);
    }
    await sleep(2000);
  }
  throw new Error('Target did not become READY in time');
}

// ─── Delete Gateway ──────────────────────────────────────────────────────────

async function deleteGateway(gatewayId, props) {
  console.log(`Deleting Gateway: ${gatewayId}`);

  try {
    // Step 1: Delete all targets
    console.log('Step 1: Discovering and deleting targets...');
    try {
      const listResp = await agentcoreClient.send(new ListGatewayTargetsCommand({ gatewayIdentifier: gatewayId }));
      const targets = listResp.items || [];
      console.log(`Found ${targets.length} target(s)`);

      for (const target of targets) {
        const tid = target.targetId || target.targetIdentifier;
        if (tid) {
          console.log(`Deleting target: ${tid}`);
          try {
            await agentcoreClient.send(new DeleteGatewayTargetCommand({ gatewayIdentifier: gatewayId, targetId: tid }));
            await waitForTargetDeletion(gatewayId, tid);
          } catch (e) { console.log(`Error deleting target ${tid}: ${e.message}`); }
        }
      }

      if (targets.length > 0) {
        console.log('Waiting for targets to dissociate...');
        await sleep(10000);
      }
    } catch (e) { console.log(`Error listing targets: ${e.message}`); }

    // Step 2: Delete gateway with retries
    console.log('Step 2: Deleting gateway...');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await agentcoreClient.send(new DeleteGatewayCommand({ gatewayIdentifier: gatewayId }));
        console.log(`Gateway deleted: ${gatewayId}`);
        break;
      } catch (e) {
        if (e.name === 'ResourceNotFoundException') { console.log('Gateway already deleted'); break; }
        if (attempt < 4) { console.log(`Retry ${attempt + 1}/4 in 10s...`); await sleep(10000); }
        else console.log(`Failed to delete gateway after 5 attempts: ${e.message}`);
      }
    }

    // Step 3: Delete IAM role
    console.log('Step 3: Deleting IAM role...');
    const gatewayName = props?.GatewayName;
    if (gatewayName) {
      await deleteIamRole(`${gatewayName}-service-role`);
    }
  } catch (e) {
    console.log(`Error in deletion: ${e.message}`);
  }
}

async function waitForTargetDeletion(gatewayId, targetId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await agentcoreClient.send(new GetGatewayTargetCommand({ gatewayIdentifier: gatewayId, targetId }));
      await sleep(2000);
    } catch (e) {
      if (e.name === 'ResourceNotFoundException') { console.log(`Target ${targetId} deleted`); return; }
      await sleep(2000);
    }
  }
}

async function deleteIamRole(roleName) {
  try {
    // Delete inline policies
    try {
      const resp = await iamClient.send(new ListRolePoliciesCommand({ RoleName: roleName }));
      for (const policyName of resp.PolicyNames || []) {
        await iamClient.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }));
        console.log(`Deleted inline policy: ${policyName}`);
      }
    } catch (e) { /* ignore */ }

    // Detach managed policies
    try {
      const resp = await iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
      for (const policy of resp.AttachedPolicies || []) {
        await iamClient.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn }));
        console.log(`Detached policy: ${policy.PolicyName}`);
      }
    } catch (e) { /* ignore */ }

    await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
    console.log(`IAM role deleted: ${roleName}`);
  } catch (e) {
    if (e.name === 'NoSuchEntityException') console.log(`IAM role ${roleName} already deleted`);
    else console.log(`Error deleting IAM role: ${e.message}`);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
