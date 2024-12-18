import { send_answer3 } from "../modules/tasks"
import OpenAI, { toFile } from 'openai';
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import fs from 'fs';
import { Readable } from 'stream';

const openai = new OpenAI();
let groq: Groq | undefined;

function askGpt(knowledge: string, question: string): Promise<string> {
    const systemMsg = `Respond to user question using your context. Respond shortly in one sentence, 
    but inslude as much detail as possible. Use specific names not general ones.

    <context>
    ${knowledge}
    </context>
    `
    
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: systemMsg
        },
        {
            role: "user",
            content: question
        }
    ];
    
    return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 16384,
        response_format: { type: "text" }
    }).then(completion => completion.choices[0].message.content || '')
    .catch(error => {
        console.error("Error in OpenAI completion:", error);
        throw error;
    });
}

async function fetchQuestionsToJson(url: string): Promise<Record<string, string>> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        
        // Split text into lines and filter out empty lines
        const lines = text.split('\n').filter(line => line.trim());
        
        // Create object from lines
        const result: Record<string, string> = {};
        for (const line of lines) {
            const [key, value] = line.split('=');
            if (key && value) {
                result[key.trim()] = value.trim();
            }
        }
        
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch and transform content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

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
        model: "gpt-4o-mini",
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

function processMediaJson(mediaDir: string, json: Record<string, string>): Promise<Record<string, string>> {
    const processingPromises = Object.entries(json).map(([key, value]) => {
        const processValue = value.toLowerCase().endsWith('.png') 
            ? describePng(mediaDir, value)
            : value.toLowerCase().endsWith('.mp3')
                ? transcribeMp3(mediaDir, value)
                : Promise.resolve(value);
                
        return processValue.then(processedValue => [key, processedValue] as [string, string]);
    });

    return Promise.all(processingPromises)
        .then(results => Object.fromEntries(results));
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

export function processContent(jsonData: Record<string, string>, markdownContent: string): string {
    let processedContent = markdownContent;

    for (const [key, value] of Object.entries(jsonData)) {
        if (processedContent.includes(key)) {
            let replacementValue = value;

            // Add appropriate tags based on file type in the key
            if (key.toLowerCase().includes('.mp3')) {
                replacementValue = `<opis pliku audio>${value}</opis pliku audio>`;
            } else if (key.toLowerCase().includes('.png')) {
                replacementValue = `<opis obrazka>${value}</opis obrazka>`;
            }

            // Replace the key with the processed value
            processedContent = processedContent.replace(key, replacementValue);
        }
    }

    return processedContent;
}

async function processJsonWithGpt(knowledge: string, input: Record<string, string>): Promise<Record<string, string>> {
    // Create array of promises for each key-value pair
    const entries = Object.entries(input);
    const promises = entries.map(([key, value]) => {
        return askGpt(knowledge, value).then(newValue => [key, newValue] as [string, string]);
    });

    // Wait for all promises to resolve
    const resolvedEntries = await Promise.all(promises);

    // Convert back to object
    return Object.fromEntries(resolvedEntries);
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

    const questions = await fetchQuestionsToJson(url + "/data/" + taskKey + "/arxiv.txt");
    console.log("Questions: ", questions);
    
    const attachments = extractMarkdownAttachments(mdPage);
    // console.log("Attachments found:", attachments);
    
    const describedattachments = await processMediaJson(url + "dane/", attachments)
    // console.log("Described attachments found:", describedattachments);

    // Process the content with the new function
    const finalContent = processContent(describedattachments, mdPage);
    // console.log("Final processed content:", finalContent);

    const responses = await processJsonWithGpt(finalContent, questions)
    console.log("Question responses:", responses);

    await send_answer3("arxiv", responses);
}

main().catch(console.error);
