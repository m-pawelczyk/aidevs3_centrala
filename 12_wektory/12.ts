import { send_answer3 } from "../modules/tasks"
import OpenAI, { toFile } from 'openai';
import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const openai = new OpenAI();
let qdrant: QdrantClient;

async function createFileContentJson(): Promise<Record<string, string>> {
    const directoryPath = path.join(__dirname, 'do-not-share');
    const files = fs.readdirSync(directoryPath);
    
    const result: Record<string, string> = {};
    
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        result[file] = content;
    }
    
    return result;
}

interface Point {
    id?: string;
    text: string;
    metadata?: Record<string, any>;
}

interface QdrantSearchResult {
    id: string | number;
    version?: number;
    score: number;
    payload?: Record<string, unknown> | null;
    vector?: number[] | null;
}

async function addPoints(
    collectionName: string,
    points: Array<Point>
  ) {
    try {
        const pointsToUpsert = await Promise.all(
          points.map(async (point) => {
            const embedding = await openai.embeddings.create({
              input: point.text,
              model: "text-embedding-3-large"
            });

            return {
              id: point.id || uuidv4(),
              vector: embedding.data[0].embedding,
              payload: {
                text: point.text,
                ...point.metadata,
              },
            };
          })
        );

        await qdrant.upsert(collectionName, {
          wait: true,
          points: pointsToUpsert,
        });
    } catch (error) {
        console.error('Error adding points to Qdrant:', error);
        throw error;
    }
}

async function performSearch(
    query: string,
    limit: number = 5
  ): Promise<QdrantSearchResult[]> {
    const queryEmbedding = await openai.embeddings.create({
        input: query,
        model: "text-embedding-3-large"
      });
    const searchResults = await qdrant.search('aidevs_wektory', {
      vector: queryEmbedding.data[0].embedding,
      limit,
      with_payload: true,
    });
    return searchResults as unknown as QdrantSearchResult[];
  }

async function ensureCollection(name: string) {
    try {
        const exists = await qdrant.collectionExists(name);
        if (!exists.exists) {
            await qdrant.createCollection(name, {
                vectors: {
                    size: 3072, // Size for text-embedding-3-large
                    distance: "Cosine"
                }
            });
            console.log(`Created collection: ${name}`);
        }
    } catch (error) {
        console.error('Error ensuring collection exists:', error);
        throw error;
    }
}

async function processFileContents() {
    try {
        const fileContentJson = await createFileContentJson();
        console.log("FILES: ", fileContentJson);

        await ensureCollection('aidevs_wektory');
        
        for (const [fileName, content] of Object.entries(fileContentJson)) {
            await addPoints('aidevs_wektory', [{
                id: uuidv4(),
                text: content,
                metadata: {
                    fileName: fileName
                }
            }]);
        }
    } catch (error) {
        console.error('Error processing file contents:', error);
        throw error;
    }
}

function formatFileNameToDate(fileName: string): string {
    // Remove file extension
    const nameWithoutExtension = fileName.split('.').slice(0, -1).join('.');
    // Replace underscores with dashes
    return nameWithoutExtension.replace(/_/g, '-');
}

async function main() {
    try {
        // Get URL from environment variable and validate
        const url = process.env.CENTRALA_URL;
        const taskKey = process.env.TASKS_API_KEY;
        const qdrantUrl = process.env.QDRANT_URL;
        const qdrantKey = process.env.QDRANT_API_KEY;

        if (!url || !taskKey || !qdrantKey || !qdrantUrl) {
            throw new Error('Environment variables are not set');
        }

        qdrant = new QdrantClient({
            url: qdrantUrl,
            apiKey: qdrantKey,
        });

        // await processFileContents();

        const result = await performSearch("W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?", 1);
        console.log("RESULT: ", result);

        if (!result || result.length === 0 || !result[0].payload) {
            throw new Error('No search results found or invalid result structure');
        }

        const payload = result[0].payload;
        if (!('fileName' in payload) || typeof payload.fileName !== 'string') {
            throw new Error('Search result payload does not contain a valid fileName');
        }

        const formattedDate = formatFileNameToDate(payload.fileName);
        await send_answer3("wektory", formattedDate);
    } catch (error) {
        console.error('Error in main:', error);
        throw error;
    }
}

main().catch(console.error);
