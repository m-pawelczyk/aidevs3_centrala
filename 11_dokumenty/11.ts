import { send_answer3 } from "../modules/tasks"
import OpenAI, { toFile } from 'openai';
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NodeHtmlMarkdown, NodeHtmlMarkdownOptions } from 'node-html-markdown'
import fs from 'fs';
import { Readable } from 'stream';
import path from 'path';

const openai = new OpenAI();
let groq: Groq | undefined;

async function askGpt(content: string): Promise<string> {
    const systemMsg = `Dla wiadomości użytkownika wygeneruj słowa kluczowe, które pozwola odnaleźć 
    podana treść w przyszłości. Słowa kluczowe wygeneruj w formie listy słów w mianowniku. Zwróć tylko 
    słowa kluczowe i nic więcej. Skorzystaj ze swojej wiedzy, dodać słowa kluczowe powiazane z przekazana treścia.
    Dodaj słowa kluczowe dotyczace miejsc.

    Wynik zwróć w formacie JSON. 

    Jeśli wiadomość dotyczy osoby zwróć jej dane w osobnym polu person
    Pole "tags" powinno być po prostu stringiem gdzie po przecinku będa wymienione słowa kluczowe.
    
    <example>
    U: Wczoraj pojechaliśmy z rodziną w góry.
    A: {"person": "", tags": "góry, rodzina"}

    U: Spotkałem Danutę Szczyglo, która była nauczycielem chemii.
    A: {"person": "Danuta Szczyglo", tags": "spotkanie, nauczyciel, chemia"} 

    U: Janusz posługuje się językiem JavaScript
    A: {"person": "Janusz", tags": "programista, JavaScript, web"} 
    </example>
    `
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMsg },
        { role: 'user', content: content}
    ];

    const completion = await openai.chat.completions.create({
        messages,
        model: 'gpt-4o-mini',
    });

    return completion.choices[0].message.content || '';
}

type FileData = {
    person: string;
    tags: string;
}

async function processAllTxtFiles(dataDir: string): Promise<Record<string, FileData>> {
    const result: Record<string, FileData> = {};
    
    // Get all files in the directory
    const files = await fs.promises.readdir(dataDir);
    const txtFiles = files.filter(file => path.extname(file) === '.txt');
    
    // Create array of promises for all file processing
    const filePromises = txtFiles.map(async (filename) => {
        const filePath = path.join(dataDir, filename);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const response = askGpt(content);
        return { filename, responsePromise: response };
    });
    
    // Wait for all file reading operations
    const fileResults = await Promise.all(filePromises);
    
    // Wait for all GPT responses
    const responses = await Promise.all(
        fileResults.map(async ({ filename, responsePromise }) => {
            const response = await responsePromise;
            result[filename] = JSON.parse(response);
        })
    );
    
    return result;
}

function transformJson(input: Record<string, FileData>): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [_, value] of Object.entries(input)) {
        if (value.person && value.person.trim() !== '') {
            result[value.person] = value.tags;
        }
    }
    
    return result;
}

function transformTagsJson(fileTagged: Record<string, FileData>, facts: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(fileTagged)) {
        let tags = value.tags;
        
        // Extract information from the key
        const keyMatch = key.match(/(\d{4}-\d{2}-\d{2})_report-(\d+)-sektor_([A-Z]\d)/);
        if (keyMatch) {
            const [_, date, reportNum, sector] = keyMatch;
            const keyInfo = `${date}, report ${reportNum}, sektor ${sector}`;
            tags = tags + ", " + keyInfo;
        }
        
        if (value.person && value.person.trim() !== '') {
            tags = tags + ", " + facts[value.person];
        }
        
        result[key] = tags;
    }
    
    return result;
}

function listDeletedFiles(): Record<string, string> {
    const factsDir = './11_dokumenty/data/facts';
    const result: Record<string, string> = {};
    
    const files = fs.readdirSync(factsDir);
    
    for (const file of files) {
        const content = fs.readFileSync(`${factsDir}/${file}`, 'utf-8');
        if (content.trim() !== 'entry deleted') {
            result[file] = content.trim();
        }
    }
    
    return result;
}

async function main() {
    // Get URL from environment variable and validate
    const url = process.env.CENTRALA_URL;
    const taskKey = process.env.TASKS_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!url || !taskKey || !groqApiKey) {
        return Promise.reject(new Error('Environment variables are not set'));
    }

    // const notDeletedFacts = listDeletedFiles();
    // // console.log("FACTS: ", notDeletedFacts);

    const taggedFiles = await processAllTxtFiles("./11_dokumenty/data")
    console.log("TAGGED: ", taggedFiles);
    const taggedFilesWithFacts = await processAllTxtFiles("./11_dokumenty/data/facts")
    console.log("TAGGED FACTS: ", taggedFilesWithFacts);

    const transformedFactsFiles = transformJson(taggedFilesWithFacts);
    // console.log("FACTS: ", transformedTaggedFiles);

    const result =  transformTagsJson(taggedFiles, transformedFactsFiles);
    console.log("RESULT: ", result);

    await send_answer3("dokumenty", result);
}

main().catch(console.error);
