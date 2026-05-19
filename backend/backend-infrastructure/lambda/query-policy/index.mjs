import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({});
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;

const spaceOut = (s) => s.split("").join(" ");

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { question } = body;

    if (!question) {
      return { statusCode: 400, body: JSON.stringify({ error: 'question is required in body' }) };
    }

    if (!KNOWLEDGE_BASE_ID) {
      return { statusCode: 500, body: JSON.stringify({ error: 'KNOWLEDGE_BASE_ID not configured', summary: "I'm having trouble processing that request right now. Please try again or I can connect you with a live agent." }) };
    }

    const response = await client.send(new RetrieveAndGenerateCommand({
      input: { text: question },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/amazon.nova-lite-v1:0`,
        },
      },
    }));

    const answer = response.output?.text || 'I could not find an answer to that question in our policy documents.';

    // Extract source citations
    const citations = (response.citations || []).map(c => ({
      text: c.generatedResponsePart?.textResponsePart?.text,
      sources: (c.retrievedReferences || []).map(ref => ({
        content: ref.content?.text?.substring(0, 200),
        location: ref.location?.s3Location?.uri,
      })),
    }));

    // Use the KB response text directly as the summary (already human-readable)
    const summary = answer;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, question, answer, citations }),
    };
  } catch (err) {
    console.error('query-policy error:', err);
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
