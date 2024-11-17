import { send_answer3 } from "../modules/tasks"
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import Groq from "groq-sdk";
import fs from 'fs';
import path from 'path';

const openai = new OpenAI();
let groq: Groq | undefined;

async function readFileContent(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function listFilesByExtension(directoryPath: string): Record<string, string[]> {
    const files = fs.readdirSync(directoryPath);
    const result: Record<string, string[]> = {};

    files.forEach(file => {
        const extension = path.extname(file).slice(1);
        if (extension) {
            if (!result[extension]) {
                result[extension] = [];
            }
            const fullPath = path.join(directoryPath, file);
            result[extension].push(fullPath);
        }
    });

    return result;
}

interface ProcessingResult {
    [key: string]: string;
}

async function mp3ToCategory(filePath: string): Promise<ProcessingResult> {
    return transcribeAudioFile(filePath)
        .then(transcription => txtToCategory(filePath, transcription));
}

async function transcribeAudioFile(filePath: string): Promise<string> {
    return transcribeGroq(filePath)
        .then(response => {
            console.log(`Transcribed ${filePath} successfully`);
            return response;
        })
        .catch(error => {
            console.error(`Error processing ${filePath}:`, error);
            throw error;
        });
}

async function transcribeGroq(filePath: string): Promise<string> {
    if (!groq) return Promise.reject(new Error('Groq client not initialized'));

    const fileStream = fs.createReadStream(filePath);
    return groq.audio.transcriptions.create({
      file: fileStream,
      language: 'pl',
      model: 'whisper-large-v3',
    }).then(transcription => transcription.text);
}

async function txtToCategory(filePath: string, content: string): Promise<ProcessingResult> {
    return openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: `
                    You are advanced researcher which is able to read content received from User and assign them 
                    to categories. Your task is to assing content to categories: 

                    people - information about captured people or traces of their presence, not interested 
                    when resque people are mentioned, but not found anyone
                    hardware - information about repaired hardware defects, not include when contain only software informations
                    not_known - other informations which cannot be assigned to "people" or "hardware"

                    Content will be mostly in Polish language. Please answer only with one word - category name. 

                    <examples>
                    U: Ludzie przechodzili tędy wczoraj.
                    A: people

                    U: Udało się przywrócić do działania ten komputer.
                    A: hardware

                    U: Trawa jest zielona.
                    A: not_known
                    </examples>
                `
            },
            { 
                role: "user", 
                content: content
            }
        ],
        model: "gpt-4o",
    }).then(completion => ({ [filePath]: completion.choices[0].message.content || 'not_known' }));
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
    const systemMessage = `You are very detailed OCR scaner. Please read text from documents and return 
    what user asked.`
    const userMessage = {
                type: "text",
                text: "Return report content an nothing else."
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

async function pngToCategory(filePath: string): Promise<ProcessingResult> {
    return fs.promises.readFile(filePath)
        .then(buffer => buffer.toString('base64'))
        .then(base64String => transformToImageUrlObjects(base64String))
        .then(visionMessage => askGptVision(visionMessage))
        .then(completion => txtToCategory(filePath, completion));
}

async function processFiles(input: Record<string, string[]>): Promise<ProcessingResult> {
    const allPromises: Promise<ProcessingResult>[] = [];
    
    if (input.png) {
        const pngPromises = input.png.map(file => pngToCategory(file));
        allPromises.push(...pngPromises);
    }
    
    if (input.mp3) {
        const mp3Promises = input.mp3.map(file => mp3ToCategory(file));
        allPromises.push(...mp3Promises);
    }
    
    if (input.txt) {
        const txtPromises = input.txt.map(file => 
            readFileContent(file)
                .then(content => txtToCategory(file, content))
        );
        allPromises.push(...txtPromises);
    }
    
    return Promise.all(allPromises)
        .then(resolvedResults => 
            resolvedResults.reduce((acc, result) => ({...acc, ...result}), {})
        );
}

interface OutputCategories {
    hardware: string[];
    people: string[];
}

function transformCategories(input: ProcessingResult): OutputCategories {
    const result: OutputCategories = {
        hardware: [],
        people: []
    };

    Object.entries(input).forEach(([path, category]) => {
        // Extract filename from path
        const filename = path.split('/').pop() || '';
        
        // Add filename to appropriate category array
        if (category === 'hardware') {
            result.hardware.push(filename);
        } else if (category === 'people') {
            result.people.push(filename);
        }
        // Ignore 'not_known' entries
    });

    return result;
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey || !groqApiKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    groq = new Groq({
        apiKey: groqApiKey
    });

    const groupedFiles = listFilesByExtension(path.join(__dirname, 'documents'));
    console.log('Files grouped by extension:', JSON.stringify(groupedFiles, null, 2));

    // Wait for the result to be available before sending
    const results = await processFiles(groupedFiles);
    console.log('Processing results:', results);
    
    const transformedResults = transformCategories(results);
    console.log('Transformed results:', transformedResults);
    
    // Now send the actual transformed results
    await send_answer3("kategorie", transformedResults);
}

main().catch(console.error);
