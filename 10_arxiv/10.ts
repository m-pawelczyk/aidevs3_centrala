import OpenAI, { toFile } from 'openai';
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import fs from 'fs';
import { Readable } from 'stream';

const openai = new OpenAI();
let groq: Groq | undefined;

function extractMarkdownAttachments(markdown: string): Record<string, string> {
    const attachments: Record<string, string> = {};
    
    // Match both ![](path) and [name](path) patterns
    const regex = /(!?\[[^\]]*\]\([^)]+\))/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
        const fullTag = match[1];
        // Extract the path from between parentheses
        const pathMatch = fullTag.match(/\(([^)]+)\)/);
        if (pathMatch) {
            const path = pathMatch[1];
            attachments[fullTag] = path;
        }
    }

    return attachments;
}

async function transformToImageUrlObjects(base64String: string) : Promise<any[]>{
    return [{
        type: "image_url",
        image_url: {
            url: `data:image/jpeg;base64,${base64String}`,
            detail: "high"
        }
    }];
};

async function askGptVision(visionMessage: any[]) : Promise<string> {
    const systemMessage = `You are very detailed picture scaner. Please describe what you see on image. 
    Your descriptions will be added as replacement of image in text so it have to be detailed but not 
    boring`
    const userMessage = {
                type: "text",
                text: "Describe picture in Polish."
            }
    const fullVisionMessage = [...visionMessage, userMessage];

    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: systemMessage
        },
        {
            role: "user",
            content: fullVisionMessage
        }
    ];
    
    return openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1024,
        response_format: { type: "text" }
    }).then(completion => completion.choices[0].message.content || '')
    .catch(error => {
        console.error("Error in OpenAI completion:", error);
        throw error;
    });
}

function describePng(mediaDir: string, relativePath: string): Promise<string> {
    return fetch(mediaDir + relativePath)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => Buffer.from(arrayBuffer))
        .then(buffer => buffer.toString('base64'))
        .then(base64String => transformToImageUrlObjects(base64String))
        .then(visionMessage => askGptVision(visionMessage));
}

async function transcribeGroq(audioBuffer: Buffer): Promise<string> {
    if (!groq) return Promise.reject(new Error('Groq client not initialized'));

    return groq.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.mp3'),
      language: 'pl',
      model: 'whisper-large-v3',
    }).then(transcription => transcription.text);
}

async function transcribeMp3(mediaDir: string, relativePath: string): Promise<string> {
    const filePath = mediaDir + relativePath;
    return fetch(filePath)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => Buffer.from(arrayBuffer))
        .then(buffer => transcribeGroq(buffer))
        .then(response => {
            console.log(`Transcribed ${filePath} successfully`);
            return response;
        })
        .catch(error => {
            console.error(`Error processing ${filePath}:`, error);
            throw error;
        });
}

async function processMediaJson(mediaDir: string, json: Record<string, string>
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(json)) {
        // Check file extension to determine which processor to use
        if (value.toLowerCase().endsWith('.png')) {
            result[key] = await describePng(mediaDir, value);
        } else if (value.toLowerCase().endsWith('.mp3')) {
            result[key] = await transcribeMp3(mediaDir, value);
        } else {
            // For any other file types, keep the original value
            result[key] = value;
        }
    }

    return result;
}

async function downloadHtml(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();;
    } catch (error) {
        throw new Error(`Failed to download HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey || !groqApiKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    groq = new Groq({
        apiKey: groqApiKey
    });

    const htmlPage = await downloadHtml(url + "/dane/arxiv-draft.html");
    const mdPage = NodeHtmlMarkdown.translate(htmlPage);
    
    // Extract attachments from markdown
    const attachments = extractMarkdownAttachments(mdPage);
    console.log("Attachments found:", attachments);
    
    const describedattachments = await processMediaJson(url + "dane/", attachments)
    console.log("Attachments found:", describedattachments);
}

main().catch(console.error);
