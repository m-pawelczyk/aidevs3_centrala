import { send_answer3 } from "../modules/tasks"
import OpenAI from "openai";
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
        const extension = path.extname(file).slice(1); // Remove the dot from extension
        if (extension) {
            if (!result[extension]) {
                result[extension] = [];
            }
            // Include the directory path with the filename
            const fullPath = path.join(directoryPath, file);
            result[extension].push(fullPath);
        }
    });

    return result;
}

interface FileData {
    png?: string[];
    mp3?: string[];
    txt?: string[];
}

interface ProcessingResult {
    [key: string]: any;
}

async function mp3ToCategory(filePath: string): Promise<any> {
    const transcription = await transcribeAudioFile(filePath);
    const category = txtToCategory(filePath, transcription);
    return { [filePath]: category };
}

async function transcribeAudioFile(filePath: string) {
    try {
        const response = await transcribeGroq(filePath);
        console.log(`Transcribed ${filePath} successfully`);
        return response;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        throw error;
    }
}

async function transcribeGroq(filePath: string): Promise<string> {
    if (!groq) throw new Error('Groq client not initialized');

    const fileStream = fs.createReadStream(filePath);
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      language: 'pl',
      model: 'whisper-large-v3',
    });
    return transcription.text;
}

async function txtToCategory(filePath: string, content: string): Promise<any> {
    const systemMessage = `
        You are advanced researcher which is able to read content received from User and assign them 
        to categories. Your task is to assing content to categories: 

        people - information about captured people or traces of their presence
        hardware - information about repaired hardware defects
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

    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: systemMessage
            },
            { 
                role: "user", 
                content: content
            }
        ],
        model: "gpt-4",
    });

    return { [filePath]: completion.choices[0].message.content };
}

async function pngToCategory(filePath: string): Promise<any> {
    // Implementation to be added
    return { [filePath]: "png processed result" };
}

async function processFiles(input: Record<string, string[]>): Promise<ProcessingResult> {
    const results: ProcessingResult = {};
    
    // Create arrays of promises for each file type
    const promises: Promise<any>[] = [];
    
    // Process PNG files
    if (input.png) {
        const pngPromises = input.png.map(file => 
            pngToCategory(file).then(result => {
                Object.assign(results, result);
            })
        );
        promises.push(...pngPromises);
    }
    
    // Process MP3 files
    if (input.mp3) {
        const mp3Promises = input.mp3.map(file => 
            mp3ToCategory(file).then(result => {
                Object.assign(results, result);
            })
        );
        promises.push(...mp3Promises);
    }
    
    // Process TXT files
    if (input.txt) {
        const txtPromises = input.txt.map(file => 
            readFileContent(file)
                .then(content => txtToCategory(file, content))
                .then(result => {
                    Object.assign(results, result);
                })
        );
        promises.push(...txtPromises);
    }
    
    // Wait for all promises to resolve
    await Promise.all(promises);
    
    return results;
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey || !groqApiKey) {
        throw new Error('Environment variables are not set');
    }

    groq = new Groq({
        apiKey: groqApiKey
    });

    const groupedFiles = listFilesByExtension(path.join(__dirname, 'documents'));
    console.log('Files grouped by extension:', JSON.stringify(groupedFiles, null, 2));

    const results = await processFiles(groupedFiles);
    console.log('Processing results:', results);
}

main().catch(console.error);
