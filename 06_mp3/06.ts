import { send_answer3 } from "../modules/tasks"
import Groq from "groq-sdk";
import OpenAI, { toFile } from "openai";
import * as fs from 'fs/promises'
import * as path from 'path'

const openai = new OpenAI();


interface LlamaResponse {
    content: string;
    error?: string;
}

interface OllamaApiResponse {
    response: string;
}

async function loadTranscriptions(): Promise<string> {
    const transcriptionsDir = path.join(__dirname, 'transcriptions');
    const files = await fs.readdir(transcriptionsDir);
    const txtFiles = files.filter(file => file.endsWith('.txt'));
    
    let result = '';
    
    for (const file of txtFiles) {
        const content = await fs.readFile(path.join(transcriptionsDir, file), 'utf-8');
        const name = file.replace('.txt', '');
        result += `${name}: ${content}\n\n`;
    }
    
    return result.trim();
}

async function isTranscriptionNeeded(): Promise<boolean> {
    const transcriptionsDir = path.join(__dirname, 'transcriptions');
    
    try {
        const files = await fs.readdir(transcriptionsDir);
        return files.length === 0;
    } catch (error) {
        // Directory doesn't exist
        return true;
    }
}

async function transcribeAudioFiles(groq: Groq) {
    const recordingsDir = path.join(__dirname, 'recordings');
    const transcriptionsDir = path.join(__dirname, 'transcriptions');

    // Ensure transcriptions directory exists
    try {
        await fs.access(transcriptionsDir);
    } catch {
        await fs.mkdir(transcriptionsDir);
    }

    // Read all files in recordings directory
    const files = await fs.readdir(recordingsDir);
    const m4aFiles = files.filter(file => file.endsWith('.m4a'));

    for (const file of m4aFiles) {
        const audioPath = path.join(recordingsDir, file);
        const transcriptionPath = path.join(
            transcriptionsDir, 
            file.replace('.m4a', '.txt')
        );

        // Read audio file as base64
        const audioBuffer = await fs.readFile(audioPath);

        try {
            const response = await transcribeGroq(groq, audioBuffer)

            // const result = await response.json();
            await fs.writeFile(transcriptionPath, response);
            console.log(`Transcribed ${file} successfully`);
        } catch (error) {
            console.error(`Error processing ${file}:`, error);
        }
    }
}

async function transcribeGroq(groq: Groq, audioBuffer: Buffer): Promise<string> {
    const transcription = await groq.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'speech.mp3'),
      language: 'pl',
      model: 'whisper-large-v3',
    });
    return transcription.text;
}

async function getAnswerFromAI(content: string): Promise<string> {
    const systemMessage = `Jesteś śledczym, który musi odpowiedzieć na jedno pytanie: 
    "Na jakiej ulicy znajduje się uczelnia, na której wykłada Andrzej Maj?" To jest twój jedyny cel. 
    Jako odpowiedz podja tylko nazwę ulicy i nic więcej.

    W konktekście otrzymałeś zeznania świadków. Zastanów się nad nimi dokładnie. Pomyśl głośno zanim 
    udzielisz odpowiedz. Pamiętaj, ze przy tej ulicy musi znajdować się uczelnia, w której pracuje 
    Andrzej Maj. W kontekście masz wskazówki. 
    
    <context>
    ${content}
    </context>
    `

    const completion = await openai.chat.completions.create({
        messages: [
            { 
                role: "system", 
                content: systemMessage
            },
            { 
                role: "user", 
                content 
            }
        ],
        model: "gpt-4",
    });

    const answer = completion.choices[0].message.content;
    if (!answer) {
        throw new Error("AI response content is null or undefined");
    }
    return answer;
}

async function main() {
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const ollamaUrl = process.env.LOCAL_OLLAMA_URL;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey || !ollamaUrl || !groqApiKey) {
        throw new Error('Environment variables are not set');
    }

    if (await isTranscriptionNeeded()) {
        console.log("We have to run transcriptions with Groq");
        const groq = new Groq({
            apiKey: groqApiKey
        });
        await transcribeAudioFiles(groq);
    }

    const transcriptions = await loadTranscriptions();
    console.log(transcriptions);

    
    const street = await getAnswerFromAI(transcriptions);
    console.log('Street file:', street);    
    

    await send_answer3("mp3", street)
}

main().catch(console.error);
